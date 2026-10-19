const crypto = require('crypto');
const { STORE_NAMES, getJSON, listKeys } = require('./store');

function newId() { return crypto.randomBytes(8).toString('hex'); }

async function getGeminiKeyRecords() {
  const configured = await getJSON(STORE_NAMES.ADMIN_SECRETS, 'gemini:apiKeys');
  const legacy = await getJSON(STORE_NAMES.ADMIN_SECRETS, 'gemini:apiKey');
  const rows = [];
  if (process.env.GEMINI_API_KEY) rows.push({ id:'env', apiKey:process.env.GEMINI_API_KEY, enabled:true, order:-100 });
  const stored = Array.isArray(configured) ? configured : (Array.isArray(configured?.keys) ? configured.keys : (configured?.apiKey ? [configured] : []));
  for (const row of stored) {
    const apiKey = String(row?.apiKey || '').trim();
    if (apiKey && row.enabled !== false) rows.push({ id:String(row.id || newId()), apiKey, enabled:true, order:Number(row.order)||0 });
  }
  if (!stored.length && legacy?.apiKey) rows.push({ id:'legacy', apiKey:String(legacy.apiKey), enabled:true, order:0 });
  return rows.sort((a,b)=>a.order-b.order);
}

async function getGeminiRuntimeSettings() {
  const saved = await getJSON(STORE_NAMES.ADMIN_SECRETS, 'gemini:runtimeSettings') || {};
  const roster = [];
  try {
    for (const key of await listKeys(STORE_NAMES.ACCOUNTS)) {
      const account = await getJSON(STORE_NAMES.ACCOUNTS, key);
      if (!account || (!account.isAdmin && !account.isDeputyAdmin && !account.isOperator)) continue;
      const role = account.isAdmin ? '主運営' : account.isDeputyAdmin ? '副運営' : '運営';
      roster.push(`${account.displayName || account.email || key} (${account.email || key}): ${role}`);
    }
  } catch (_) { /* 運営一覧を読めない環境では固定設定だけで続行 */ }
  const rosterPrompt = roster.length ? `\n\n現在のMixAll +運営区分（ユーザーに公開される範囲の情報）:\n${roster.join('\n')}` : '';
  return { fixedPrompt:'', allowUserReply:true, allowGeminiReply:true, readUch:true, readGhost:true, ...saved, fixedPrompt:`${String(saved.fixedPrompt || '')}${rosterPrompt}` };
}

// 旧作者のManus中継サーバーは既定では使わない。必要なら GEMINI_RELAY_URL と GEMRELAY_SHARED_TOKEN を設定する。
const DEFAULT_RELAY_URL = '';
function relayUrl() {
  return String(process.env.GEMINI_RELAY_URL || DEFAULT_RELAY_URL).trim().replace(/\/$/, '');
}

async function callGeminiRelay({ body, timeoutMs = 25000 }) {
  const token = String(process.env.GEMRELAY_SHARED_TOKEN || process.env.MANUS_GEMINI_RELAY_TOKEN || '').trim();
  if (!token || !relayUrl()) return { ok:false, status:0, data:{}, error:'GemRelayは設定されていません（GEMINI_API_KEYを設定してください）' };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${relayUrl()}/api/gemini`, {
      method:'POST',
      headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`},
      signal:controller.signal,
      body:JSON.stringify(body)
    });
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch (_) {}
    if (response.ok && Array.isArray(data.candidates)) return { ok:true, status:response.status, data, keyId:'manus-relay' };
    return { ok:false, status:response.status || 503, data, error:data.error?.message || data.error || `GemRelayエラー (${response.status})` };
  } catch (error) {
    return { ok:false, status:503, data:{}, error:error.name === 'AbortError' ? 'GemRelayタイムアウト' : 'GemRelayネットワークエラー' };
  } finally { clearTimeout(timeout); }
}

async function callGemini({ model, body, timeoutMs = 25000 }) {
  const keys = await getGeminiKeyRecords();
  if (!keys.length) return callGeminiRelay({ body, timeoutMs });
  const failures = [];
  for (const entry of keys) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method:'POST', headers:{'Content-Type':'application/json','X-goog-api-key':entry.apiKey}, signal:controller.signal, body:JSON.stringify(body) });
      const raw = await response.text(); let data={}; try { data=raw?JSON.parse(raw):{}; } catch { data={}; }
      if (response.ok) return { ok:true, status:response.status, data, keyId:entry.id };
      failures.push(`${response.status}`);
    } catch (error) { failures.push(error.name === 'AbortError' ? 'timeout' : 'network'); }
    finally { clearTimeout(timeout); }
  }
  const relay = await callGeminiRelay({ body, timeoutMs });
  if (relay.ok) return relay;
  return { ok:false, status:503, data:{}, error:`Gemini直接接続とGemRelayの両方に失敗しました（直接: ${failures.join(', ')} / 中継: ${relay.error}）` };
}

module.exports = { getGeminiKeyRecords, getGeminiRuntimeSettings, callGemini, callGeminiRelay };
