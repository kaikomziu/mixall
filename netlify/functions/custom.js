// netlify/functions/custom.js
// ゲーム制作・プレイ環境「カスタム」: パブリック/プライベートルーム、
// アバターの位置同期(ポーリング方式のゆるい同期)、ルーム内テキストチャット。
//
// 音声/映像通話は既存の calls.js (window.Netrify.startCall) をそのまま利用する。
// 本格的なビジュアルブロックエディタと顔トラッキングは次フェーズで追加予定。

const crypto = require('crypto');
const { STORE_NAMES, getJSON, setJSON, deleteKey, listKeys } = require('../lib/store');
const { requireSession, requireAdmin } = require('../lib/session');
const { getAgeFromBirthDate, canViewAgeReviewed } = require('../lib/ghost-age');
const { fingerprint, getTargetContent } = require('../lib/program-review');

const PARTICIPANT_TTL_MS = 20 * 1000; // この時間、位置更新がなければ「退出」とみなす
const MAX_MESSAGE_LEN = 500;
const MAX_SCENE_OBJECTS = 500;
const MAX_PROGRAM_FILES = 120;
const MAX_PROGRAM_FILE_BYTES = 300 * 1024;
const MAX_PROGRAM_TOTAL_BYTES = 8 * 1024 * 1024;
const MAX_DATA_VALUE_BYTES = 48 * 1024;
const DATA_KEY_RE = /^[a-zA-Z0-9_.:-]{1,80}$/;
const VALID_PROGRAM_BLOCKS = new Set(['move', 'turn', 'jump', 'wait', 'repeat', 'if_near', 'say', 'set_variable', 'change_variable']);

function json(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) };
}
function newId() { return crypto.randomBytes(8).toString('hex'); }
function hashPassword(password) { return crypto.createHash('sha256').update(String(password)).digest('hex'); }

function sanitizeProgramBlocks(input, budget = { count: 0 }, depth = 0) {
  if (!Array.isArray(input) || depth > 8 || budget.count >= 1000) return [];
  const result = [];
  for (const block of input.slice(0, 150)) {
    if (!block || !VALID_PROGRAM_BLOCKS.has(block.type) || budget.count >= 1000) continue;
    budget.count += 1;
    const values = {};
    const source = block.values && typeof block.values === 'object' ? block.values : {};
    for (const key of Object.keys(source).slice(0, 16)) {
      if (!/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(key)) continue;
      const value = source[key];
      if (typeof value === 'number' && Number.isFinite(value)) values[key] = Math.max(-10000, Math.min(10000, value));
      else if (typeof value === 'string') values[key] = value.slice(0, 500);
    }
    result.push({
      id: String(block.id || newId()).slice(0, 80),
      type: block.type,
      values,
      children: sanitizeProgramBlocks(block.children, budget, depth + 1)
    });
  }
  return result;
}

function sanitizeObjectScripts(input, budget) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 30).map((script) => ({
    id: String(script?.id || newId()).slice(0, 80),
    name: String(script?.name || 'スクリプト').slice(0, 80),
    trigger: script?.trigger === 'touch' ? 'touch' : 'start',
    blocks: sanitizeProgramBlocks(script?.blocks, budget)
  }));
}

function sanitizeProgramFiles(input) {
  if (!Array.isArray(input)) return [];
  let total = 0;
  const result = [];
  for (const file of input.slice(0, MAX_PROGRAM_FILES)) {
    if (!file || typeof file !== 'object') continue;
    const path = String(file.path || file.name || '').replace(/\\/g, '/').replace(/^\/+/, '').split('/').filter((part) => part && part !== '.' && part !== '..').join('/').slice(0, 240);
    const content = typeof file.content === 'string' ? file.content : '';
    const bytes = Buffer.byteLength(content, 'utf8');
    if (!path || bytes > MAX_PROGRAM_FILE_BYTES || total + bytes > MAX_PROGRAM_TOTAL_BYTES) continue;
    total += bytes;
    result.push({ path, content, bytes, updatedAt: new Date().toISOString() });
  }
  return result;
}
function safeDataKey(key) {
  const value = String(key || '').trim();
  return DATA_KEY_RE.test(value) ? value : null;
}
function safeDataValue(value) {
  try {
    const serialized = JSON.stringify(value);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_DATA_VALUE_BYTES) return null;
    return JSON.parse(serialized);
  } catch { return null; }
}
async function getAccessibleProject(projectId, email) {
  const id = String(projectId || '').slice(0, 80);
  const project = await getJSON(STORE_NAMES.CUSTOM_PROJECTS, id);
  if (!project) return { error: json(404, { error: 'プロジェクトが見つかりません' }) };
  if (project.ownerEmail === email) return { project };
  if (project.visibility !== 'public') return { error: json(403, { error: '非公開プロジェクトです' }) };
  const account=await getJSON(STORE_NAMES.ACCOUNTS,email);const operator=account?.isAdmin===true||account?.isDeputyAdmin===true;
  if (!operator && project.programReview?.human?.decision === 'block') return { error:json(403,{error:'このプログラムは運営の審査により停止されています'}) };
  if (!operator && project.programReview?.ai?.holdPublic === true && project.programReview?.human?.decision !== 'approve') return { error:json(403,{error:'安全性のAI審査で要確認となったため、運営の確認が完了するまで公開を保留しています'}) };
  const age=getAgeFromBirthDate(account?.birthDate);
  if (!operator && !canViewAgeReviewed(project,age)) return { error:json(403,{error:'年齢確認またはコンテンツ審査のため、このプロジェクトは表示できません'}) };
  return { project };
}
function pruneParticipants(room) {
  const cutoff = Date.now() - PARTICIPANT_TTL_MS;
  const participants = room.participants || {};
  for (const email of Object.keys(participants)) {
    if (new Date(participants[email].updatedAt).getTime() < cutoff) delete participants[email];
  }
  room.participants = participants;
  return room;
}

function publicRoomSummary(room) {
  return {
    id: room.id,
    name: room.name,
    visibility: room.visibility,
    ownerEmail: room.ownerEmail,
    hasPassword: room.visibility === 'private' && !!room.passwordHash,
    playerCount: Object.keys(room.participants || {}).length,
    createdAt: room.createdAt,
    projectId: room.projectId || null
  };
}

exports.handler = async (event) => {

  try { return await handle(event); } catch (err) {
    console.error('custom function error:', err);
    return json(500, { error: `内部エラー: ${err.message}` });
  }
};

async function handle(event) {
  const method = event.httpMethod;
  const qs = event.queryStringParameters || {};

  if (method !== 'GET' && method !== 'POST') return json(405, { error: '未対応のメソッドです' });

  let payload = {};
  if (method === 'POST') {
    try { payload = JSON.parse(event.body || '{}'); } catch { return json(400, { error: '不正なリクエストです' }); }
  } else {
    payload = qs;
  }

  const token = method === 'GET' ? qs.token : payload.token;
  const email = await requireSession(token);
  if (!email) return json(401, { error: 'ログインが必要です' });

  // ---------- GET: ルーム一覧・詳細・プロジェクト ----------
  if (method === 'GET') {
    if (qs.projects) {
      const keys = await listKeys(STORE_NAMES.CUSTOM_PROJECTS); const projects = [];
      const viewer=await getJSON(STORE_NAMES.ACCOUNTS,email);const age=getAgeFromBirthDate(viewer?.birthDate);const operator=viewer?.isAdmin===true||viewer?.isDeputyAdmin===true;
      for (const key of keys) { const project = await getJSON(STORE_NAMES.CUSTOM_PROJECTS, key); if (!project) continue; const owner=project.ownerEmail===email; const visible=owner || (project.visibility==='public' && (operator || (project.programReview?.human?.decision!=='block' && (project.programReview?.ai?.holdPublic!==true || project.programReview?.human?.decision==='approve') && canViewAgeReviewed(project,age)))); if(visible) projects.push({ id:project.id, name:project.name, visibility:project.visibility, ownerEmail:project.ownerEmail, updatedAt:project.updatedAt, objectCount:(project.scene?.objects || []).length, ageReview:project.ageReview?{status:project.ageReview.status,categories:project.ageReview.categories||[]}:null }); }
      projects.sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt)); return json(200, { projects });
    }
    if (qs.projectId) {
      const project = await getJSON(STORE_NAMES.CUSTOM_PROJECTS, qs.projectId);
      if (!project) return json(404, { error: 'プロジェクトが見つかりません' });
      if (project.ownerEmail !== email && project.visibility === 'private') return json(403, { error: '非公開プロジェクトです' });
      const access=await getAccessibleProject(project.id,email);if(access.error)return access.error;
      if(project.ownerEmail!==email){const {reviewFingerprint,programReview,...publicProject}=project;return json(200,{project:{...publicProject,ageReview:project.ageReview?{status:project.ageReview.status,categories:project.ageReview.categories||[]}:null}});}
      return json(200, { project });
    }
    if (qs.roomId) {
      let room = await getJSON(STORE_NAMES.CUSTOM_ROOMS, qs.roomId);
      if (!room) return json(404, { error: 'ルームが見つかりません' });
      if (room.visibility === 'private' && !room.members.includes(email)) {
        return json(403, { error: 'このルームには参加していません' });
      }
      if(room.projectId){const access=await getAccessibleProject(room.projectId,email);if(access.error)return access.error;}
      room = pruneParticipants(room);
      await setJSON(STORE_NAMES.CUSTOM_ROOMS, room.id, room);
      const { passwordHash, ...safeRoom } = room;
      return json(200, { room: safeRoom });
    }

    const keys = await listKeys(STORE_NAMES.CUSTOM_ROOMS);
    const rooms = [];
    for (const key of keys) {
      const r = await getJSON(STORE_NAMES.CUSTOM_ROOMS, key);
      if (!r) continue;
      if (r.visibility === 'public' || r.members.includes(email)) {
        if(r.projectId){const access=await getAccessibleProject(r.projectId,email);if(access.error)continue;}
        rooms.push(publicRoomSummary(pruneParticipants(r)));
      }
    }
    rooms.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return json(200, { rooms });
  }

  // ---------- POST ----------
  const { action } = payload;

  if (action === 'saveProject') {
    const projectId = String(payload.projectId || newId()).slice(0, 80);
    const existing = await getJSON(STORE_NAMES.CUSTOM_PROJECTS, projectId);
    if (existing && existing.ownerEmail !== email) return json(403, { error: 'プロジェクトの所有者ではありません' });
    const blockBudget = { count: 0 };
    const blocks = Array.isArray(payload.blocks) ? payload.blocks.slice(0, 500).map((block) => ({
      id: String(block.id || newId()).slice(0, 80),
      type: ['event_start', 'message_receive', 'broadcast', 'set_variable', 'change_variable', 'say', 'move'].includes(block.type) ? block.type : 'say',
      value: String(block.value || '').slice(0, 500),
      variable: String(block.variable || '').slice(0, 80),
      next: block.next ? String(block.next).slice(0, 80) : null
    })) : [];
    const variables = {};
    if (payload.variables && typeof payload.variables === 'object') Object.keys(payload.variables).slice(0, 100).forEach((key) => { variables[String(key).slice(0, 80)] = String(payload.variables[key]).slice(0, 500); });
    const programFiles = Array.isArray(payload.programFiles) ? sanitizeProgramFiles(payload.programFiles) : (Array.isArray(existing?.programFiles) ? existing.programFiles : []);
    const scene = payload.scene && typeof payload.scene === 'object' ? {
      objects: Array.isArray(payload.scene.objects) ? payload.scene.objects.slice(0, MAX_SCENE_OBJECTS).map((o) => ({ id:String(o.id || newId()).slice(0,80), type:['box','sphere','cylinder','tree','platform'].includes(o.type) ? o.type : 'box', x:Number(o.x)||0, y:Number(o.y)||0, z:Number(o.z)||0, scale:Math.max(.2, Math.min(20, Number(o.scale)||1)), color:/^#[0-9a-f]{6}$/i.test(String(o.color||'')) ? o.color : '#5b8cff', name:String(o.name||'オブジェクト').slice(0,80), scripts:sanitizeObjectScripts(o.scripts, blockBudget) })) : [],
      spawn: payload.scene.spawn && typeof payload.scene.spawn === 'object' ? { x:Number(payload.scene.spawn.x)||0, y:Number.isFinite(Number(payload.scene.spawn.y)) ? Number(payload.scene.spawn.y) : 0, z:Number(payload.scene.spawn.z)||0 } : {x:0,y:0,z:0}
    } : (existing?.scene || {objects:[],spawn:{x:0,y:1,z:0}});
    const project = { id: projectId, ownerEmail: existing?.ownerEmail || email, programFiles, name: String(payload.name || '無題のゲーム').slice(0, 80), visibility: payload.visibility === 'public' ? 'public' : 'private', blocks, variables, scene, updatedAt: new Date().toISOString(), createdAt: existing?.createdAt || new Date().toISOString() };
    project.reviewFingerprint=fingerprint(getTargetContent('custom',project));
    const reviewChanged=!existing || existing.reviewFingerprint!==project.reviewFingerprint;
    project.ageReview=reviewChanged?{status:'pending',categories:[]}:(existing.ageReview||{status:'pending',categories:[]});
    project.programReview=reviewChanged?{status:'pending',human:null,ai:existing?.programReview?.ai||null}:{...(existing.programReview||{status:'pending'}),fingerprint:project.reviewFingerprint};
    await setJSON(STORE_NAMES.CUSTOM_PROJECTS, projectId, project);
    return json(200, { project });
  }

  if (action === 'saveData' || action === 'loadData') {
    const access = await getAccessibleProject(payload.projectId, email);
    if (access.error) return access.error;
    const project = access.project;
    const scope = payload.scope === 'account' ? 'account' : 'game';
    const key = safeDataKey(payload.key);
    if (!key) return json(400, { error: '保存キーは英数字、._:-で1〜80文字にしてください' });
    const owner = scope === 'account' ? email : 'global';
    const dataKey = `${project.id}:${scope}:${owner}:${key}`;
    if (action === 'saveData') {
      const value = safeDataValue(payload.value);
      if (value === null) return json(400, { error: '保存データが大きすぎるかJSON形式ではありません' });
      await setJSON(STORE_NAMES.CUSTOM_DATA, dataKey, { projectId:project.id, scope, owner, key, value, updatedAt:new Date().toISOString() });
      return json(200, { ok:true, projectId:project.id, scope, key });
    }
    const record = await getJSON(STORE_NAMES.CUSTOM_DATA, dataKey);
    return json(200, { value: record?.value ?? null, exists: Boolean(record) });
  }
  if (action === 'sendProjectMessage') {
    const from = await getAccessibleProject(payload.fromProjectId, email);
    if (from.error) return from.error;
    const to = await getJSON(STORE_NAMES.CUSTOM_PROJECTS, String(payload.toProjectId || '').slice(0, 80));
    if (!to) return json(404, { error: '送信先プロジェクトが見つかりません' });
    const message = safeDataValue(payload.message);
    if (message === null) return json(400, { error: '通信データが大きすぎるかJSON形式ではありません' });
    const signal = { id:newId(), fromProjectId:from.project.id, toProjectId:to.id, type:String(payload.type || 'message').slice(0, 60), message, senderEmail:email, createdAt:new Date().toISOString() };
    await setJSON(STORE_NAMES.CUSTOM_SIGNALS, `signal:${to.id}:${signal.createdAt}:${signal.id}`, signal);
    return json(202, { ok:true, signalId:signal.id });
  }
  if (action === 'pollProjectMessages') {
    const access = await getAccessibleProject(payload.projectId, email);
    if (access.error) return access.error;
    const prefix = `signal:${access.project.id}:`;
    const keys = await listKeys(STORE_NAMES.CUSTOM_SIGNALS, prefix);
    const since = Number(payload.since || 0);
    const messages = [];
    for (const key of keys.slice(-100)) {
      const signal = await getJSON(STORE_NAMES.CUSTOM_SIGNALS, key);
      if (signal && (!since || Date.parse(signal.createdAt) > since)) messages.push(signal);
    }
    messages.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
    return json(200, { messages });
  }
  if (action === 'createRoom') {
    const name = (payload.name || '').trim().slice(0, 60) || '無題のワールド';
    const visibility = payload.visibility === 'private' ? 'private' : 'public';
    if (visibility === 'private' && !payload.password) {
      return json(400, { error: 'プライベートルームにはパスワードが必要です' });
    }
    const room = {
      id: newId(),
      name,
      visibility,
      passwordHash: visibility === 'private' ? hashPassword(payload.password) : null,
      ownerEmail: email,
      projectId: payload.projectId ? String(payload.projectId).slice(0,80) : null,
      members: [email],
      participants: {},
      messages: [],
      createdAt: new Date().toISOString()
    };
    await setJSON(STORE_NAMES.CUSTOM_ROOMS, room.id, room);
    return json(201, { room: publicRoomSummary(room) });
  }

  if (action === 'joinRoom') {
    const room = await getJSON(STORE_NAMES.CUSTOM_ROOMS, payload.roomId);
    if (!room) return json(404, { error: 'ルームが見つかりません' });
    if (room.visibility === 'private' && !room.members.includes(email)) {
      if (!payload.password || hashPassword(payload.password) !== room.passwordHash) {
        return json(401, { error: 'パスワードが違います' });
      }
    }
    if (!room.members.includes(email)) room.members.push(email);
    await setJSON(STORE_NAMES.CUSTOM_ROOMS, room.id, room);
    return json(200, { ok: true, roomId: room.id });
  }

  if (action === 'leaveRoom') {
    const room = await getJSON(STORE_NAMES.CUSTOM_ROOMS, payload.roomId);
    if (!room) return json(404, { error: 'ルームが見つかりません' });
    delete (room.participants || {})[email];
    if (room.ownerEmail !== email) room.members = room.members.filter((m) => m !== email);
    await setJSON(STORE_NAMES.CUSTOM_ROOMS, room.id, room);
    return json(200, { ok: true });
  }

  if (action === 'deleteRoom') {
    const room = await getJSON(STORE_NAMES.CUSTOM_ROOMS, payload.roomId);
    if (!room) return json(404, { error: 'ルームが見つかりません' });
    const isAdmin = Boolean(await requireAdmin(payload.token));
    if (room.ownerEmail !== email && !isAdmin) return json(403, { error: 'ルーム作成者または運営のみ削除できます' });
    await deleteKey(STORE_NAMES.CUSTOM_ROOMS, room.id);
    return json(200, { ok: true });
  }

  // アバターの位置・見た目を更新する(移動のたびにクライアント側で間引いて送信する想定)
  if (action === 'updateParticipant') {
    const room = await getJSON(STORE_NAMES.CUSTOM_ROOMS, payload.roomId);
    if (!room) return json(404, { error: 'ルームが見つかりません' });
    if (room.visibility === 'private' && !room.members.includes(email)) return json(403, { error: '参加していません' });

    room.participants = room.participants || {};
    const position = payload.position && typeof payload.position === 'object' ? {
      x: Math.max(-100, Math.min(100, Number(payload.position.x) || 0)),
      y: Math.max(-100, Math.min(100, Number(payload.position.y) || 0)),
      z: Math.max(-100, Math.min(100, Number(payload.position.z) || 0))
    } : null;
    room.participants[email] = {
      x: position ? 500 + position.x * 45 : Math.max(0, Math.min(1000, Number(payload.x) || 0)),
      y: position ? 300 + position.z * 45 : Math.max(0, Math.min(600, Number(payload.y) || 0)),
      ...(position ? { position } : {}),
      rotation: Math.max(-1000, Math.min(1000, Number(payload.rotation) || 0)),
      facing: ['up', 'down', 'left', 'right'].includes(payload.facing) ? payload.facing : 'down',
      avatar: payload.avatar && typeof payload.avatar === 'object' ? {
        skin: /^#[0-9a-f]{6}$/i.test(String(payload.avatar.skin || '')) ? payload.avatar.skin : '#f1c27d',
        hair: /^#[0-9a-f]{6}$/i.test(String(payload.avatar.hair || '')) ? payload.avatar.hair : '#2c2c2c',
        outfit: /^#[0-9a-f]{6}$/i.test(String(payload.avatar.outfit || '')) ? payload.avatar.outfit : '#5b8cff',
        eyes: /^#[0-9a-f]{6}$/i.test(String(payload.avatar.eyes || '')) ? payload.avatar.eyes : '#2c2c2c',
        hairStyle: ['short', 'long', 'bun', 'bald'].includes(payload.avatar.hairStyle) ? payload.avatar.hairStyle : 'short'
      } : {},
      displayName: String(payload.displayName || email).slice(0, 40),
      updatedAt: new Date().toISOString()
    };
    pruneParticipants(room);
    await setJSON(STORE_NAMES.CUSTOM_ROOMS, room.id, room);
    return json(200, { participants: room.participants });
  }

  if (action === 'sendMessage') {
    const room = await getJSON(STORE_NAMES.CUSTOM_ROOMS, payload.roomId);
    if (!room) return json(404, { error: 'ルームが見つかりません' });
    if (room.visibility === 'private' && !room.members.includes(email)) return json(403, { error: '参加していません' });
    const text = (payload.text || '').trim().slice(0, MAX_MESSAGE_LEN);
    if (!text) return json(400, { error: '本文を入力してください' });
    room.messages = room.messages || [];
    room.messages.push({ id: newId(), authorEmail: email, authorName: payload.displayName || email, text, createdAt: new Date().toISOString() });
    room.messages = room.messages.slice(-200); // 直近200件だけ保持
    await setJSON(STORE_NAMES.CUSTOM_ROOMS, room.id, room);
    return json(200, { ok: true });
  }

  return json(400, { error: '不明なactionです' });
}
