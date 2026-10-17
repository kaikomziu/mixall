const { getJSON, STORE_NAMES } = require('../lib/store');
const { readFileBytes } = require('../lib/media-dedupe');

exports.handler = async (event) => {

  try {
    const hash = String(event.queryStringParameters?.hash || '').toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(hash)) return { statusCode:400, headers:{'Content-Type':'text/plain; charset=utf-8'}, body:'不正な画像IDです' };
    const record = await getJSON(STORE_NAMES.TOOL_DATA, `dedupe-media:${hash}`);
    if (!record?.fileId) return { statusCode:404, headers:{'Content-Type':'text/plain; charset=utf-8'}, body:'画像が見つかりません' };
    const manifest = await getJSON(STORE_NAMES.FILE_MANIFESTS, `${record.fileId}:manifest`);
    if (!manifest?.finalized) return { statusCode:404, headers:{'Content-Type':'text/plain; charset=utf-8'}, body:'画像が見つかりません' };
    const { hash:actualHash, buffer } = await readFileBytes(record.fileId, manifest);
    if (actualHash !== hash) return { statusCode:410, headers:{'Content-Type':'text/plain; charset=utf-8'}, body:'画像の整合性を確認できません' };
    return { statusCode:200, isBase64Encoded:true, headers:{'Content-Type':record.type || manifest.mimeType || 'image/octet-stream','Cache-Control':'public, max-age=31536000, immutable','Content-Length':String(buffer.length)}, body:buffer.toString('base64') };
  } catch (error) {
    console.error('media function error:', error);
    return { statusCode:500, headers:{'Content-Type':'text/plain; charset=utf-8'}, body:'画像を読み込めませんでした' };
  }
};
