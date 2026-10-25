// コドミル(親子の見守り)の子ども側。見守り対象のアカウントでだけ動く: 利用時間を数え、上限・就寝時間・使えないサービスのときは画面をロックする。
(function () {
  if (window.self !== window.top) return;
  const sess = () => { try { return JSON.parse(localStorage.getItem('netrify_session') || 'null'); } catch (_) { return null; } };
  const EXEMPT = /^\/(Kodomiru|login|register|account|emergency|unlock|age|reset-password|privacy|terms)(\/|$|\.)/i;
  const SVC = [[/^\/uch/i, 'uch'], [/^\/pocket/i, 'pocket'], [/^\/ghost/i, 'ghost'], [/^\/fomasu/i, 'fomasu'], [/^\/mail/i, 'mail'], [/^\/(maws|tools)/i, 'maws'], [/^\/create/i, 'create'], [/^\/store/i, 'store']];
  const svc = () => { const p = location.pathname; const m = SVC.find(([r]) => r.test(p)); return m ? m[1] : 'other'; };
  const s0 = sess(); if (!s0 || !s0.token) return;
  const cached = (() => { try { return JSON.parse(sessionStorage.getItem('kd_role') || 'null'); } catch (_) { return null; } })();
  if (cached && cached.role !== 'child' && Date.now() - cached.at < 10 * 60e3) return;
  let state = null, last = Date.now(), warned = false, ov = null;
  async function call(action, extra) { const s = sess(); if (!s) return null; const r = await fetch('/api/kodomiru', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, token: s.token, ...extra }) }).catch(() => null); return r && r.ok ? r.json().catch(() => null) : null; }
  function banner() {
    if (document.getElementById('kdBadge')) return;
    const b = document.createElement('a'); b.id = 'kdBadge'; b.href = '/Kodomiru/'; b.textContent = '🧒 見守り中'; b.style.cssText = 'position:fixed;left:8px;bottom:calc(86px + env(safe-area-inset-bottom));z-index:2147482000;background:rgba(20,22,27,.78);color:#fff;font-size:.72rem;padding:3px 10px;border-radius:999px;text-decoration:none';
    document.body.appendChild(b);
  }
  function show(msg, extendable) {
    if (!ov) { ov = document.createElement('div'); ov.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#14161b;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;font-family:system-ui,sans-serif'; document.body.appendChild(ov); }
    ov.innerHTML = '<div style="font-size:3rem">🔒</div><div style="font-size:1.2rem;font-weight:700">' + msg + '</div><div style="opacity:.75;font-size:.9rem">コドミル(保護者の設定)で、いまは使えません</div><div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">' + (extendable ? '<button id="kdAsk" style="padding:10px 18px;border-radius:10px;border:0;font-weight:700">⏰ 延長をお願いする</button>' : '') + '<a href="/Kodomiru/" style="padding:10px 18px;border-radius:10px;background:#2a2f3a;color:#fff;text-decoration:none">コドミルを開く</a></div>';
    const ask = ov.querySelector('#kdAsk'); if (ask) ask.onclick = async () => { await call('requestExtend'); ask.textContent = 'お願いしました'; ask.disabled = true; };
  }
  const hide = () => { if (ov) { ov.remove(); ov = null; } };
  function apply(d) {
    if (!d || d.role !== 'child') { try { sessionStorage.setItem('kd_role', JSON.stringify({ role: d && d.role || null, at: Date.now() })); } catch (_) {} return false; }
    state = d; banner();
    if (EXEMPT.test(location.pathname)) { hide(); return true; }
    const blocked = (d.rules && d.rules.blocked || []).includes(svc());
    if (d.lock && d.lock.locked) show({ lockNow: '保護者がロックしています', quiet: 'いまは就寝時間です', limit: '今日の利用時間に達しました' }[d.lock.reason] || 'いまは使えません', d.lock.reason === 'limit');
    else if (blocked) show('このサービスは使えない設定です', false);
    else { hide(); if (d.lock && d.lock.remainSec != null && d.lock.remainSec <= 300 && !warned) { warned = true; const t = document.createElement('div'); t.textContent = '⏰ 今日の利用時間があと' + Math.max(1, Math.ceil(d.lock.remainSec / 60)) + '分です'; t.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147482500;background:#e5484d;color:#fff;padding:8px 16px;border-radius:999px;font-weight:700'; document.body.appendChild(t); setTimeout(() => t.remove(), 6000); } }
    return true;
  }
  async function beat() {
    const now = Date.now(), sec = document.visibilityState === 'visible' ? Math.min(90, Math.round((now - last) / 1000)) : 0; last = now;
    const d = await call('heartbeat', { svc: svc(), sec: EXEMPT.test(location.pathname) ? 0 : sec });
    if (!apply(d)) clearInterval(timer);
  }
  let timer = null;
  const start = async () => { const d = await call('status'); if (!apply(d)) return; last = Date.now(); timer = setInterval(beat, 30000); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { last = Date.now(); beat(); } }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
