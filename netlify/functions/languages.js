const crypto = require('crypto');
const { STORE_NAMES, getJSON, setJSON, deleteKey, listKeys } = require('../lib/store');
const { getSessionInfo } = require('../lib/session');

function json(status, body) { return { statusCode: status, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) }; }
function newId(prefix) { return `${prefix}_${crypto.randomBytes(8).toString('hex')}`; }
function clean(value, max) { return String(value || '').trim().slice(0, max); }

exports.handler = async (event) => {

  try {
    const qs = event.queryStringParameters || {};
    if (event.httpMethod === 'GET') {
      const info = await getSessionInfo(qs.token);
      if (!info) return json(401, { error: 'ログインが必要です' });
      const keys = await listKeys(STORE_NAMES.LANGUAGES);
      const languages = [];
      for (const key of keys) { const item = await getJSON(STORE_NAMES.LANGUAGES, key); if (item) languages.push(item); }
      languages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      return json(200, { languages });
    }
    if (event.httpMethod !== 'POST') return json(405, { error: '未対応のメソッドです' });
    const payload = JSON.parse(event.body || '{}');
    const info = await getSessionInfo(payload.token);
    if (!info) return json(401, { error: 'ログインが必要です' });
    if (payload.action === 'createLanguage') {
      const name = clean(payload.name, 60);
      const description = clean(payload.description, 300);
      if (!name) return json(400, { error: '言語名を入力してください' });
      const language = { id: newId('lang'), name, description, ownerEmail: info.email, entries: [], createdAt: new Date().toISOString() };
      await setJSON(STORE_NAMES.LANGUAGES, language.id, language);
      return json(201, { language });
    }
    if (payload.action === 'addEntry') {
      const languageId = clean(payload.languageId, 100);
      const language = await getJSON(STORE_NAMES.LANGUAGES, languageId);
      if (!language) return json(404, { error: '言語が見つかりません' });
      if (language.ownerEmail !== info.email && !info.isAdmin && !info.isOfficial) return json(403, { error: 'この辞書を編集する権限がありません' });
      const label = clean(payload.label, 40);
      const meaning = clean(payload.meaning, 160);
      const imageDataUrl = String(payload.imageDataUrl || '');
      if (!label || !imageDataUrl.startsWith('data:image/')) return json(400, { error: '文字名と画像を指定してください' });
      if (imageDataUrl.length > 180000) return json(400, { error: '文字画像が大きすぎます。小さなPNG/JPGを使用してください' });
      const entry = { id: newId('glyph'), label, meaning, imageDataUrl, createdAt: new Date().toISOString() };
      language.entries = Array.isArray(language.entries) ? language.entries : [];
      language.entries.push(entry);
      language.updatedAt = new Date().toISOString();
      await setJSON(STORE_NAMES.LANGUAGES, language.id, language);
      return json(201, { language, entry });
    }
    if (payload.action === 'deleteLanguage') {
      const language = await getJSON(STORE_NAMES.LANGUAGES, clean(payload.languageId, 100));
      if (!language) return json(404, { error: '言語が見つかりません' });
      if (language.ownerEmail !== info.email && !info.isAdmin) return json(403, { error: '削除する権限がありません' });
      await deleteKey(STORE_NAMES.LANGUAGES, language.id);
      return json(200, { ok: true });
    }
    return json(400, { error: '不明なactionです' });
  } catch (error) {
    console.error('languages function error:', error);
    return json(500, { error: `内部エラー: ${error.message}` });
  }
};
