// js/plus-coin.js（MixAll +（二世代）・Coin ページ）
// 以前の GitHub 版（js/coin-plus.js・js/coin-shop.js）から移したもの:
//   ログインボーナスとデイリーミッションのカード / Coinショップ（Ghost の装飾と交換）
(function () {
  'use strict';
  if (!window.MixAllPlus) return;
  const { esc, session, toast } = window.MixAllPlus;
  const plus = (a, b, m) => window.MixAllPlus.api(a, b, m);
  const TYPE_LABEL = { frame: 'アイコンの枠', nameColor: '名前の色', title: '称号', storyBg: 'ストーリーの背景' };

  function setBalance(n) {
    const el = document.getElementById('balance');
    if (el && Number.isFinite(n) && !/無限/.test(el.textContent)) el.textContent = `${n.toLocaleString('ja-JP')} Mcコイン`;
  }
  function card(id, after) {
    let el = document.getElementById(id);
    if (el) return el;
    const main = document.querySelector('main');
    if (!main) return null;
    el = document.createElement('section');
    el.className = 'card'; el.id = id;
    const anchor = after && main.querySelector(after);
    if (anchor) anchor.insertAdjacentElement('afterend', el); else main.appendChild(el);
    return el;
  }

  // ---------- ログインボーナス・デイリーミッション ----------
  async function renderDaily() {
    const el = card('mxDailyCard', ':scope > .card');
    if (!el) return;
    let d;
    try { d = await plus('daily', {}, 'GET'); } catch (_) { el.remove(); return; }
    const allClaimable = d.missions.every((m) => m.claimed);
    el.innerHTML = `<div class="mx-daily">
      <div class="mx-daily-head">
        <div class="mx-daily-streak">${d.claimedToday ? d.streak : d.nextStreak}<small>日連続</small></div>
        <div style="flex:1">
          <h3 style="margin:0 0 4px">ログインボーナス</h3>
          <p class="muted" style="margin:0">${d.claimedToday ? '今日のボーナスは受け取り済みです。また明日！' : `今日は <strong>${d.bonus} Mcコイン</strong>。毎日続けるほど増えます（最大7日で +14）。`}</p>
        </div>
        ${d.claimedToday ? '' : `<button type="button" data-claim>${d.bonus} 受け取る</button>`}
      </div>
      <h3 style="margin:8px 0 0">今日のミッション</h3>
      ${d.missions.map((m) => `<div class="mx-mission${m.done ? ' done' : ''}"><span class="check">✓</span><span class="label">${esc(m.label)}</span>
        ${m.claimed ? '<span class="muted">受け取り済み</span>' : (m.done ? `<button type="button" data-mission="${esc(m.id)}">+${m.reward}</button>` : `<span class="reward">+${m.reward}</span>`)}</div>`).join('')}
      <div class="mx-mission${allClaimable ? ' done' : ''}"><span class="check">★</span><span class="label">ぜんぶ達成ボーナス</span>
        ${d.allClaimed ? '<span class="muted">受け取り済み</span>' : (allClaimable ? `<button type="button" data-mission="all">+${d.allBonus}</button>` : `<span class="reward">+${d.allBonus}</span>`)}</div>
      <p class="muted" style="margin:0">ミッションは毎日0時（日本時間）にリセットされます。通算ログイン ${d.totalDays} 日。</p>
    </div>`;
    const claim = el.querySelector('[data-claim]');
    if (claim) claim.onclick = async () => { try { const r = await plus('claimDaily', {}); toast(`${r.claimed} Mcコインを受け取りました（連続${r.streak}日）`); setBalance(r.balance); } catch (e) { toast(e.message, { kind: 'error' }); } renderDaily(); renderShop(); };
    el.querySelectorAll('[data-mission]').forEach((b) => { b.onclick = async () => { try { const r = await plus('claimMission', { id: b.dataset.mission }); toast(`${r.claimed} Mcコインを受け取りました`); setBalance(r.balance); } catch (e) { toast(e.message, { kind: 'error' }); } renderDaily(); renderShop(); }; });
  }

  // ---------- Coinショップ ----------
  function preview(it) {
    if (it.type === 'title') return `<span class="mx-shop-title">${esc(it.label)}</span>`;
    if (it.type === 'nameColor') return `<span class="mx-shop-name" style="background-image:${esc(it.preview)}">なまえ</span>`;
    if (it.type === 'frame') return `<span class="mx-shop-frame" style="background:${esc(it.preview)}"><i></i></span>`;
    return `<span class="mx-shop-bg" style="background:${esc(it.preview)}"></span>`;
  }
  async function renderShop() {
    const el = card('mxShopCard');
    if (!el) return;
    let d;
    try { d = await plus('shop', {}, 'GET'); } catch (e) { el.innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
    const groups = {};
    d.items.forEach((it) => { (groups[it.type] = groups[it.type] || []).push(it); });
    el.innerHTML = `<div class="row" style="justify-content:space-between;align-items:center"><h2 style="margin:0">🛍️ Coinショップ</h2><strong class="mx-shop-balance">${d.balance.toLocaleString('ja-JP')} Mcコイン</strong></div>
      <p class="muted">Ghost のプロフィールや投稿に表示される装飾と交換できます。買ったものはいつでも付け替えられます。</p>
      ${Object.entries(groups).map(([type, items]) => `<h3>${TYPE_LABEL[type] || type}</h3><div class="mx-shop-grid">${items.map((it) => {
        const owned = d.owned.includes(it.id); const on = d.equipped[type] === it.id;
        const btn = owned
          ? (on ? `<button type="button" class="secondary" data-unequip="${type}">外す</button>` : `<button type="button" class="secondary" data-equip="${esc(it.id)}" data-type="${type}">付ける</button>`)
          : `<button type="button" data-buy="${esc(it.id)}" ${d.balance < it.price ? 'disabled' : ''}>${it.price} Mcコイン</button>`;
        return `<div class="mx-shop-item${on ? ' on' : ''}">${preview(it)}<span class="mx-shop-label">${esc(it.name.replace(/^.*?: /, ''))}</span>${btn}</div>`;
      }).join('')}</div>`).join('')}`;
    el.querySelectorAll('[data-buy]').forEach((b) => { b.onclick = async () => {
      const it = d.items.find((x) => x.id === b.dataset.buy);
      if (!(await window.MixAllDialog.confirm(`${it.name}\n${it.price} Mcコインで交換しますか？`, { okLabel: '交換する', icon: '🛍️', danger: false }))) return;
      try { const r = await plus('buy', { id: it.id }); toast(`${it.name} を手に入れました！`); setBalance(r.balance); } catch (e) { toast(e.message, { kind: 'error' }); }
      renderShop();
    }; });
    el.querySelectorAll('[data-equip]').forEach((b) => { b.onclick = async () => { try { await plus('equip', { type: b.dataset.type, id: b.dataset.equip }); toast('付け替えました'); } catch (e) { toast(e.message, { kind: 'error' }); } renderShop(); }; });
    el.querySelectorAll('[data-unequip]').forEach((b) => { b.onclick = async () => { try { await plus('equip', { type: b.dataset.unequip, id: null }); toast('外しました'); } catch (e) { toast(e.message, { kind: 'error' }); } renderShop(); }; });
  }

  function boot() {
    if (!session() || !/^\/coin\/?(index\.html)?$/i.test(location.pathname)) return;
    renderDaily();
    renderShop();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 300), { once: true });
  else setTimeout(boot, 300);
})();
