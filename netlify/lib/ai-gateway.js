const { getJSON } = require('./store');

function gatewayReady() {
  return Boolean(String(process.env.OPENAI_BASE_URL || '').trim() && String(process.env.OPENAI_API_KEY || '').trim());
}

function operatorContext(room, profiles = {}) {
  const rows = (Array.isArray(room?.memberEmails) ? room.memberEmails : []).map((email) => {
    const profile = profiles[email] || {};
    const roles = [];
    if (email === room.hostEmail) roles.push('このルームの主運営');
    if (Array.isArray(room.subHosts) && room.subHosts.includes(email)) roles.push('このルームの副運営');
    if (profile.isAdmin) roles.push('サイト主運営');
    else if (profile.isDeputyAdmin) roles.push('サイト副運営');
    else if (profile.isOperator) roles.push('サイト運営');
    return `${profile.displayName || email} (${email})${roles.length ? `: ${roles.join('・')}` : ': 一般メンバー'}`;
  });
  return rows.length ? rows.join('\n') : '運営区分を確認できるメンバー情報はありません。';
}

async function callAiGateway({ model = 'gpt-5-mini', system = '', user = '', timeoutMs = 25000 }) {
  if (!gatewayReady()) return { ok:false, status:503, error:'Netlify AI Gatewayが未有効です' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${String(process.env.OPENAI_BASE_URL).replace(/\/$/, '')}/chat/completions`, {
      method:'POST',
      headers:{'Content-Type':'application/json', Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},
      signal:controller.signal,
      body:JSON.stringify({
        model,
        messages:[{role:'system',content:String(system).slice(0,12000)},{role:'user',content:String(user).slice(0,18000)}],
        temperature:0.35,
        max_completion_tokens:1400
      })
    });
    const data = await response.json().catch(() => ({}));
    const text = data.choices?.[0]?.message?.content;
    if (!response.ok || typeof text !== 'string') return { ok:false, status:response.status || 503, error:data.error?.message || 'AI Gatewayの応答を取得できませんでした' };
    return { ok:true, status:response.status, text:text.trim(), model:data.model || model, usage:data.usage || null };
  } catch (error) {
    return { ok:false, status:503, error:error.name === 'AbortError' ? 'AI Gatewayがタイムアウトしました' : 'AI Gatewayへ接続できませんでした' };
  } finally { clearTimeout(timer); }
}

module.exports = { gatewayReady, callAiGateway, operatorContext };
