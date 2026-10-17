// netlify/functions/files.js
// 全サービス共通の「チャンク連結」ファイルストレージ。
//
// Netlify Functionsは1リクエストあたり約6MB(Base64だと実質4.5MB程度)という上限があるため、
// 大きなファイルを1回のリクエストで保存・取得することはできない。
// そこでファイルを小さなチャンク(既定2MB)に分割し、それぞれ別のBlobキーとして保存。
// 「どのチャンクを何個、どの順番で繋げば元のファイルに戻るか」を記録した
// マニフェスト(manifest)を1つ持つことで、"鎖のように繋がったBlob" を1ファイルとして扱う。
//
// アップロード: クライアントがファイルをチャンクに分割し、1チャンクずつ順番に送信 → 最後にfinalize
// ダウンロード: マニフェストを取得 → 各チャンクを順番に取得 → クライアント側で結合してBlobを復元

const crypto = require('crypto');
const { STORE_NAMES, getJSON, setJSON, deleteKey, listKeys } = require('../lib/store');
const { requireSession } = require('../lib/session');

const MAX_CHUNK_B64_BYTES = 3 * 1024 * 1024; // 1チャンクのBase64サイズ上限(安全マージン込み)

function json(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) };
}
function newId() { return crypto.randomBytes(12).toString('hex'); }
function chunkKey(fileId, index) { return `${fileId}:chunk:${index}`; }
function manifestKey(fileId) { return `${fileId}:manifest`; }

exports.handler = async (event) => {

  try { return await handle(event); } catch (err) {
    console.error('files function error:', err);
    return json(500, { error: `内部エラー: ${err.message}` });
  }
};

async function handle(event) {
  const method = event.httpMethod;
  const qs = event.queryStringParameters || {};

  if (method === 'GET') {
    const token = qs.token;
    const email = await requireSession(token);
    if (!email) return json(401, { error: 'ログインが必要です' });

    const fileId = qs.fileId;
    if (!fileId) return json(400, { error: 'fileIdが必要です' });

    if (qs.chunkIndex !== undefined) {
      const chunk = await getJSON(STORE_NAMES.FILE_CHUNKS, chunkKey(fileId, Number(qs.chunkIndex)));
      if (!chunk) return json(404, { error: 'チャンクが見つかりません' });
      return json(200, { data: chunk.data });
    }

    const manifest = await getJSON(STORE_NAMES.FILE_MANIFESTS, manifestKey(fileId));
    if (!manifest || !manifest.finalized) return json(404, { error: 'ファイルが見つかりません' });
    return json(200, { manifest });
  }

  if (method !== 'POST') return json(405, { error: '未対応のメソッドです' });

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return json(400, { error: '不正なリクエストです' }); }

  const email = await requireSession(payload.token);
  if (!email) return json(401, { error: 'ログインが必要です' });

  const { action } = payload;

  // 1チャンク分をアップロードする。fileIdは最初のチャンク送信時にクライアントが生成して渡す。
  if (action === 'uploadChunk') {
    const fileId = String(payload.fileId || '').trim();
    const index = Number(payload.chunkIndex);
    const total = Number(payload.totalChunks);
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(fileId) || !Number.isSafeInteger(index) || !Number.isSafeInteger(total) || total <= 0 || index < 0 || index >= total) {
      return json(400, { error: 'チャンク情報が不正です' });
    }
    if (typeof payload.data !== 'string') return json(400, { error:'チャンクデータが不正です' });
    const data = payload.data;
    if (data.length > MAX_CHUNK_B64_BYTES) return json(400, { error: 'チャンクが大きすぎます(内部エラー: 分割サイズ不正)' });
    let manifest = await getJSON(STORE_NAMES.FILE_MANIFESTS, manifestKey(fileId));
    if (manifest && manifest.ownerEmail !== email) return json(403, { error:'このファイルへチャンクを追加する権限がありません' });
    if (manifest && (manifest.totalChunks !== total || manifest.finalized)) return json(409, { error:'アップロード済みファイルのチャンク構成を変更できません' });
    const receivedCount=Array.isArray(manifest?.receivedChunks)?manifest.receivedChunks.length:Number(manifest?.receivedChunks)||0;
    if (index > receivedCount) return json(409,{error:'チャンクは順番にアップロードしてください'});
    await setJSON(STORE_NAMES.FILE_CHUNKS, chunkKey(fileId, index), { data });

    // 進捗管理用の仮マニフェスト(finalizeされるまでダウンロードには使わせない)
    if (!manifest) {
      manifest = {
        fileId, ownerEmail: email, fileName: String(payload.fileName || 'file').slice(0, 200),
        mimeType: String(payload.mimeType || 'application/octet-stream').slice(0, 100),
        totalChunks: total, totalBytes: 0, receivedChunks: 0, finalized: false, createdAt: new Date().toISOString()
      };
    }
    manifest.receivedChunks=receivedCount+(index===receivedCount?1:0);
    await setJSON(STORE_NAMES.FILE_MANIFESTS, manifestKey(fileId), manifest);

    return json(200, { received: Array.isArray(manifest.receivedChunks) ? manifest.receivedChunks.length : Number(manifest.receivedChunks) || 0, totalChunks: total });
  }

  // 全チャンク送信後に呼び出し、ファイルを「完成」させる。
  if (action === 'finalize') {
    const fileId = String(payload.fileId || '').trim();
    if (!fileId) return json(400, { error: 'fileIdが必要です' });
    // Blobは保存直後にmanifestが一時的に見えないことがあるため、manifestと各チャンクを再確認する。
    let manifest = null;
    let totalChunks = Number(payload.totalChunks) || 0;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      manifest = await getJSON(STORE_NAMES.FILE_MANIFESTS, manifestKey(fileId));
      if (manifest && manifest.ownerEmail !== email) return json(403, { error: 'このファイルを確定する権限がありません' });
      if (manifest?.finalized) return json(200, { manifest });
      totalChunks = Number(manifest?.totalChunks || totalChunks);
      const receivedCount=Array.isArray(manifest?.receivedChunks)?manifest.receivedChunks.length:Number(manifest?.receivedChunks)||0;
      if (totalChunks > 0 && receivedCount === totalChunks) break;
      if (attempt < 7) await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
    if (totalChunks <= 0 || !manifest) return json(404, { error: 'アップロード中のファイルが見つかりません。時間を置いて再試行してください' });
    const receivedCount=Array.isArray(manifest.receivedChunks)?manifest.receivedChunks.length:Number(manifest.receivedChunks)||0;
    if (receivedCount!==totalChunks) return json(400,{error:`チャンクが不足しています (${receivedCount}/${totalChunks})`});
    const totalBytes = Number(payload.totalBytes) || 0;
    if (!Number.isSafeInteger(totalBytes) || totalBytes < 0) return json(400, { error:'ファイルサイズ情報が不正です' });

    manifest.totalChunks = totalChunks;
    manifest.fileName = String(manifest.fileName || payload.fileName || 'file').slice(0, 200);
    manifest.mimeType = String(manifest.mimeType || payload.mimeType || 'application/octet-stream').slice(0, 100);
    manifest.finalized = true;
    manifest.totalBytes = totalBytes;
    manifest.finalizedAt = new Date().toISOString();
    delete manifest.receivedChunks;
    await setJSON(STORE_NAMES.FILE_MANIFESTS, manifestKey(fileId), manifest);
    return json(200, { manifest });
  }

  // アップロードを中断した場合などの後片付け(任意)
  if (action === 'deleteFile') {
    const fileId = String(payload.fileId || '').trim();
    const manifest = await getJSON(STORE_NAMES.FILE_MANIFESTS, manifestKey(fileId));
    if (!manifest || manifest.ownerEmail !== email) return json(404, { error: 'ファイルが見つかりません' });
    for (let i = 0; i < manifest.totalChunks; i++) await deleteKey(STORE_NAMES.FILE_CHUNKS, chunkKey(fileId, i));
    await deleteKey(STORE_NAMES.FILE_MANIFESTS, manifestKey(fileId));
    return json(200, { ok: true });
  }

  return json(400, { error: '不明なactionです' });
}
