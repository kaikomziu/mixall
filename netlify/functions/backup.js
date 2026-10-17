const crypto = require('crypto');
const zlib = require('zlib');
const { STORE_NAMES, getJSON, setJSON, deleteKey, listKeys } = require('../lib/store');
const { requireAdmin } = require('../lib/session');
const { enqueueBackgroundTask } = require('../lib/background-jobs');

const BACKUP_VERSION = 2;
const MAX_BACKUP_BYTES = 45 * 1024 * 1024;
const BACKUP_PAGE_SIZE = 12;
const BACKUP_SINGLE_ENTRY_STORES = new Set(['FILE_CHUNKS', 'ATTACHMENTS']);
const BACKUP_INDEX_STORE = 'netrify-backup-index';
const BACKUP_EXPORT_PREFIX = 'backup-export:';
const BACKUP_INDEX_PAGE_SIZE = 2000;
const BACKUP_RESPONSE_TARGET_BYTES = 1500 * 1024;
const BACKUP_FRAGMENT_BYTES = 1024 * 1024;
const BACKUP_SESSION_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const BACKUP_IMPORT_PROGRESS_PREFIX = 'backup-import-progress:';
const IMPORT_CLEAR_BATCH_SIZE = 100;
const IMPORT_WRITE_BATCH_SIZE = 12;
const IMPORT_CLEANUP_BATCH_SIZE = 32;
const IMPORT_MAX_STEPS_PER_REQUEST = 12;
const BACKGROUND_SLICE_MS = Math.min(9 * 60 * 1000, Math.max(1000, Number(process.env.BACKUP_BACKGROUND_SLICE_MS || 8 * 60 * 1000)));
const BACKUP_USER_JOB_PREFIX = 'backup-user-job:';
// Backgroundジョブは短命の実行状態で、バックアップ復元対象に含めると古い認証情報を復活させるため除外。
// AI変換表示は設定バージョンから再生成でき、個人向け表示文をバックアップへ混ぜないため除外。
const BACKUP_STORES = Object.keys(STORE_NAMES).filter((name) => !['AI_JOBS', 'MESSAGE_FILTER_CACHE'].includes(name));

function pageSizeFor(name) { return BACKUP_SINGLE_ENTRY_STORES.has(name) ? 1 : BACKUP_PAGE_SIZE; }
function json(status, body, extraHeaders = {}) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders }, body: JSON.stringify(body) };
}
function id() { return crypto.randomBytes(10).toString('hex'); }
function importKey(importId, suffix) { return `backup-import:${String(importId).replace(/[^a-zA-Z0-9_-]/g, '')}:${suffix}`; }
function importProgressKey(importId) { return `${BACKUP_IMPORT_PROGRESS_PREFIX}${String(importId).replace(/[^a-zA-Z0-9_-]/g, '')}`; }
function importPageKey(importId, name, page) { return importKey(importId, `store:${name}:${page}`); }
function importReceiptKey(importId, name, page) { return importKey(importId, `received:${name}:${page}`); }
function importAccessHash(token) { return crypto.createHash('sha256').update(String(token || '')).digest('hex'); }
function importAccountFallbackKey(importId, accountKey) {
  const hash = crypto.createHash('sha256').update(String(accountKey)).digest('hex');
  return importKey(importId, `account-fallback:${hash}`);
}
function exportKey(exportId, suffix) { return `${BACKUP_EXPORT_PREFIX}${String(exportId).replace(/[^a-zA-Z0-9_-]/g, '')}:${suffix}`; }
function userJobPrefix(email) { return `${BACKUP_USER_JOB_PREFIX}${crypto.createHash('sha256').update(String(email || '').toLowerCase()).digest('hex')}:`; }
function userJobKey(email, type, jobId) { return `${userJobPrefix(email)}${type}:${String(jobId).replace(/[^a-zA-Z0-9_-]/g, '')}`; }
async function registerUserJob(email, type, jobId) { await setJSON(BACKUP_INDEX_STORE, userJobKey(email, type, jobId), { email:String(email || '').toLowerCase(), type, jobId, createdAt:new Date().toISOString() }); }
async function removeUserJob(email, type, jobId) { await deleteKey(BACKUP_INDEX_STORE, userJobKey(email, type, jobId)); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function getJSONWithRetry(storeName, key, attempts = 6) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const value = await getJSON(storeName, key);
    if (value !== null && value !== undefined) return value;
    if (attempt + 1 < attempts) await sleep(Math.min(1600, 120 * (2 ** attempt)));
  }
  return null;
}

async function authorizeImportContinuation(importId, accessToken) {
  const normalizedId = String(importId || '');
  if (!/^[a-f0-9]{48}$/.test(normalizedId) || !/^[a-f0-9]{64}$/.test(String(accessToken || ''))) return null;
  const state = await getJSON(BACKUP_INDEX_STORE, importProgressKey(normalizedId));
  const meta = state ? null : await getJSON(BACKUP_INDEX_STORE, importKey(normalizedId, 'meta'));
  const record = state || meta;
  if (!record || !/^[a-f0-9]{64}$/.test(String(record.accessHash || ''))) return null;
  const startedAt = Date.parse(record.startedAt || record.createdAtServer || '');
  if (!Number.isFinite(startedAt) || Date.now() - startedAt > BACKUP_SESSION_MAX_AGE_MS) return null;
  const expected = Buffer.from(record.accessHash, 'hex');
  const actual = Buffer.from(importAccessHash(accessToken), 'hex');
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
  return { email: String(record.actorEmail || '') };
}

async function mapLimit(items, limit, callback) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await callback(items[index], index);
    }
  }));
  return results;
}

async function maintainRestoreSiteLock(actorEmail) {
  const current=await getJSON(STORE_NAMES.SITE_STATE,'global')||{};
  await setJSON(STORE_NAMES.SITE_STATE,'global',{...current,locked:true,lockedAt:current.lockedAt||new Date().toISOString(),lockedBy:actorEmail,message:'バックアップ復元後の確認中です。運営がロックを解除するまでサイトは保護されています。'});
}

async function readStore(storeName) {
  const keys = await listKeys(storeName);
  const entries = [];
  for (const key of keys) {
    const value = await getJSON(storeName, key);
    if (value !== null && value !== undefined) entries.push({ key, value });
  }
  return entries;
}

function createBackupInfo() {
  return {
    format: 'netrify-data-backup',
    version: BACKUP_VERSION,
    passwordData: 'passwordHashとsaltを含む。平文パスワードはシステムに保存されていないため出力されない。',
    security: 'このファイルにはログインセッション、APIキー等の秘密情報も含まれるため、運営管理者だけが安全な場所で保管すること。'
  };
}

async function cleanupBackupExport(exportId) {
  const keys = await listKeys(BACKUP_INDEX_STORE, exportKey(exportId, ''));
  for (const key of keys) await deleteKey(BACKUP_INDEX_STORE, key);
}

async function scheduleBackupCleanup(event, exportId) {
  const cleanId=String(exportId||'');
  if(!/^[a-f0-9]{20}$/.test(cleanId)) throw new Error('バックアップIDが不正です');
  const stateKey=`backup-cleanup:${cleanId}:state`;
  const state=await getJSON(BACKUP_INDEX_STORE,stateKey)||{exportId:cleanId,lastKey:'',createdAt:new Date().toISOString()};
  await setJSON(BACKUP_INDEX_STORE,stateKey,state);
  await enqueueBackgroundTask(event,'backup-cleanup',{cleanupExportId:cleanId});
  return {status:'queued'};
}

async function processBackupCleanup(payload) {
  const exportId=String(payload?.cleanupExportId||'');
  if(!/^[a-f0-9]{20}$/.test(exportId)) throw new Error('バックアップIDが不正です');
  const stateKey=`backup-cleanup:${exportId}:state`;
  const state=await getJSON(BACKUP_INDEX_STORE,stateKey)||{exportId,lastKey:''};
  const keys=(await listKeys(BACKUP_INDEX_STORE,exportKey(exportId,''))).filter((key)=>key>state.lastKey).sort().slice(0,32);
  if(!keys.length){await deleteKey(BACKUP_INDEX_STORE,stateKey);return {};}
  await mapLimit(keys,4,(key)=>deleteKey(BACKUP_INDEX_STORE,key));
  state.lastKey=keys[keys.length-1];state.updatedAt=new Date().toISOString();
  await setJSON(BACKUP_INDEX_STORE,stateKey,state);
  return {continue:true};
}

async function cleanupOldBackupExports(event) {
  const keys = await listKeys(BACKUP_INDEX_STORE, BACKUP_EXPORT_PREFIX);
  const exportIds = new Set(keys.map((key) => key.slice(BACKUP_EXPORT_PREFIX.length).split(':')[0]).filter(Boolean));
  const now = Date.now();
  for (const exportId of exportIds) {
    const meta = await getJSON(BACKUP_INDEX_STORE, exportKey(exportId, 'meta'));
    const job = await getExportJob(exportId);
    const createdAt = Date.parse(job?.createdAt || meta?.createdAt || '');
    if (!Number.isFinite(createdAt) || now - createdAt > BACKUP_SESSION_MAX_AGE_MS) {
      try { await scheduleBackupCleanup(event,exportId); }
      catch (error) { console.warn('failed to queue expired backup cleanup:',error); continue; }
      if (job?.actorEmail) await removeUserJob(job.actorEmail, 'export', exportId);
    }
  }
}

async function createBackupManifest() {
  const exportId = id();
  const indexedStores = await mapLimit(BACKUP_STORES, 4, async (name) => ({ name, keys: await listKeys(STORE_NAMES[name]) }));
  const stores = {};
  for (const { name, keys } of indexedStores) {
    const pageSize = pageSizeFor(name);
    stores[name] = {
      count: keys.length,
      pageSize,
      pages: Math.ceil(keys.length / pageSize),
      keyHash: crypto.createHash('sha256').update(keys.slice().sort().join('\n')).digest('hex')
    };
  }

  // インデックスは実データ用ストアと分離し、各データページで全キーを再走査しない。
  await setJSON(BACKUP_INDEX_STORE, exportKey(exportId, 'meta'), { exportId, createdAt: new Date().toISOString(), stores });
  for (const { name, keys } of indexedStores) {
    const indexPages = Math.ceil(keys.length / BACKUP_INDEX_PAGE_SIZE);
    for (let page = 0; page < indexPages; page += 1) {
      const selected = keys.slice(page * BACKUP_INDEX_PAGE_SIZE, (page + 1) * BACKUP_INDEX_PAGE_SIZE);
      await setJSON(BACKUP_INDEX_STORE, exportKey(exportId, `index:${name}:${page}`), selected);
    }
  }

  return {
    ...createBackupInfo(),
    format: 'netrify-data-backup-manifest',
    createdAt: new Date().toISOString(),
    exportId,
    pageSize: BACKUP_PAGE_SIZE,
    stores
  };
}

async function createBackupPage(exportId, name, offset, byteOffset = 0) {
  if (!BACKUP_STORES.includes(name)) throw new Error('不正なストア名です');
  const meta = await getJSON(BACKUP_INDEX_STORE, exportKey(exportId, 'meta'));
  if (!meta) throw new Error('バックアップセッションが見つかりません。最初からやり直してください');
  const sessionCreatedAt = Date.parse(meta.createdAt || '');
  if (!Number.isFinite(sessionCreatedAt) || Date.now() - sessionCreatedAt > BACKUP_SESSION_MAX_AGE_MS) {
    await cleanupBackupExport(exportId);
    throw new Error('バックアップセッションの有効期限が切れました。最初からやり直してください');
  }
  const startOffset = Number(offset);
  if (!Number.isInteger(startOffset) || startOffset < 0) throw new Error('取得位置が不正です');
  const storeInfo = meta.stores?.[name];
  const count = Number(storeInfo?.count || 0);
  if (!storeInfo || startOffset > count) throw new Error('指定されたバックアップ位置がありません');
  if (startOffset === count) return { page: { format:'netrify-data-backup-page', version:BACKUP_VERSION, store:name, offset:startOffset, nextOffset:startOffset, done:true, entries:[] } };

  let cachedIndexPage = -1;
  let cachedKeys = [];
  async function indexedKey(index) {
    const indexPage = Math.floor(index / BACKUP_INDEX_PAGE_SIZE);
    if (indexPage !== cachedIndexPage) {
      cachedKeys = await getJSON(BACKUP_INDEX_STORE, exportKey(exportId, `index:${name}:${indexPage}`));
      if (!Array.isArray(cachedKeys)) throw new Error('バックアップ索引が見つかりません。最初からやり直してください');
      cachedIndexPage = indexPage;
    }
    return cachedKeys[index % BACKUP_INDEX_PAGE_SIZE];
  }

  let nextOffset = startOffset;
  let responseBytes = 0;
  const entries = [];
  while (nextOffset < count) {
    const snapshot = await getJSON(BACKUP_INDEX_STORE, exportKey(exportId, `data:${name}:${nextOffset}`));
    let key; let value;
    if (snapshot) {
      if (!snapshot.found) { nextOffset += 1; continue; }
      key = snapshot.key; value = snapshot.value;
    } else {
      key = await indexedKey(nextOffset);
      if (typeof key !== 'string') { nextOffset += 1; continue; }
      value = await getJSON(STORE_NAMES[name], key);
      if (value === null || value === undefined) { nextOffset += 1; continue; }
    }
    const entry = { key, value };
    const serializedEntry = JSON.stringify(entry);
    const entryBytes = Buffer.byteLength(serializedEntry, 'utf8');

    if (entryBytes > BACKUP_RESPONSE_TARGET_BYTES) {
      if (entries.length) break;
      const parsedByteOffset = Number(byteOffset);
      if (!Number.isInteger(parsedByteOffset) || parsedByteOffset < 0 || parsedByteOffset >= entryBytes) throw new Error('大容量データの分割位置が不正です');
      const raw = Buffer.from(serializedEntry, 'utf8');
      const nextByteOffset = Math.min(parsedByteOffset + BACKUP_FRAGMENT_BYTES, raw.length);
      return {
        pageChunk: {
          format:'netrify-data-backup-entry-fragment', store:name, offset:startOffset,
          nextOffset:startOffset + 1, byteOffset:parsedByteOffset, nextByteOffset,
          totalBytes:raw.length, done:nextByteOffset >= raw.length,
          data:raw.subarray(parsedByteOffset, nextByteOffset).toString('base64')
        }
      };
    }
    if (entries.length && responseBytes + entryBytes > BACKUP_RESPONSE_TARGET_BYTES) break;
    entries.push(entry);
    responseBytes += entryBytes;
    nextOffset += 1;
    if (responseBytes >= BACKUP_RESPONSE_TARGET_BYTES) break;
  }
  return { page: { format:'netrify-data-backup-page', version:BACKUP_VERSION, store:name, offset:startOffset, nextOffset, done:nextOffset >= count, entries } };
}

async function createBackup() {
  const stores = {};
  for (const name of BACKUP_STORES) stores[name] = await readStore(STORE_NAMES[name]);
  const backup = { ...createBackupInfo(), createdAt: new Date().toISOString(), stores };
  const bytes = Buffer.byteLength(JSON.stringify(backup), 'utf8');
  if (bytes > MAX_BACKUP_BYTES) throw new Error('バックアップが45MBを超えています。manifest/chunk方式で分割出力してください。');
  return backup;
}

function validateBackup(backup, allowLarge = false) {
  if (!backup || backup.format !== 'netrify-data-backup' || ![1, BACKUP_VERSION].includes(backup.version) || !backup.stores) throw new Error('対応していないバックアップ形式です');
  const serialized = JSON.stringify(backup);
  if (!allowLarge && Buffer.byteLength(serialized, 'utf8') > MAX_BACKUP_BYTES) throw new Error('バックアップが45MBを超えています');
  for (const name of Object.keys(backup.stores)) {
    if (!BACKUP_STORES.includes(name)) throw new Error(`未対応のストアです: ${name}`);
    if (!Array.isArray(backup.stores[name])) throw new Error(`${name}の形式が不正です`);
  }
}

async function restoreBackup(backup, actorEmail, allowLarge = false) {
  validateBackup(backup, allowLarge);
  const restored = {};
  for (const name of BACKUP_STORES) {
    const entries = backup.stores[name];
    if (!entries) continue;
    const storeName = STORE_NAMES[name];
    const existingKeys = await listKeys(storeName);
    const existingAccounts = {};
    if (name === 'ACCOUNTS') for (const key of existingKeys) existingAccounts[key] = await getJSON(storeName, key);
    for (const key of existingKeys) await deleteKey(storeName, key);
    restored[name] = 0;
    for (const entry of entries) {
      if (!entry || typeof entry.key !== 'string' || entry.value === null || entry.value === undefined) continue;
      let value = entry.value;
      if (name === 'ACCOUNTS') {
        value = { ...value };
        if (!value.passwordHash || !value.salt) {
          const current = existingAccounts[entry.key];
          if (current?.passwordHash && current?.salt) {
            value.passwordHash = current.passwordHash;
            value.salt = current.salt;
            delete value.passwordResetRequired;
          } else value.passwordResetRequired = true;
        } else delete value.passwordResetRequired;
      }
      await setJSON(storeName, entry.key, value);
      restored[name]++;
    }
  }
  const audit = { kind: 'audit', id: id(), actorEmail, action: 'restoreBackup', targetType: 'backup', targetId: backup.createdAt, detail: '全ストア・パスワードハッシュを含む運営バックアップを復元。平文パスワードは保存対象外', createdAt: new Date().toISOString() };
  await setJSON(STORE_NAMES.ADMIN_AUDIT, `audit:${audit.id}`, audit);
  return restored;
}

async function initializeImportProgress(importId, actorEmail) {
  const stateKey = importProgressKey(importId);
  const existing = await getJSON(BACKUP_INDEX_STORE, stateKey);
  if (existing) return existing;
  const meta = await getJSON(BACKUP_INDEX_STORE, importKey(importId, 'meta'));
  if (!meta) throw new Error('復元セッションが見つかりません。ファイルを選び直してください');
  const createdAt = Date.parse(meta.createdAtServer || '');
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > BACKUP_SESSION_MAX_AGE_MS) throw new Error('復元セッションの有効期限が切れました。ファイルを選び直してください');

  const expectedPages = [];
  for (const [name, store] of Object.entries(meta.stores || {})) {
    for (let page = 0; page < Number(store.pages || 0); page += 1) expectedPages.push({ name, page });
  }
  const received = await mapLimit(expectedPages, 8, async ({ name, page }) =>
    (await getJSONWithRetry(BACKUP_INDEX_STORE, importReceiptKey(importId, name, page))) === true
  );
  if (received.some((ok) => !ok)) throw new Error('バックアップの一部ページが届いていません。最初から読み込み直してください');

  const state = {
    importId, actorEmail, phase: 'clear', status:'queued', storeIndex: 0, lastKey: '', page: 0, entry: 0,
    clearCount: 0, cleanedCount: 0, storeRestored: 0, stores: meta.stores || {},
    createdAt: meta.createdAt, accessHash: meta.accessHash, auditId: id(), restored: {}, startedAt: new Date().toISOString()
  };
  await setJSON(BACKUP_INDEX_STORE, stateKey, state);
  return state;
}

function importProgressResponse(state) {
  const storeName = BACKUP_STORES[state.storeIndex] || '';
  const storeMeta = state.stores?.[storeName] || {};
  const totalStores = Object.keys(state.stores || {}).length;
  const totalEntries = Object.values(state.stores || {}).reduce((sum, store) => sum + Number(store.count || 0), 0);
  const writtenEntries = Object.values(state.restored || {}).reduce((sum, count) => sum + Number(count || 0), 0);
  return {
    ok: true,
    done: state.phase === 'done',
    status: state.status || (state.phase === 'done' ? 'done' : 'running'),
    lastError: state.lastError || '',
    updatedAt: state.updatedAt || state.startedAt || '',
    ...(state.phase === 'done' ? { restored: state.restored } : {}),
    progress: {
      phase: state.phase, store: storeName, storeIndex: Math.min(state.storeIndex + 1, totalStores),
      storeTotal: totalStores, storeCount: Number(storeMeta.count || 0),
      storeRestored: Number(state.restored?.[storeName] || 0), clearCount: Number(state.clearCount || 0),
      cleanedCount: Number(state.cleanedCount || 0), writtenEntries, totalEntries
    }
  };
}

async function advanceImportCommit(importId, actorEmail) {
  const stateKey = importProgressKey(importId);
  const state = await initializeImportProgress(importId, actorEmail);
  if (state.phase === 'done') return importProgressResponse(state);

  for (let step = 0; step < IMPORT_MAX_STEPS_PER_REQUEST; step += 1) {
    if (state.phase === 'clear') {
      const name = BACKUP_STORES[state.storeIndex];
      if (!name) { state.phase = 'audit'; continue; }
      if (!Object.prototype.hasOwnProperty.call(state.stores, name)) {
        state.storeIndex += 1; state.lastKey = ''; state.clearCount = 0; continue;
      }
      const storeName = STORE_NAMES[name];
      const keys = (await listKeys(storeName)).filter((key) => key > state.lastKey && !(name === 'SITE_STATE' && key === 'global')).sort().slice(0, IMPORT_CLEAR_BATCH_SIZE);
      if (!keys.length) {
        state.phase = 'write'; state.page = 0; state.entry = 0; state.lastKey = ''; state.clearCount = 0; state.storeRestored = 0;
        state.restored[name] = 0;
        continue;
      }
      if (name === 'ACCOUNTS') {
        for (const key of keys) {
          const previous = await getJSON(storeName, key);
          if (previous) await setJSON(BACKUP_INDEX_STORE, importAccountFallbackKey(importId, key), previous);
        }
      }
      await mapLimit(keys, 4, (key) => deleteKey(storeName, key));
      state.lastKey = keys[keys.length - 1];
      state.clearCount += keys.length;
      break;
    }

    if (state.phase === 'write') {
      const name = BACKUP_STORES[state.storeIndex];
      if (!name) { state.phase = 'audit'; continue; }
      if (!Object.prototype.hasOwnProperty.call(state.stores, name)) {
        state.storeIndex += 1; state.phase = 'clear'; state.lastKey = ''; state.page = 0; state.entry = 0; continue;
      }
      const pageCount = Number(state.stores[name]?.pages || 0);
      if (state.page >= pageCount) {
        state.storeIndex += 1; state.phase = 'clear'; state.lastKey = ''; state.page = 0; state.entry = 0; state.storeRestored = 0; continue;
      }
      const entries = await getJSONWithRetry(BACKUP_INDEX_STORE, importPageKey(importId, name, state.page));
      if (!Array.isArray(entries)) throw new Error(`${name}の${state.page + 1}ページが見つかりません。読み込みをやり直してください`);
      if (state.entry >= entries.length) { state.page += 1; state.entry = 0; continue; }
      const batch = entries.slice(state.entry, state.entry + IMPORT_WRITE_BATCH_SIZE);
      let written = 0;
      for (const entry of batch) {
        if (!entry || typeof entry.key !== 'string' || entry.value === null || entry.value === undefined) continue;
        let value = entry.value;
        if (name === 'SITE_STATE' && entry.key === 'global') value = { ...value, locked:true, lockedAt:new Date().toISOString(), lockedBy:actorEmail||state.actorEmail, message:'バックアップ復元後の確認中です。運営がロックを解除するまでサイトは保護されています。' };
        if (name === 'ACCOUNTS') {
          value = { ...value };
          if (!value.passwordHash || !value.salt) {
            const previous = await getJSON(BACKUP_INDEX_STORE, importAccountFallbackKey(importId, entry.key));
            if (previous?.passwordHash && previous?.salt) {
              value.passwordHash = previous.passwordHash;
              value.salt = previous.salt;
              delete value.passwordResetRequired;
            } else value.passwordResetRequired = true;
          } else delete value.passwordResetRequired;
        }
        await setJSON(STORE_NAMES[name], entry.key, value);
        written += 1;
      }
      state.entry += batch.length;
      state.restored[name] = Number(state.restored[name] || 0) + written;
      state.storeRestored = Number(state.storeRestored || 0) + written;
      if (state.entry >= entries.length) { state.page += 1; state.entry = 0; }
      break;
    }

    if (state.phase === 'audit') {
      const audit = {
        kind: 'audit', id: state.auditId, actorEmail: state.actorEmail || actorEmail,
        action: 'restoreBackup', targetType: 'backup', targetId: state.createdAt,
        detail: '全ストア・パスワードハッシュを含む運営バックアップを復元。平文パスワードは保存対象外',
        createdAt: new Date().toISOString()
      };
      await setJSON(STORE_NAMES.ADMIN_AUDIT, `audit:${audit.id}`, audit);
      state.phase = 'cleanup'; state.lastKey = '';
      break;
    }

    if (state.phase === 'cleanup') {
      const prefix = importKey(importId, '');
      const keys = (await listKeys(BACKUP_INDEX_STORE, prefix)).filter((key) => key > state.lastKey).sort().slice(0, IMPORT_CLEANUP_BATCH_SIZE);
      if (!keys.length) { state.phase = 'done'; state.completedAt = new Date().toISOString(); break; }
      await mapLimit(keys, 4, (key) => deleteKey(BACKUP_INDEX_STORE, key));
      state.lastKey = keys[keys.length - 1];
      state.cleanedCount += keys.length;
      break;
    }

    if (state.phase === 'done') break;
    throw new Error('バックアップ復元状態が不正です。最初から読み込み直してください');
  }

  state.status = state.phase === 'done' ? 'done' : 'running';
  state.updatedAt = new Date().toISOString();
  await setJSON(BACKUP_INDEX_STORE, stateKey, state);
  return importProgressResponse(state);
}

async function saveExportJob(job) {
  job.updatedAt = new Date().toISOString();
  await setJSON(BACKUP_INDEX_STORE, exportKey(job.exportId, 'job'), job);
  return job;
}

async function getExportJob(exportId) {
  return getJSON(BACKUP_INDEX_STORE, exportKey(exportId, 'job'));
}

function zipU16(value) { return Buffer.from([value & 255, (value >>> 8) & 255]); }
function zipU32(value) { return Buffer.from([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]); }
function zipCrc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function zipTimestamp(date = new Date()) {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}
const SAFE_ARCHIVE_PART_BYTES = 3.5 * 1024 * 1024 * 1024;
async function appendArchiveBytes(job, bytes) {
  const chunkBytes = 768 * 1024;
  if (!Array.isArray(job.archiveParts)) job.archiveParts = [];
  for (let offset = 0; offset < bytes.length; offset += chunkBytes) {
    const part = bytes.subarray(offset, Math.min(bytes.length, offset + chunkBytes));
    const partNo = Number(job.archivePartNumber || 0);
    const chunkNo = Number(job.archivePartChunkCount || 0);
    await setJSON(BACKUP_INDEX_STORE, exportKey(job.exportId, `archive-part:${partNo}:chunk:${chunkNo}`), { data:part.toString('base64'), bytes:part.length });
    job.archivePartChunkCount = chunkNo + 1;
    job.archivePartBytes = Number(job.archivePartBytes || 0) + part.length;
  }
}
async function startArchivePart(job) {
  const partNo = Number(job.archivePartNumber || 0);
  job.archivePartChunkCount = 0; job.archivePartBytes = 0; job.archivePartOffset = 0;
  job.archivePartCentralCount = 0; job.archivePartCentralBytes = 0; job.archivePartCentralOffset = 0;
  const manifest = { format:'netrify-multipart-zip-backup', version:2, dataFormat:'netrify-data-backup', dataVersion:BACKUP_VERSION, backupId:job.exportId, partNumber:partNo+1, partCount:null, passwordData:createBackupInfo().passwordData, security:createBackupInfo().security, createdAt:job.createdAt, stores:Object.fromEntries(Object.entries(job.stores || {}).map(([name, info]) => [name,{count:Number(info.count || 0)}])) };
  await appendArchiveEntry(job, `backup/manifest.json`, Buffer.from(JSON.stringify(manifest),'utf8'), true);
  await appendArchiveEntry(job, `manifest.json`, Buffer.from(JSON.stringify(manifest),'utf8'), true);
}
async function finishArchivePart(job) {
  const count = Number(job.archivePartCentralCount || 0);
  if (count >= 65535 || Number(job.archivePartOffset || 0) > 0xffffffff || Number(job.archivePartCentralBytes || 0) > 0xffffffff) throw new Error('ZIPパートが標準ZIPの上限を超えました');
  const centralStart = Number(job.archivePartOffset || 0);
  let cursor = Number(job.archivePartCentralOffset || 0), written = 0;
  while (cursor < count) {
    const end = Math.min(count, cursor + 256); const batch=[];
    for(let index=cursor; index<end; index+=1){ const item=await getJSONWithRetry(BACKUP_INDEX_STORE, exportKey(job.exportId, `central:${job.archivePartNumber}:${index}`)); if(!item?.data) throw new Error(`ZIPパートの索引 ${index} を取得できません`); batch.push(Buffer.from(item.data,'base64')); }
    const bytes=Buffer.concat(batch); await appendArchiveBytes(job, bytes); written += bytes.length; cursor=end; job.archivePartCentralOffset=cursor;
  }
  if (centralStart > 0xffffffff || written > 0xffffffff) throw new Error('ZIPパートのCentral Directoryが標準ZIPの上限を超えました');
  const endRecord=Buffer.concat([Buffer.from([0x50,0x4b,0x05,0x06]),zipU16(0),zipU16(0),zipU16(count),zipU16(count),zipU32(written),zipU32(centralStart),zipU16(0)]);
  await appendArchiveBytes(job,endRecord);
  if(!Array.isArray(job.archiveParts))job.archiveParts=[];
  job.archiveParts.push({partNumber:Number(job.archivePartNumber||0)+1,chunks:Number(job.archivePartChunkCount||0),bytes:Number(job.archivePartBytes||0)});
  job.archivePartNumber=Number(job.archivePartNumber||0)+1;
}
async function appendArchiveEntry(job, fileName, rawBytes, force=false) {
  const name=Buffer.from(fileName,'utf8'); const raw=Buffer.isBuffer(rawBytes)?rawBytes:Buffer.from(rawBytes); const compressed=zlib.deflateRawSync(raw);
  if(name.length>65535||compressed.length>0xffffffff||raw.length>0xffffffff)throw new Error('ZIP内のファイルサイズが標準ZIPの上限を超えました');
  const crc=zipCrc32(raw),{time,date}=zipTimestamp(new Date(job.createdAt));
  const local=Buffer.concat([Buffer.from([0x50,0x4b,0x03,0x04]),zipU16(20),zipU16(0x800),zipU16(8),zipU16(time),zipU16(date),zipU32(crc),zipU32(compressed.length),zipU32(raw.length),zipU16(name.length),zipU16(0),name,compressed]);
  const central=Buffer.concat([Buffer.from([0x50,0x4b,0x01,0x02]),zipU16(20),zipU16(20),zipU16(0x800),zipU16(8),zipU16(time),zipU16(date),zipU32(crc),zipU32(compressed.length),zipU32(raw.length),zipU16(name.length),zipU16(0),zipU16(0),zipU16(0),zipU16(0),zipU32(0),zipU32(job.archivePartOffset||0),name]);
  const projected=Number(job.archivePartOffset||0)+local.length+Number(job.archivePartCentralBytes||0)+central.length+22;
  if(!force && Number(job.archivePartCentralCount||0)>0 && projected>SAFE_ARCHIVE_PART_BYTES){ await finishArchivePart(job); await startArchivePart(job); return appendArchiveEntry(job,fileName,rawBytes,true); }
  if(projected>SAFE_ARCHIVE_PART_BYTES)throw new Error('ZIPパート内の単一データが安全上限を超えました');
  await appendArchiveBytes(job,local); await setJSON(BACKUP_INDEX_STORE,exportKey(job.exportId,`central:${job.archivePartNumber}:${job.archivePartCentralCount}`),{data:central.toString('base64')}); job.archivePartOffset=Number(job.archivePartOffset||0)+local.length; job.archivePartCentralCount=Number(job.archivePartCentralCount||0)+1; job.archivePartCentralBytes=Number(job.archivePartCentralBytes||0)+central.length;
}
async function beginArchive(job) { job.phase='archive';job.archiveStoreIndex=0;job.archiveEntryOffset=0;job.archivePartIndex=0;job.archivePartNumber=0;job.archiveParts=[];job.archiveManifestAdded=true;await startArchivePart(job);await saveExportJob(job); }
async function archiveSnapshotBatch(job,name){const info=job.stores[name]||{count:0};const count=Number(info.count||0),start=Number(job.archiveEntryOffset||0);const targetBytes=1800000,maxEntries=100;let offset=start,bytes=2;const entries=[];while(offset<count&&entries.length<maxEntries){const item=await getJSONWithRetry(BACKUP_INDEX_STORE,exportKey(job.exportId,`data:${name}:${offset}`));if(item?.found){const entry={key:item.key,value:item.value};const entryBytes=Buffer.byteLength(JSON.stringify(entry),'utf8');if(entries.length&&bytes+entryBytes>targetBytes)break;entries.push(entry);bytes+=entryBytes;}offset+=1;}if(entries.length){const file=`blob/${name}/part-${String(job.archivePartIndex||0).padStart(6,'0')}.json`;await appendArchiveEntry(job,file,Buffer.from(JSON.stringify({entries}),'utf8'));job.archivePartIndex=Number(job.archivePartIndex||0)+1;}job.archiveEntryOffset=offset;}

async function prepareExportIndexes(job) {
  while (Number(job.preparedStoreIndex || 0) < BACKUP_STORES.length) {
    const storeIndex = Number(job.preparedStoreIndex || 0);
    const name = BACKUP_STORES[storeIndex];
    const keys = await listKeys(STORE_NAMES[name]);
    const pageSize = pageSizeFor(name);
    const info = { count:keys.length, pageSize, pages:Math.ceil(keys.length / pageSize), keyHash:crypto.createHash('sha256').update(keys.slice().sort().join('\n')).digest('hex') };
    job.stores[name] = info;
    for (let page = 0; page < Math.ceil(keys.length / BACKUP_INDEX_PAGE_SIZE); page += 1) {
      const selected = keys.slice(page * BACKUP_INDEX_PAGE_SIZE, (page + 1) * BACKUP_INDEX_PAGE_SIZE);
      await setJSON(BACKUP_INDEX_STORE, exportKey(job.exportId, `index:${name}:${page}`), selected);
    }
    job.preparedStoreIndex = storeIndex + 1;
    job.progress = { phase:'index', store:name, storeIndex:job.preparedStoreIndex, storeTotal:BACKUP_STORES.length, entries:0, total:BACKUP_STORES.reduce((sum, key) => sum + Number(job.stores[key]?.count || 0), 0) };
    await saveExportJob(job);
  }
  job.phase = 'snapshot';
  job.storeIndex = Number(job.storeIndex || 0);
  job.offset = Number(job.offset || 0);
  await setJSON(BACKUP_INDEX_STORE, exportKey(job.exportId, 'meta'), { exportId:job.exportId, createdAt:job.createdAt, stores:job.stores });
  await saveExportJob(job);
}

async function processBackupExport(payload) {
  const exportId = String(payload?.exportId || '');
  if (!/^[a-f0-9]{20}$/.test(exportId)) throw new Error('バックアップIDが不正です');
  const job = await getExportJob(exportId);
  if (!job) throw new Error('バックアップジョブが見つかりません');
  if (job.status === 'ready' || job.status === 'cancelled') return {};
  if (job.status === 'failed') throw new Error(job.lastError || 'バックアップジョブは失敗状態です');
  if (Number(job.expiresAt || 0) < Date.now()) throw new Error('バックアップジョブの有効期限が切れました');
  job.status = 'running';
  job.attempts = Number(job.attempts || 0) + 1;
  job.lastError = '';
  await saveExportJob(job);
  if (job.phase === 'index') await prepareExportIndexes(job);

  const started = Date.now();
  let currentIndexPage = -1;
  let cachedKeys = [];
  let processed = 0;
  while (Date.now() - started < BACKGROUND_SLICE_MS) {
    if (job.phase === 'archive') {
      if (!job.archiveManifestAdded) { await beginArchive(job); continue; }
      const name = BACKUP_STORES[Number(job.archiveStoreIndex || 0)];
      if (!name) { await finishArchivePart(job); job.phase = 'ready'; job.status = 'ready'; job.completedAt = new Date().toISOString(); job.progress = { phase:'ready', entries:job.progress?.total || 0, total:job.progress?.total || 0, archiveParts:job.archiveParts, archiveBytes:job.archiveParts.reduce((n,p)=>n+p.bytes,0) }; await saveExportJob(job); const meta=await getJSON(BACKUP_INDEX_STORE,exportKey(exportId,'meta')); if(meta){meta.status='ready';meta.completedAt=job.completedAt;meta.archiveParts=job.archiveParts;await setJSON(BACKUP_INDEX_STORE,exportKey(exportId,'meta'),meta);} return {}; }
      const info = job.stores?.[name] || { count:0 };
      if (Number(job.archiveEntryOffset || 0) >= Number(info.count || 0)) {
        job.archiveStoreIndex = Number(job.archiveStoreIndex || 0) + 1;
        job.archiveEntryOffset = 0;
        job.archivePartIndex = 0;
        await saveExportJob(job);
        continue;
      }
      await archiveSnapshotBatch(job, name);
      job.progress = { ...job.progress, phase:'archive', store:name, storeIndex:Number(job.archiveStoreIndex || 0) + 1, storeTotal:BACKUP_STORES.length, archiveFiles:Number(job.centralCount || 0), archiveBytes:Number(job.archiveTotalBytes || 0) };
      await saveExportJob(job);
      continue;
    }
    if (job.phase !== 'snapshot') throw new Error(`未対応のバックアップ段階です: ${job.phase}`);
    const name = BACKUP_STORES[Number(job.storeIndex || 0)];
    if (!name) {
      await beginArchive(job);
      continue;
    }
    const info = job.stores?.[name] || { count:0 };
    if (Number(job.offset || 0) >= Number(info.count || 0)) {
      job.storeIndex = Number(job.storeIndex || 0) + 1; job.offset = 0; currentIndexPage = -1;
      await saveExportJob(job);
      continue;
    }
    const offset = Number(job.offset || 0);
    const indexPage = Math.floor(offset / BACKUP_INDEX_PAGE_SIZE);
    if (indexPage !== currentIndexPage) {
      cachedKeys = await getJSON(BACKUP_INDEX_STORE, exportKey(exportId, `index:${name}:${indexPage}`));
      if (!Array.isArray(cachedKeys)) throw new Error(`${name}のバックアップ索引を取得できません`);
      currentIndexPage = indexPage;
    }
    const key = cachedKeys[offset % BACKUP_INDEX_PAGE_SIZE];
    if (typeof key === 'string') {
      const value = await getJSON(STORE_NAMES[name], key);
      await setJSON(BACKUP_INDEX_STORE, exportKey(exportId, `data:${name}:${offset}`), { key, found:value !== null && value !== undefined, ...(value === null || value === undefined ? {} : { value }) });
    } else {
      await setJSON(BACKUP_INDEX_STORE, exportKey(exportId, `data:${name}:${offset}`), { found:false });
    }
    job.offset = offset + 1;
    processed += 1;
    job.progress = { phase:'snapshot', store:name, storeIndex:Number(job.storeIndex || 0) + 1, storeTotal:BACKUP_STORES.length, storeCount:Number(info.count || 0), storeDone:job.offset, entries:Number(job.progress?.entries || 0) + 1, total:BACKUP_STORES.reduce((sum, storeName) => sum + Number(job.stores?.[storeName]?.count || 0), 0) };
    if (processed % 8 === 0 || job.offset >= Number(info.count || 0)) await saveExportJob(job);
  }
  job.status = 'queued';
  await saveExportJob(job);
  return { continue:true };
}

async function processBackupImport(payload) {
  const importId = String(payload?.importId || '');
  if (!/^[a-f0-9]{48}$/.test(importId)) throw new Error('復元IDが不正です');
  const meta = await getJSON(BACKUP_INDEX_STORE, importKey(importId, 'meta'));
  if (!meta) throw new Error('復元セッションが見つかりません');
  const state = await initializeImportProgress(importId, meta.actorEmail || '');
  if (state.phase === 'done') return {};
  state.status = 'running'; state.lastError = ''; state.updatedAt = new Date().toISOString();
  await setJSON(BACKUP_INDEX_STORE, importProgressKey(importId), state);
  const started = Date.now();
  let latest = importProgressResponse(state);
  while (Date.now() - started < BACKGROUND_SLICE_MS) {
    latest = await advanceImportCommit(importId, meta.actorEmail || '');
    if (latest.done) { await maintainRestoreSiteLock(meta.actorEmail || ''); return {}; }
    await maintainRestoreSiteLock(meta.actorEmail || '');
  }
  const saved = await getJSON(BACKUP_INDEX_STORE, importProgressKey(importId));
  if (saved) { saved.status = 'queued'; saved.updatedAt = new Date().toISOString(); await setJSON(BACKUP_INDEX_STORE, importProgressKey(importId), saved); }
  return { continue:true };
}

async function markBackupBackgroundFailure(payload, error, terminal) {
  const text = String(error?.message || error || 'Background処理に失敗しました').slice(0, 400);
  if (payload?.exportId) {
    const job = await getExportJob(String(payload.exportId));
    if (job) { job.status = terminal ? 'failed' : 'retrying'; job.lastError = text; job.updatedAt = new Date().toISOString(); await saveExportJob(job); }
  }
  if (payload?.importId) {
    const key = importProgressKey(String(payload.importId));
    const state = await getJSON(BACKUP_INDEX_STORE, key);
    if (state) { state.status = terminal ? 'failed' : 'retrying'; state.lastError = text; state.updatedAt = new Date().toISOString(); await setJSON(BACKUP_INDEX_STORE, key, state); }
  }
  if (payload?.cleanupExportId) {
    const key=`backup-cleanup:${String(payload.cleanupExportId)}:state`;
    const state=await getJSON(BACKUP_INDEX_STORE,key)||{exportId:String(payload.cleanupExportId)};
    state.status=terminal?'failed':'retrying';state.lastError=text;state.updatedAt=new Date().toISOString();
    await setJSON(BACKUP_INDEX_STORE,key,state);
  }
}

async function startBackupExport(event, admin) {
  await cleanupOldBackupExports(event);
  const exportId = id();
  const now = new Date().toISOString();
  const job = { exportId, actorEmail:admin.email, status:'queued', phase:'index', preparedStoreIndex:0, storeIndex:0, offset:0, stores:{}, progress:{phase:'index',storeIndex:0,storeTotal:BACKUP_STORES.length,entries:0,total:0}, createdAt:now, updatedAt:now, expiresAt:Date.now()+BACKUP_SESSION_MAX_AGE_MS, attempts:0 };
  await saveExportJob(job);
  await registerUserJob(admin.email, 'export', exportId);
  try { await enqueueBackgroundTask(event, 'backup-export', { exportId }); }
  catch (error) { await markBackupBackgroundFailure({ exportId }, error, true); throw error; }
  return { exportId, status:'queued' };
}

async function resumeBackupExport(event, exportId, admin) {
  const job = await getExportJob(String(exportId || ''));
  if (!job || String(job.actorEmail || '').toLowerCase() !== String(admin.email || '').toLowerCase()) throw new Error('バックアップジョブが見つかりません');
  if (job.status === 'ready') return { exportId:job.exportId, status:'ready' };
  if (Number(job.expiresAt || 0) < Date.now()) throw new Error('バックアップジョブの有効期限が切れました。新しいバックアップを開始してください');
  const lastUpdate = Date.parse(job.updatedAt || job.createdAt || '');
  if (['queued','running','retrying'].includes(job.status) && Number.isFinite(lastUpdate) && Date.now() - lastUpdate < 10 * 60 * 1000) throw new Error('このバックアップは現在処理中です。しばらくしてから状況を更新してください');
  job.status = 'queued'; job.lastError = ''; await saveExportJob(job);
  try { await enqueueBackgroundTask(event, 'backup-export', { exportId:job.exportId }); }
  catch (error) { await markBackupBackgroundFailure({ exportId:job.exportId }, error, true); throw error; }
  return { exportId:job.exportId, status:'queued' };
}

async function startBackupImport(event, importId, admin) {
  const meta = await getJSON(BACKUP_INDEX_STORE, importKey(importId, 'meta'));
  if (!meta || String(meta.actorEmail || '').toLowerCase() !== String(admin.email || '').toLowerCase()) throw new Error('復元セッションの所有者を確認できません');
  const state = await initializeImportProgress(importId, admin.email);
  if (state.phase === 'done') return importProgressResponse(state);
  const lastUpdate = Date.parse(state.updatedAt || state.startedAt || '');
  if (['queued','running'].includes(state.status) && Number.isFinite(lastUpdate) && Date.now() - lastUpdate < 10 * 60 * 1000) return importProgressResponse(state);
  await maintainRestoreSiteLock(admin.email);
  state.status = 'queued'; state.lastError = ''; state.updatedAt = new Date().toISOString();
  await setJSON(BACKUP_INDEX_STORE, importProgressKey(importId), state);
  try { await enqueueBackgroundTask(event, 'backup-import', { importId }); }
  catch (error) { await markBackupBackgroundFailure({ importId }, error, true); throw error; }
  await registerUserJob(admin.email, 'import', importId);
  return importProgressResponse(state);
}

async function listBackupJobs(email) {
  const keys = await listKeys(BACKUP_INDEX_STORE, userJobPrefix(email));
  const jobs = [];
  for (const key of keys) {
    const ref = await getJSON(BACKUP_INDEX_STORE, key);
    if (!ref) continue;
    if (ref.type === 'export') {
      const job = await getExportJob(ref.jobId);
      if (job && Date.now() <= Number(job.expiresAt || 0)) {
        const age=Date.now()-Date.parse(job.updatedAt||job.createdAt||'');
        const canResume=job.status==='failed'||job.status==='retrying'||(['queued','running'].includes(job.status)&&age>10*60*1000);
        jobs.push({ type:'export', id:job.exportId, status:job.status, phase:job.phase, progress:job.progress, canResume, createdAt:job.createdAt, updatedAt:job.updatedAt, lastError:job.lastError || '' });
      }
      else await deleteKey(BACKUP_INDEX_STORE, key);
    } else if (ref.type === 'import') {
      const state = await getJSON(BACKUP_INDEX_STORE, importProgressKey(ref.jobId));
      const meta = await getJSON(BACKUP_INDEX_STORE, importKey(ref.jobId, 'meta'));
      if (!meta && state?.phase !== 'done') { await deleteKey(BACKUP_INDEX_STORE, key); continue; }
      if (meta && Date.now() - Date.parse(meta.createdAtServer || '') > BACKUP_SESSION_MAX_AGE_MS && state?.phase !== 'done') { await deleteKey(BACKUP_INDEX_STORE, key); continue; }
      const status = state?.status || (state?.phase === 'done' ? 'done' : 'uploading');
      jobs.push({ type:'import', id:ref.jobId, status, progress:state ? importProgressResponse(state).progress : { phase:'uploading', receivedPages:Number(meta?.receivedPages || 0), totalPages:Object.values(meta?.stores || {}).reduce((sum, store) => sum + Number(store.pages || 0), 0) }, createdAt:meta?.createdAtServer || state?.startedAt, updatedAt:state?.updatedAt || meta?.createdAtServer, lastError:state?.lastError || '' });
    }
  }
  return jobs.sort((a,b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))).slice(0,30);
}

async function resumeStaleImportJobs(event, admin, jobs) {
  const now = Date.now();
  const stale = jobs.filter((job) => {
    if (job.type !== 'import' || !['queued', 'running', 'retrying'].includes(job.status)) return false;
    const updated = Date.parse(job.updatedAt || job.createdAt || '');
    return Number.isFinite(updated) && now - updated >= 10 * 60 * 1000;
  });
  for (const job of stale) {
    try {
      await startBackupImport(event, job.id, admin);
    } catch (error) {
      console.warn('failed to auto-resume stale backup import:', job.id, error);
    }
  }
  return stale.length;
}

exports.processBackgroundTask = async (payload) => payload?.cleanupExportId ? processBackupCleanup(payload) : (payload?.exportId ? processBackupExport(payload) : processBackupImport(payload));
exports.markBackgroundFailure = markBackupBackgroundFailure;

exports.handler = async (event) => {

  if (event.httpMethod !== 'POST') return json(405, { error: 'POSTのみ対応しています' });
  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return json(400, { error: '不正なJSONです' }); }
  try {
    const action = String(payload.action || '');
    let admin;
    if (action === 'importChunk' || action === 'importCommit') {
      admin = await authorizeImportContinuation(payload.importId, payload.importToken);
      if (!admin) return json(403, { error: '復元セッションの認証に失敗しました。運営アカウントから読み込み直してください' });
    } else {
      admin = await requireAdmin(payload.token);
      if (!admin) return json(403, { error: 'バックアップ操作は運営のみ利用できます' });
    }
    if (payload.action === 'startExport') return json(200, await startBackupExport(event, admin));
    if (payload.action === 'resumeExport') return json(200, await resumeBackupExport(event, payload.exportId, admin));
    if (payload.action === 'exportStatus') {
      const exportId=String(payload.exportId||''); const job=await getExportJob(exportId);
      if(!job || String(job.actorEmail||'').toLowerCase()!==String(admin.email||'').toLowerCase()) return json(404,{error:'バックアップジョブが見つかりません'});
      return json(200,{ok:true,job:{exportId:job.exportId,status:job.status,phase:job.phase,progress:job.progress,createdAt:job.createdAt,updatedAt:job.updatedAt,lastError:job.lastError||''}});
    }
    if (payload.action === 'archiveManifest') {
      const exportId=String(payload.exportId||''); const job=await getExportJob(exportId);
      if(!job || String(job.actorEmail||'').toLowerCase()!==String(admin.email||'').toLowerCase()) return json(404,{error:'バックアップジョブが見つかりません'});
      if(job.status!=='ready' || !Number.isInteger(Number(job.archiveChunkCount))) return json(409,{error:'ZIPアーカイブの準備が完了していません'});
      const parts=Array.isArray(job.archiveParts)&&job.archiveParts.length?job.archiveParts:[{partNumber:1,chunks:Number(job.archiveChunkCount||0),bytes:Number(job.archiveTotalBytes||0),legacy:true}]; return json(200,{exportId,format:parts.length>1?'multipart-application/zip':'application/zip',parts,createdAt:job.createdAt});
    }
    if (payload.action === 'archiveChunk') {
      const exportId=String(payload.exportId||''); const job=await getExportJob(exportId);
      if(!job || String(job.actorEmail||'').toLowerCase()!==String(admin.email||'').toLowerCase()) return json(404,{error:'バックアップジョブが見つかりません'});
      if(job.status!=='ready') return json(409,{error:'バックアップの準備が完了していません'});
      const part=Math.max(0,Number(payload.part)||0), offset=Math.max(0,Number(payload.offset)||0), limit=Math.min(2,Math.max(1,Number(payload.limit)||2));
      const info=job.archiveParts?.[part] || (part===0 && !Array.isArray(job.archiveParts)?{chunks:Number(job.archiveChunkCount||0),bytes:Number(job.archiveTotalBytes||0),legacy:true}:null); if(!info) return json(404,{error:'ZIPパートが見つかりません'});
      if(offset>=Number(info.chunks)) return json(200,{part,offset,nextOffset:offset,done:true,data:''});
      const parts=[]; for(let index=offset;index<Math.min(Number(info.chunks),offset+limit);index+=1){const item=await getJSONWithRetry(BACKUP_INDEX_STORE,info.legacy?exportKey(exportId,`archive-chunk:${index}`):exportKey(exportId,`archive-part:${part}:chunk:${index}`));if(!item?.data)return json(404,{error:`ZIPパート ${part+1} のチャンク ${index} を取得できません`});parts.push(Buffer.from(item.data,'base64'));}
      const nextOffset=offset+parts.length; return json(200,{part,offset,nextOffset,done:nextOffset>=Number(info.chunks),data:Buffer.concat(parts).toString('base64')});
    }
    if (payload.action === 'exportManifest') {
      const exportId=String(payload.exportId||''); const job=await getExportJob(exportId);
      if(!job || String(job.actorEmail||'').toLowerCase()!==String(admin.email||'').toLowerCase()) return json(404,{error:'バックアップジョブが見つかりません'});
      if(job.status!=='ready') return json(409,{error:'バックアップの準備が完了していません'});
      const meta=await getJSON(BACKUP_INDEX_STORE,exportKey(exportId,'meta'));
      if(!meta) return json(404,{error:'バックアップ索引が見つかりません'});
      return json(200,{manifest:{...createBackupInfo(),format:'netrify-data-backup-manifest',createdAt:job.createdAt,exportId,stores:meta.stores}});
    }
    if (payload.action === 'jobs') {
      const jobs = await listBackupJobs(admin.email);
      await resumeStaleImportJobs(event, admin, jobs);
      return json(200,{jobs:await listBackupJobs(admin.email)});
    }
    if (payload.action === 'importStatus') {
      const importId=String(payload.importId||''); const meta=await getJSON(BACKUP_INDEX_STORE,importKey(importId,'meta'));
      const state=await getJSON(BACKUP_INDEX_STORE,importProgressKey(importId));
      const actorEmail=meta?.actorEmail || state?.actorEmail || '';
      if((!meta && state?.phase!=='done') || String(actorEmail).toLowerCase()!==String(admin.email||'').toLowerCase()) return json(404,{error:'復元ジョブが見つかりません'});
      if(state) return json(200,importProgressResponse(state));
      const received=await listKeys(BACKUP_INDEX_STORE,importKey(importId,'received:'));
      return json(200,{ok:true,done:false,status:'uploading',progress:{phase:'uploading',receivedPages:received.length,totalPages:Object.values(meta.stores||{}).reduce((sum,store)=>sum+Number(store.pages||0),0)}});
    }
    if (payload.action === 'startImportCommit') {
      const importId=String(payload.importId||'');
      return json(200,await startBackupImport(event,importId,admin));
    }
    if (payload.action === 'manifest' || payload.action === 'chunk' || payload.action === 'export') return json(409, { error:'同期バックアップは無効です。運営画面からBackgroundバックアップを開始してください。' });
    if (payload.action === 'cancelExport') {
      const exportId=String(payload.exportId||'');const job=await getExportJob(exportId);
      if(job&&String(job.actorEmail||'').toLowerCase()!==String(admin.email||'').toLowerCase())return json(404,{error:'バックアップジョブが見つかりません'});
      await scheduleBackupCleanup(event,exportId);
      if(job?.actorEmail)await removeUserJob(admin.email,'export',exportId);
      return json(202,{ok:true,status:'cleanup queued'});
    }
    if (payload.action === 'importBegin') {
      const backup = payload.backup || {};
      if (backup.format !== 'netrify-data-backup' || ![1, BACKUP_VERSION].includes(backup.version) || !backup.stores) return json(400, { error: '対応していないバックアップ形式です' });
      const importId = crypto.randomBytes(24).toString('hex'); const importToken = crypto.randomBytes(32).toString('hex'); const stores = {};
      for (const name of Object.keys(backup.stores)) {
        if (!BACKUP_STORES.includes(name)) return json(400, { error: `未対応のストアです: ${name}` });
        const pages = Number(backup.stores[name].pages || 0); const count = Number(backup.stores[name].count || 0);
        if (!Number.isSafeInteger(pages) || pages < 0 || !Number.isSafeInteger(count) || count < 0 || (count > 0 && pages === 0)) return json(400, { error: `${name}のページ情報が不正です` });
        stores[name] = { pages, count };
      }
      await setJSON(BACKUP_INDEX_STORE, importKey(importId, 'meta'), { importId, actorEmail: admin.email, accessHash: importAccessHash(importToken), format: backup.format, version: backup.version, passwordData: backup.passwordData, security: backup.security, createdAt: backup.createdAt || new Date().toISOString(), stores, receivedPages:0, createdAtServer: new Date().toISOString() });
      await registerUserJob(admin.email, 'import', importId);
      return json(200, { importId, importToken });
    }
    if (payload.action === 'importReceivedPages') {
      const importId = String(payload.importId || '');
      const meta = await getJSON(BACKUP_INDEX_STORE, importKey(importId, 'meta'));
      if (!meta) return json(404, { error: '復元セッションが見つかりません' });
      const name = String(payload.store || '');
      if (!BACKUP_STORES.includes(name)) return json(400, { error: '復元ストアが不正です' });
      const keys = await listKeys(BACKUP_INDEX_STORE, importKey(importId, `received:${name}:`));
      const receivedPages = keys.map((key) => Number(String(key).split(':').pop())).filter(Number.isSafeInteger).sort((a,b)=>a-b);
      return json(200, { ok:true, importId, store:name, receivedPages });
    }
    if (payload.action === 'importChunkFragment') {
      const importId = String(payload.importId || '');
      const meta = await getJSON(BACKUP_INDEX_STORE, importKey(importId, 'meta'));
      if (!meta) return json(404, { error: '復元セッションが見つかりません' });
      const name = String(payload.store || ''), page = Number(payload.page);
      const fragmentIndex = Number(payload.fragmentIndex), totalFragments = Number(payload.totalFragments), totalBytes = Number(payload.totalBytes);
      if (!BACKUP_STORES.includes(name) || !Number.isSafeInteger(page) || page < 0 || page >= Number(meta.stores?.[name]?.pages || 0) || !Number.isSafeInteger(fragmentIndex) || fragmentIndex < 0 || !Number.isSafeInteger(totalFragments) || totalFragments < 1 || fragmentIndex >= totalFragments || !Number.isSafeInteger(totalBytes) || totalBytes < 1 || totalBytes > 64 * 1024 * 1024 || typeof payload.data !== 'string') return json(400, { error:'復元フラグメントの形式が不正です' });
      const fragmentKey = importKey(importId, `fragment:${name}:${page}:${fragmentIndex}`);
      await setJSON(BACKUP_INDEX_STORE, fragmentKey, { totalFragments, totalBytes, sha256:String(payload.sha256 || ''), data:payload.data });
      const fragments=[];
      for (let index=0; index<totalFragments; index+=1) {
        const item=await getJSONWithRetry(BACKUP_INDEX_STORE, importKey(importId, `fragment:${name}:${page}:${index}`));
        if (!item) return json(200, { ok:true, importId, store:name, page, fragmentIndex, received:false });
        fragments.push(item);
      }
      const raw=Buffer.concat(fragments.map((item)=>Buffer.from(item.data,'base64')));
      const expected=fragments[0];
      if (raw.length !== expected.totalBytes || fragments.some((item)=>item.totalFragments!==expected.totalFragments || item.totalBytes!==expected.totalBytes || item.sha256!==expected.sha256)) return json(400,{error:'復元フラグメントのメタデータが一致しません'});
      if (expected.sha256 && crypto.createHash('sha256').update(raw).digest('hex') !== expected.sha256) return json(400,{error:'復元フラグメントのチェックサムが一致しません'});
      let entries; try { entries=JSON.parse(raw.toString('utf8')); } catch { return json(400,{error:'復元フラグメントのJSONが不正です'}); }
      if (!Array.isArray(entries)) return json(400,{error:'復元フラグメントのentriesが配列ではありません'});
      await setJSON(BACKUP_INDEX_STORE, importPageKey(importId,name,page), entries);
      await setJSON(BACKUP_INDEX_STORE, importReceiptKey(importId,name,page), true);
      meta.receivedPages=Number(meta.receivedPages||0)+1; await setJSON(BACKUP_INDEX_STORE, importKey(importId,'meta'), meta);
      return json(200,{ok:true,importId,store:name,page,fragmentIndex,received:true});
    }
    if (payload.action === 'importChunk') {
      const importId = String(payload.importId || ''); const meta = await getJSON(BACKUP_INDEX_STORE, importKey(importId, 'meta'));
      if (!meta) return json(404, { error: '復元セッションが見つかりません' });
      const name = String(payload.store || ''); const page = Number(payload.page);
      if (!BACKUP_STORES.includes(name) || !Array.isArray(payload.entries)) return json(400, { error: '復元チャンクの形式が不正です' });
      if (!Number.isSafeInteger(page) || page < 0 || page >= Number(meta.stores?.[name]?.pages || 0)) return json(400, { error: '復元チャンクのページ番号が不正です' });
      if (payload.entries.length > 100 || Buffer.byteLength(JSON.stringify(payload.entries), 'utf8') > 4 * 1024 * 1024) return json(413, { error: '1回の復元チャンクが大きすぎます' });
      const pageKey = importPageKey(importId, name, page);
      await setJSON(BACKUP_INDEX_STORE, pageKey, payload.entries);
      const savedPage = await getJSONWithRetry(BACKUP_INDEX_STORE, pageKey);
      if (!Array.isArray(savedPage)) return json(503, { error: '復元ページの一時保存を確認できませんでした。少し待ってから同じバックアップを再実行してください' });
      const receiptKey=importReceiptKey(importId,name,page);
      const hadReceipt=(await getJSON(BACKUP_INDEX_STORE,receiptKey))===true;
      await setJSON(BACKUP_INDEX_STORE, receiptKey, true);
      if(!hadReceipt){meta.receivedPages=Number(meta.receivedPages||0)+1;await setJSON(BACKUP_INDEX_STORE,importKey(importId,'meta'),meta);}
      return json(200, { ok: true, importId, store: name, page });
    }
    if (payload.action === 'importCommit') {
      return json(409,{error:'同期復元は無効です。startImportCommitでBackground復元を開始してください。'});
    }
    if (payload.action === 'import') return json(409,{error:'同期復元は無効です。運営画面からBackground復元を開始してください。'});
    if (payload.action === 'lock') {
      const now = new Date().toISOString();
      await setJSON(STORE_NAMES.SITE_STATE, 'global', { locked: true, lockedAt: now, lockedBy: admin.email, message: 'データ保護のため、このサイトはロックされています。' });
      await setJSON(STORE_NAMES.ADMIN_AUDIT, `audit:${id()}`, { kind: 'audit', id: id(), actorEmail: admin.email, action: 'exportBackupAndLock', targetType: 'backup', targetId: String(payload.createdAt || now), detail: '分割バックアップ出力後にサイトを保護ロック', createdAt: now });
      if (payload.exportId) {
        try { const exportId=String(payload.exportId); const job=await getExportJob(exportId); if(job&&String(job.actorEmail||'').toLowerCase()===String(admin.email||'').toLowerCase()){await scheduleBackupCleanup(event,exportId);await removeUserJob(admin.email,'export',exportId);} }
        catch (error) { console.warn('failed to clean backup export index:', error); }
      }
      return json(200, { ok: true, locked: true });
    }
    if (payload.action === 'unlock') {
      await setJSON(STORE_NAMES.SITE_STATE, 'global', { locked: false, unlockedAt: new Date().toISOString(), unlockedBy: admin.email });
      await setJSON(STORE_NAMES.ADMIN_AUDIT, `audit:${id()}`, { kind: 'audit', id: id(), actorEmail: admin.email, action: 'unlockSite', targetType: 'site', targetId: 'global', detail: '運営によるサイト保護ロック解除', createdAt: new Date().toISOString() });
      return json(200, { ok: true, locked: false });
    }
    if (payload.action === 'import') {
      const restored = await restoreBackup(payload.backup, admin.email);
      return json(200, { ok: true, restored });
    }
    return json(400, { error: 'actionはmanifest、chunk、export、unlock、importのいずれかです' });
  } catch (error) {
    console.error('backup function error:', error);
    return json(400, { error: error.message || 'バックアップ処理に失敗しました' });
  }
};
