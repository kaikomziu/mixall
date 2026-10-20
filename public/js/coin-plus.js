// public/js/coin-plus.js
// ログインボーナスとデイリーミッションのカード（Coin ページ・トップページ）
(function () {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const session = () => { try { return JSON.parse(localStorage.getItem('netrify_session') || 'null'); } catch (_) { return null; } };
  const toast = (m, o) => window.MixAllUX && window.MixAllUX.toast(m, o);
  const plus = (a, b, m) => window.MixAllPlus.api(a, b, m);

  function host() {
    let el = document.getElementById('mxDailyCard');
    if (el) return el;
    const main = document.querySelector('main');
    if (!main) return null;
    el = document.createElement('section');
    el.className = 'card'; el.id = 'mxDailyCard';
    const after = main.querySelector('.home-hero');
    if (after) after.insertAdjacentElement('afterend', el); else main.prepend(el);
    return el;
  }

  async function render() {
    const el = host();
    if (!el) return;
    let d;
    try { d = await plus('daily', {}, 'GET'); } catch (_) { el.remove(); return; }
    const allDone = d.missions.every((m) => m.done);
    el.innerHTML = `<div class="mx-daily">
      <div class="mx-daily-head">
        <div class="mx-daily-streak">${d.claimedToday ? d.streak : d.nextStreak}<small>日連続</small></div>
        <div style="flex:1">
          <h3 style="margin:0 0 4px">ログインボーナス</h3>
          <p class="muted" style="margin:0">${d.claimedToday ? '今日のボーナスは受け取り済みです。また明日！' : `今日は <strong>${d.bonus} Coin</strong>。毎日続けるほど増えます（最大7日で +14）。`}</p>
        </div>
        ${d.claimedToday ? '' : `<button type="button" data-claim>${d.bonus} Coin 受け取る</button>`}
      </div>
      <h3 style="margin:8px 0 0">今日のミッション</h3>
      ${d.missions.map((m) => `<div class="mx-mission${m.done ? ' done' : ''}"><span class="check">✓</span><span class="label">${esc(m.label)}</span>
        ${m.claimed ? '<span class="muted">受け取り済み</span>' : (m.done ? `<button type="button" data-mission="${esc(m.id)}">+${m.reward}</button>` : `<span class="reward">+${m.reward}</span>`)}</div>`).join('')}
      <div class="mx-mission${allDone ? ' done' : ''}"><span class="check">★</span><span class="label">ぜんぶ達成ボーナス</span>
        ${d.allClaimed ? '<span class="muted">受け取り済み</span>' : (allDone ? `<button type="button" data-mission="all">+${d.allBonus}</button>` : `<span class="reward">+${d.allBonus}</span>`)}</div>
      <p class="muted" style="margin:0">ミッションは毎日0時（日本時間）にリセットされます。通算ログイン ${d.totalDays} 日。</p>
    </div>`;
    const claim = el.querySelector('[data-claim]');
    if (claim) claim.onclick = async () => { try { const r = await plus('claimDaily', {}); toast(`${r.claimed} Coin を受け取りました（連続${r.streak}日）`); updateBalance(r.balance); } catch (e) { toast(e.message, { kind: 'error' }); } render(); };
    el.querySelectorAll('[data-mission]').forEach((b) => { b.onclick = async () => { try { const r = await plus('claimMission', { id: b.dataset.mission }); toast(`${r.claimed} Coin を受け取りました`); updateBalance(r.balance); } catch (e) { toast(e.message, { kind: 'error' }); } render(); }; });
  }
  // Coin ページの残高表示があれば更新
  function updateBalance(balance) {
    const el = document.getElementById('balance') || document.getElementById('coinBalance') || document.querySelector('[data-coin-balance]');
    if (el && Number.isFinite(balance)) el.textContent = `${balance.toLocaleString()} Coin`;
  }

  function boot() { if (session() && window.MixAllPlus) render(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 300), { once: true });
  else setTimeout(boot, 300);
})();
