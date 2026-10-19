const crypto = require('crypto');
const { STORE_NAMES, getJSON, setJSON, deleteKey, listKeys } = require('../lib/store');
const { requireSession, requireAdmin } = require('../lib/session');

function json(status, body) { return { statusCode: status, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) }; }
function id() { return crypto.randomBytes(12).toString('hex'); }
function cleanText(value, max = 500) { return String(value ?? '').trim().slice(0, max); }
function cleanId(value) { const s = String(value || '').trim(); return /^[a-zA-Z0-9_-]{3,64}$/.test(s) ? s : ''; }
function publicExtension(item, includeBundle = false) {
  if (!item) return null;
  const result = { id:item.id, name:item.name, version:item.version, description:item.description, author:item.author, icon:item.icon || '🧩', enabled:item.enabled !== false, permissions:item.permissions || [], createdAt:item.createdAt, updatedAt:item.updatedAt };
  if (includeBundle) { result.manifest = item.manifest || {}; result.bundle = item.bundle || ''; }
  return result;
}
function dataKey(extensionId, email) { return `${extensionId}:${crypto.createHash('sha256').update(String(email).toLowerCase()).digest('hex')}`; }
async function allExtensions() {
  const result = [];
  for (const key of await listKeys(STORE_NAMES.EXTENSIONS)) { const item = await getJSON(STORE_NAMES.EXTENSIONS, key); if (item?.id) result.push(item); }
  return result.sort((a,b) => String(a.name).localeCompare(String(b.name), 'ja'));
}
function validatePackage(payload) {
  const extensionId = cleanId(payload.id);
  if (!extensionId) throw new Error('拡張機能IDは英数字・_・-の3〜64文字で指定してください');
  const name = cleanText(payload.name, 80); if (!name) throw new Error('拡張機能名が必要です');
  const bundle = String(payload.bundle || '');
  if (!bundle || bundle.length > 600000) throw new Error('実行コードは1文字以上600,000文字以内で指定してください');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(bundle)) throw new Error('実行コードに制御文字は使用できません');
  return { id:extensionId, name, version:cleanText(payload.version || '1.0.0', 30), description:cleanText(payload.description, 600), author:cleanText(payload.author || 'MixAll +運営', 80), icon:cleanText(payload.icon || '🧩', 8) || '🧩', permissions:Array.isArray(payload.permissions) ? payload.permissions.map((x)=>cleanText(x,40)).filter(Boolean).slice(0,20) : [], manifest:typeof payload.manifest === 'object' && payload.manifest ? payload.manifest : {}, bundle };
}

exports.handler = async (event) => {

  try {
    const method = event.httpMethod;
    if (method === 'GET') {
      const qs = event.queryStringParameters || {};
      const email = await requireSession(qs.token);
      if (!email) return json(401, { error:'ログインが必要です' });
      const rows = await allExtensions();
      const item = qs.id ? rows.find((x) => x.id === cleanId(qs.id)) : null;
      if (item) return item.enabled === false ? json(404, { error:'この拡張機能は停止中です' }) : json(200, { extension:publicExtension(item, true) });
      return json(200, { extensions:rows.filter((x)=>x.enabled !== false).map((x)=>publicExtension(x)) });
    }
    if (method !== 'POST') return json(405, { error:'POSTのみ対応しています' });
    let payload; try { payload = JSON.parse(event.body || '{}'); } catch { return json(400, { error:'不正なJSONです' }); }
    const action = String(payload.action || '');
    const admin = await requireAdmin(payload.token);
    if (['create','update','delete','toggle','listAdmin'].includes(action)) {
      if (!admin) return json(403, { error:'拡張機能の管理は運営のみ利用できます' });
      const rows = await allExtensions();
      if (action === 'listAdmin') return json(200, { extensions:rows.map((x)=>publicExtension(x, true)) });
      const extensionId = cleanId(payload.id);
      const current = rows.find((x)=>x.id === extensionId);
      if (action === 'delete') { if (!current) return json(404,{error:'拡張機能が見つかりません'}); await deleteKey(STORE_NAMES.EXTENSIONS, extensionId); return json(200,{ok:true}); }
      if (action === 'toggle') { if (!current) return json(404,{error:'拡張機能が見つかりません'}); current.enabled=payload.enabled === true; current.updatedAt=new Date().toISOString(); await setJSON(STORE_NAMES.EXTENSIONS, extensionId, current); return json(200,{extension:publicExtension(current,true)}); }
      const next = validatePackage({ ...payload, id: action === 'update' ? extensionId : payload.id });
      if (action === 'create' && current) return json(409,{error:'同じIDの拡張機能が既に存在します'});
      if (action === 'update' && !current) return json(404,{error:'更新対象の拡張機能が見つかりません'});
      const now = new Date().toISOString();
      const item = { ...(current || {}), ...next, enabled: current ? current.enabled !== false : true, createdAt:current?.createdAt || now, updatedAt:now, updatedBy:admin.email };
      await setJSON(STORE_NAMES.EXTENSIONS, item.id, item);
      return json(200,{extension:publicExtension(item,true)});
    }
    const email = await requireSession(payload.token);
    if (!email) return json(401,{error:'ログインが必要です'});
    const extensionId = cleanId(payload.extensionId);
    const extension = (await allExtensions()).find((x)=>x.id===extensionId && x.enabled !== false);
    if (!extension) return json(404,{error:'利用可能な拡張機能が見つかりません'});
    if (action === 'dataGet') {
      const record = await getJSON(STORE_NAMES.EXTENSION_DATA, dataKey(extensionId,email));
      return json(200,{data:record?.data ?? null});
    }
    if (action === 'dataSet') {
      const raw = payload.data;
      const serialized = JSON.stringify(raw);
      if (serialized.length > 2 * 1024 * 1024) return json(413,{error:'拡張機能データが大きすぎます'});
      await setJSON(STORE_NAMES.EXTENSION_DATA, dataKey(extensionId,email), { extensionId, email, data:raw, updatedAt:new Date().toISOString() });
      return json(200,{ok:true});
    }
    return json(400,{error:'不明なactionです'});
  } catch (error) { console.error('extensions function error', error); return json(400,{error:error.message || '拡張機能処理に失敗しました'}); }
};
