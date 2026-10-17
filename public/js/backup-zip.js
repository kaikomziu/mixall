(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MixAllBackupZip = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const textDecoder = new TextDecoder('utf-8', { fatal: true });
  const textEncoder = new TextEncoder();
  const MAX_EOCD_SEARCH = 22 + 65535;
  const MAX_CENTRAL_BYTES = 16 * 1024 * 1024;
  const MAX_ENTRY_BYTES = 64 * 1024 * 1024;
  const PAGE_BYTES = 650000;
  const PAGE_ENTRIES = 100;
  const crcTable = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    crcTable[index] = value >>> 0;
  }

  function u16(view, offset) { return view.getUint16(offset, true); }
  function u32(view, offset) { return view.getUint32(offset, true); }
  function crc32(bytes) {
    let value = 0xffffffff;
    for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
    return (value ^ 0xffffffff) >>> 0;
  }

  async function zipDirectory(file) {
    if (!file || typeof file.slice !== 'function' || !Number.isSafeInteger(file.size) || file.size < 22) throw new Error('ZIPファイルを読み取れません');
    const tailStart = Math.max(0, file.size - MAX_EOCD_SEARCH);
    const tail = new Uint8Array(await file.slice(tailStart).arrayBuffer());
    const tailView = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
    let eocdInTail = -1;
    for (let offset = tail.length - 22; offset >= 0; offset -= 1) {
      if (u32(tailView, offset) !== 0x06054b50) continue;
      const commentLength = u16(tailView, offset + 20);
      if (offset + 22 + commentLength === tail.length) { eocdInTail = offset; break; }
    }
    if (eocdInTail < 0) throw new Error('ZIPの終端を読み込めません');
    const eocd = tailStart + eocdInTail;
    const disk = u16(tailView, eocdInTail + 4);
    const centralDisk = u16(tailView, eocdInTail + 6);
    const diskCount = u16(tailView, eocdInTail + 8);
    const count = u16(tailView, eocdInTail + 10);
    const centralBytes = u32(tailView, eocdInTail + 12);
    const centralOffset = u32(tailView, eocdInTail + 16);
    if (disk || centralDisk || diskCount !== count || count === 0xffff || centralBytes === 0xffffffff || centralOffset === 0xffffffff) {
      throw new Error('分割ZIPまたはZIP64形式には対応していません');
    }
    if (centralBytes > MAX_CENTRAL_BYTES) throw new Error('ZIPの索引が大きすぎます');
    if (centralOffset + centralBytes > eocd || centralOffset + centralBytes > file.size) throw new Error('ZIPの索引位置が不正です');
    const central = new Uint8Array(await file.slice(centralOffset, centralOffset + centralBytes).arrayBuffer());
    const view = new DataView(central.buffer, central.byteOffset, central.byteLength);
    const entries = [];
    let cursor = 0;
    for (let index = 0; index < count; index += 1) {
      if (cursor + 46 > central.length || u32(view, cursor) !== 0x02014b50) throw new Error('ZIP索引が不正です');
      const flags = u16(view, cursor + 8);
      const method = u16(view, cursor + 10);
      const crc = u32(view, cursor + 16);
      const compressedSize = u32(view, cursor + 20);
      const uncompressedSize = u32(view, cursor + 24);
      const nameSize = u16(view, cursor + 28);
      const extraSize = u16(view, cursor + 30);
      const commentSize = u16(view, cursor + 32);
      const localOffset = u32(view, cursor + 42);
      const recordEnd = cursor + 46 + nameSize + extraSize + commentSize;
      if (recordEnd > central.length || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) throw new Error('ZIP索引のサイズ情報が不正です');
      const name = textDecoder.decode(central.subarray(cursor + 46, cursor + 46 + nameSize)).replace(/\\/g, '/');
      if (name.startsWith('/') || name.split('/').includes('..')) throw new Error('ZIPに不正なファイルパスがあります');
      if (flags & 1) throw new Error('暗号化されたZIPには対応していません');
      if (uncompressedSize > MAX_ENTRY_BYTES) throw new Error(`ZIP内の ${name} が大きすぎます (64MB超)`);
      entries.push({ name, flags, method, crc, compressedSize, uncompressedSize, localOffset });
      cursor = recordEnd;
    }
    if (cursor !== central.length) throw new Error('ZIP索引の長さが一致しません');
    return entries;
  }

  async function readEntry(file, entry) {
    if (entry.localOffset + 30 > file.size) throw new Error(`ZIP内の ${entry.name} の位置が不正です`);
    const localBytes = new Uint8Array(await file.slice(entry.localOffset, entry.localOffset + 30).arrayBuffer());
    const localView = new DataView(localBytes.buffer, localBytes.byteOffset, localBytes.byteLength);
    if (u32(localView, 0) !== 0x04034b50) throw new Error(`ZIP内の ${entry.name} のヘッダーが不正です`);
    const nameSize = u16(localView, 26);
    const extraSize = u16(localView, 28);
    const dataStart = entry.localOffset + 30 + nameSize + extraSize;
    const dataEnd = dataStart + entry.compressedSize;
    if (dataEnd > file.size) throw new Error(`ZIP内の ${entry.name} が途中で切れています`);
    const compressed = new Uint8Array(await file.slice(dataStart, dataEnd).arrayBuffer());
    let raw;
    if (entry.method === 0) raw = compressed;
    else if (entry.method === 8) {
      if (typeof globalThis.fflate?.inflateSync === 'function') {
        raw = globalThis.fflate.inflateSync(compressed);
      } else if (typeof DecompressionStream !== 'undefined') {
        try {
          const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
          raw = new Uint8Array(await new Response(stream).arrayBuffer());
        } catch (_) {
          throw new Error('このブラウザーではZIPを展開できません。ページを再読み込みしてからお試しください');
        }
      } else throw new Error('ZIPを展開する機能が読み込まれていません。ページを再読み込みしてください');
    } else throw new Error(`未対応のZIP圧縮方式です: ${entry.method}`);
    if (raw.length !== entry.uncompressedSize) throw new Error(`ZIP内の ${entry.name} の展開サイズが一致しません`);
    if (crc32(raw) !== entry.crc) throw new Error(`ZIP内の ${entry.name} が破損しています (CRC不一致)`);
    return raw;
  }

  async function readJsonEntry(file, entry) {
    const raw = await readEntry(file, entry);
    try { return JSON.parse(textDecoder.decode(raw)); }
    catch (_) { throw new Error(`ZIP内の ${entry.name} のJSONが不正か破損しています`); }
  }

  function blobPartName(entry) { return entry.name.match(/^blob\/([^/]+)\/part-[0-9]{6}\.json$/); }
  function orderedParts(entries, storeName) {
    return entries.filter((entry) => blobPartName(entry)?.[1] === storeName).sort((a, b) => a.name.localeCompare(b.name));
  }

  function addEntryToPageCount(state, entry) {
    if (!entry || typeof entry.key !== 'string' || entry.value === null || entry.value === undefined) throw new Error(`ストア ${state.name} に不正なレコードがあります`);
    const size = textEncoder.encode(JSON.stringify(entry)).length;
    if (size > MAX_ENTRY_BYTES - 65536) throw new Error(`ストア ${state.name} の1件が大きすぎるため復元できません`);
    if (state.pageEntries && (state.pageEntries >= PAGE_ENTRIES || state.pageBytes + size > PAGE_BYTES)) {
      state.pages += 1;
      state.pageEntries = 0;
      state.pageBytes = 2;
    }
    state.pageEntries += 1;
    state.pageBytes += size;
    state.count += 1;
  }

  async function inspect(file, status) {
    const entries = await zipDirectory(file);
    const normalizedEntryName = (name) => String(name || '').replace(/^\.\//, '').replace(/\/+/g, '/');
    const manifestEntry = entries.find((entry) => normalizedEntryName(entry.name) === 'backup/manifest.json')
      || entries.find((entry) => normalizedEntryName(entry.name) === 'manifest.json')
      || entries.find((entry) => normalizedEntryName(entry.name).endsWith('/manifest.json'));
    if (!manifestEntry) {
      const names = entries.slice(0, 8).map((entry) => entry.name).join(', ');
      throw new Error(`ZIPにバックアップmanifestがありません（先頭エントリ: ${names || 'なし'}）。バックアップZIPを選択してください`);
    }
    const manifest = await readJsonEntry(file, manifestEntry);
    const multipart = manifest?.format === 'netrify-multipart-zip-backup';
    if (!['netrify-zip-backup', 'netrify-multipart-zip-backup', 'netrify-data-backup-manifest'].includes(manifest?.format) || !manifest.stores || typeof manifest.stores !== 'object' || Array.isArray(manifest.stores)) throw new Error('対応していないZIPバックアップです');

    const storeStates = {};
    for (const [name, meta] of Object.entries(manifest.stores)) {
      if (!/^[A-Z][A-Z0-9_]*$/.test(name) || !Number.isSafeInteger(Number(meta?.count)) || Number(meta.count) < 0) throw new Error(`manifestのストア情報が不正です: ${name}`);
      storeStates[name] = { name, expected: Number(meta.count), count: 0, pages: 0, pageEntries: 0, pageBytes: 2 };
    }
    const dataEntries = entries.filter((entry) => entry.name.endsWith('.json') && entry.name.startsWith('blob/')).sort((a, b) => a.name.localeCompare(b.name));
    if (!dataEntries.length && Object.values(storeStates).some((state) => state.expected > 0)) throw new Error('バックアップのデータ部分がありません');
    for (let index = 0; index < dataEntries.length; index += 1) {
      const entry = dataEntries[index];
      const match = blobPartName(entry);
      if (!match || !storeStates[match[1]]) throw new Error(`ZIP内にmanifestと一致しないデータがあります: ${entry.name}`);
      const parsed = await readJsonEntry(file, entry);
      if (!Array.isArray(parsed?.entries)) throw new Error(`ZIP内の ${entry.name} にentries配列がありません`);
      for (const row of parsed.entries) addEntryToPageCount(storeStates[match[1]], row);
      if (status && (index % 4 === 0 || index + 1 === dataEntries.length)) status.textContent = `ZIPの整合性を確認中... ${index + 1}/${dataEntries.length}ファイル`;
    }
    const stores = {};
    for (const [name, state] of Object.entries(storeStates)) {
      if (state.count !== state.expected && !multipart) throw new Error(`${name} の件数がmanifestと一致しません (${state.count}/${state.expected})。このバックアップは不完全な可能性があります`);
      if (state.pageEntries) state.pages += 1;
      stores[name] = { count: multipart ? state.expected : state.count, pages: state.pages };
    }
    return {
      format: manifest.dataFormat || 'netrify-data-backup',
      version: Number(manifest.dataVersion || 1),
      passwordData: manifest.passwordData,
      security: manifest.security,
      createdAt: manifest.createdAt,
      multipart,
      backupId: manifest.backupId || null,
      partNumber: manifest.partNumber || null,
      partCount: manifest.partCount || null,
      partMeta: Object.fromEntries(Object.entries(storeStates).map(([name,state])=>[name,{count:state.count,pages:state.pages}])),
      stores
    };
  }

  async function inspectMany(files, status) {
    const list=Array.from(files||[]).filter(Boolean); if(!list.length) throw new Error('ZIPパートがありません');
    const results=[]; for(const file of list) results.push(await inspect(file,status));
    const multi=results.some(x=>x.multipart); if(!multi) return results[0];
    const ids=new Set(results.map(x=>x.backupId).filter(Boolean)); if(ids.size!==1) throw new Error('異なるバックアップのZIPパートが混在しています');
    const nums=results.map(x=>Number(x.partNumber)).sort((a,b)=>a-b); for(let i=0;i<nums.length;i++) if(nums[i]!==i+1) throw new Error(`ZIPパート ${i+1} が不足しています`);
    const base=results[0], stores={}; for(const name of Object.keys(base.stores||{})){ const expected=Number(base.stores[name].count||0); const actual=results.reduce((n,x)=>n+Number(x.partMeta?.[name]?.count||0),0); const pages=results.reduce((n,x)=>n+Number(x.partMeta?.[name]?.pages||0),0); if(actual!==expected) throw new Error(`${name} の合計件数がmanifestと一致しません (${actual}/${expected})`); stores[name]={count:expected,pages}; }
    return {...base, stores, multipart:true, partCount:results.length};
  }
  async function forEachPart(fileOrFiles, storeName, callback, status) {
    const files=Array.isArray(fileOrFiles)?fileOrFiles:[fileOrFiles];
    for(const file of files){ const entries=await zipDirectory(file); const parts=orderedParts(entries,storeName); for(let index=0;index<parts.length;index++){ const parsed=await readJsonEntry(file,parts[index]); if(!Array.isArray(parsed?.entries)) throw new Error(`ZIP内の ${parts[index].name} にentries配列がありません`); await callback(parsed.entries,index,parts.length); if(status) status.textContent=`復元データを読込中... ${storeName} ${index+1}/${parts.length}`; } }
  }
  return { inspect, inspectMany, forEachPart, zipDirectory };
});
