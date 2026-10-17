const crypto = require('crypto');
const { getJSON, setJSON, deleteKey, STORE_NAMES } = require('./store');

// x.gd APIキーは既存のサーバー側難読化キーを共通利用する。
// x.gd のAPIキーは環境変数から読む（旧作者のキーは埋め込まない）。未設定なら重複排除・短縮はスキップ。
const XGD_API_KEY = String(process.env.XGD_API_KEY || '').trim();
const MAX_PUBLIC_IMAGE_BYTES = 12 * 1024 * 1024;

function publicBase(event) {
  const headers = event.headers || {};
  const host = headers['x-forwarded-host'] || headers.host || '';
  const proto = headers['x-forwarded-proto'] || 'https';
  return /^[a-z0-9.-]+(?::\d+)?$/i.test(host) ? `${proto}://${host}` : 'https://mix-alls.netlify.app';
}

function imageType(type) { return /^image\/[a-z0-9.+-]+$/i.test(String(type || '')); }

async function readFileBytes(fileId, manifest) {
  const cryptoHash = crypto.createHash('sha256');
  const chunks = [];
  for (let index = 0; index < Number(manifest.totalChunks || 0); index += 1) {
    const item = await getJSON(STORE_NAMES.FILE_CHUNKS, `${fileId}:chunk:${index}`);
    if (!item || typeof item.data !== 'string') throw new Error('画像チャンクが見つかりません');
    const bytes = Buffer.from(item.data, 'base64');
    cryptoHash.update(bytes);
    chunks.push(bytes);
  }
  const buffer = Buffer.concat(chunks);
  if (buffer.length > MAX_PUBLIC_IMAGE_BYTES) throw new Error('公開画像は12MBまでです');
  return { hash: cryptoHash.digest('hex'), buffer };
}

async function requestXgd(target) {
  if (!XGD_API_KEY) throw new Error('XGD_API_KEYが未設定です');
  const url = new URL('https://xgd.io/V1/shorten');
  url.searchParams.set('url', target);
  url.searchParams.set('key', XGD_API_KEY);
  url.searchParams.set('analytics', 'true');
  url.searchParams.set('filterbots', 'true');
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || Number(result.status) !== 200 || !result.shorturl) throw new Error(result.message || 'x.gd短縮URLを発行できませんでした');
  return result.shorturl;
}

async function removeUploadedFile(fileId, manifest) {
  for (let index = 0; index < Number(manifest.totalChunks || 0); index += 1) {
    await deleteKey(STORE_NAMES.FILE_CHUNKS, `${fileId}:chunk:${index}`);
  }
  await deleteKey(STORE_NAMES.FILE_MANIFESTS, `${fileId}:manifest`);
}

async function dedupeImageAttachment(event, attachment, ownerEmail) {
  if (!attachment || !attachment.fileId || !imageType(attachment.type) || attachment.isStamp) return attachment;
  const fileId = String(attachment.fileId).trim();
  const manifest = await getJSON(STORE_NAMES.FILE_MANIFESTS, `${fileId}:manifest`);
  if (!manifest?.finalized) throw new Error('添付ファイルのアップロードが完了していません');
  if (manifest.ownerEmail !== ownerEmail) throw new Error('この添付ファイルを投稿する権限がありません');
  const { hash, buffer } = await readFileBytes(fileId, manifest);
  const key = `dedupe-media:${hash}`;
  const existing = await getJSON(STORE_NAMES.TOOL_DATA, key);
  if (existing?.shortUrl && existing?.mediaUrl) {
    if (existing.fileId !== fileId) await removeUploadedFile(fileId, manifest);
    return { ...attachment, fileId:undefined, mediaHash:hash, mediaUrl:existing.mediaUrl, shortUrl:existing.shortUrl, sizeBytes:existing.sizeBytes || buffer.length };
  }
  const mediaUrl = `${process.env.MIXALL_API_BASE || (publicBase(event) + '/.netlify/functions')}/media?hash=${hash}`;
  const shortUrl = await requestXgd(mediaUrl);
  const record = { hash, fileId, mediaUrl, shortUrl, type:String(attachment.type || manifest.mimeType || 'image/octet-stream'), name:String(attachment.name || manifest.fileName || 'image'), sizeBytes:buffer.length, createdAt:new Date().toISOString() };
  await setJSON(STORE_NAMES.TOOL_DATA, key, record);
  return { ...attachment, fileId:undefined, mediaHash:hash, mediaUrl, shortUrl, sizeBytes:buffer.length };
}

module.exports = { dedupeImageAttachment, readFileBytes, imageType };
