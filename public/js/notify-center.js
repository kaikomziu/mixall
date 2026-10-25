/* 通知ベル(⚙の横) + 運営からの警告(確認するまで閉じられない画面) */
(function () {
  if (window.__notifyCenter) return; window.__notifyCenter = true;
  const sess = () => { try { return JSON.parse(localStorage.getItem('netrify_session') || 'null'); } catch (_) { return null; } };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const s0 = sess(); if (!s0 || !s0.token) return;
  // 容量の自動メンテナンス(圧縮)を、使っている人のブラウザが10分に1回こっそり起動する(待たない・表示なし)
  try { const k = 'mx-compact-ping', t = Number(localStorage.getItem(k) || 0); if (Date.now() - t > 10 * 60 * 1000) { localStorage.setItem(k, String(Date.now())); setTimeout(() => { fetch('/api/auto-compact?ping=1', { keepalive: true }).catch(() => {}); }, 6000); } } catch (_) {}
  let bell, badge, shownWarn = false;
  function mount() {
    const w = document.querySelector('.settings-widget'); if (!w || bell) return;
    w.style.display = 'inline-flex'; w.style.alignItems = 'center'; w.style.gap = '6px';
    bell = document.createElement('a'); bell.href = '/Notifications/'; bell.title = '通知'; bell.setAttribute('aria-label', '通知');
    bell.style.cssText = 'position:relative;display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border:1px solid var(--border);border-radius:999px;color:var(--text-dim);text-decoration:none;font-size:1rem;background:transparent';
    bell.innerHTML = '🔔<span style="display:none;position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;border-radius:8px;background:#e5484d;color:#fff;font-size:.65rem;line-height:16px;text-align:center;padding:0 3px"></span>';
    badge = bell.querySelector('span'); w.prepend(bell);
  }
  function setBadge(n) { if (!badge) return; badge.style.display = n > 0 ? 'block' : 'none'; badge.textContent = n > 99 ? '99+' : String(n); }
  async function warn(list) {
    if (shownWarn) return; const w = list.find((n) => n.requireAck && !n.ack); if (!w) return; shownWarn = true;
    const col = w.severity === 'danger' ? '#c62828' : w.severity === 'info' ? '#1565c0' : '#e65100';
    const o = document.createElement('div'); o.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:14px';
    o.innerHTML = `<div role="alertdialog" aria-modal="true" style="background:#fff;color:#1f1f1f;max-width:520px;width:100%;max-height:90vh;overflow:auto;border-radius:14px;border-top:8px solid ${col};padding:18px;line-height:1.7"><h2 style="margin:0 0 8px;color:${col}">⚠ ${esc(w.title)}</h2><p style="white-space:pre-wrap">${esc(w.body)}</p><p style="font-size:.8rem;color:#667">MixAll運営からのお知らせ・${new Date(w.createdAt).toLocaleString('ja-JP')}</p><button type="button" style="width:100%;padding:12px;border:0;border-radius:8px;background:${col};color:#fff;font-size:1rem;cursor:pointer">内容を確認しました</button></div>`;
    document.body.appendChild(o);
    o.querySelector('button').onclick = async () => { try { await fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'ackWarning', token: sess().token, id: w.id }) }); } catch (_) {} o.remove(); shownWarn = false; poll(); };
  }
  async function poll() {
    const s = sess(); if (!s || !s.token) return;
    try {
      const r = await fetch('/api/notifications?token=' + encodeURIComponent(s.token)); if (!r.ok) return; const d = await r.json();
      const list = d.notifications || []; setBadge(list.filter((n) => !n.read).length + Number(sessionStorage.getItem('mixall-ghost-unread') || 0)); warn(list);
    } catch (_) {}
  }
  async function ghostPoll() {
    const s = sess(); if (!s || !s.token) return;
    try {
      const [a, b] = await Promise.all([fetch('/api/ghost?notifications=1&token=' + encodeURIComponent(s.token)), fetch('/api/notifications?token=' + encodeURIComponent(s.token))]);
      if (!a.ok || !b.ok) return; const g = (await a.json()).notifications || []; const ids = new Set((await b.json()).readIds || []);
      sessionStorage.setItem('mixall-ghost-unread', String(g.filter((n) => !ids.has(n.id ? 'g:' + n.id + ':' + n.createdAt : n.type + ':' + (n.postId || '') + ':' + (n.commentId || '') + ':' + n.createdAt)).length)); poll();
    } catch (_) {}
  }
  document.addEventListener('DOMContentLoaded', () => { mount(); poll(); setTimeout(ghostPoll, 4000); });
  if (document.readyState !== 'loading') { mount(); poll(); setTimeout(ghostPoll, 4000); }
  setInterval(poll, 60000); setInterval(ghostPoll, 5 * 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
})();
