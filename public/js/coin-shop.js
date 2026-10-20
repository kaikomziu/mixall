// public/js/coin-shop.js
// Coinショップ（Coin ページ）: ログインボーナスなどで貯めた Coin で、Ghost の装飾と交換する。
(function () {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const session = () => { try { return JSON.parse(localStorage.getItem('netrify_session') || 'null'); } catch (_) { return null; } };
  const toast = (m, o) => window.MixAllUX && window.MixAllUX.toast(m, o);
  const plus = (a, b, m) => window.MixAllPlus.api(a, b, m);
  const TYPE_LABEL = { frame: 'アイコンの枠', nameColor: '名前の色', title: '称号', storyBg: 'ストーリーの背景' };

  function setBalance(n) {
    const el = document.getElementById('balance');
    if (el && Number.isFinite(n)) el.textContent = `${n.toLocaleString()} Coin`;
  }
  function preview(it) {
    if (it.type === 'title') return `<span class="mx-shop-title">${esc(it.label)}</span>`;
    if (it.type === 'nameColor') return `<span class="mx-shop-name" style="background-image:${esc(it.preview)}">なまえ</span>`;
    if (it.type === 'frame') return `<span class="mx-shop-frame" style="background:${esc(it.preview)}"><i></i></span>`;
    return `<span class="mx-shop-bg" style="background:${esc(it.preview)}"></span>`;
  }

  async function render() {
    let el = document.getElementById('mxShopCard');
    if (!el) { el = document.createElement('section'); el.className = 'card'; el.id = 'mxShopCard'; document.querySelector('main').appendChild(el); }
    let d;
    try { d = await plus('shop', {}, 'GET'); } catch (e) { el.innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
    setBalance(d.balance);
    const groups = {};
    d.items.forEach((it) => { (groups[it.type] = groups[it.type] || []).push(it); });
    el.innerHTML = `<div class="row" style="justify-content:space-between;align-items:center"><h2 style="margin:0">🛍️ Coinショップ</h2><strong class="mx-shop-balance">${d.balance.toLocaleString()} Coin</strong></div>
      <p class="muted">Ghost のプロフィールや投稿に表示される装飾と交換できます。買ったものはいつでも付け替えられます。</p>
      ${Object.entries(groups).map(([type, items]) => `<h3>${TYPE_LABEL[type] || type}</h3><div class="mx-shop-grid">${items.map((it) => {
        const owned = d.owned.includes(it.id); const on = d.equipped[type] === it.id;
        const btn = owned
          ? (on ? `<button type="button" class="secondary" data-unequip="${type}">外す</button>` : `<button type="button" class="secondary" data-equip="${esc(it.id)}" data-type="${type}">付ける</button>`)
          : `<button type="button" data-buy="${esc(it.id)}" ${d.balance < it.price ? 'disabled' : ''}>${it.price} Coin</button>`;
        return `<div class="mx-shop-item${on ? ' on' : ''}">${preview(it)}<span class="mx-shop-label">${esc(it.name.replace(/^.*?: /, ''))}</span>${btn}</div>`;
      }).join('')}</div>`).join('')}`;
    el.querySelectorAll('[data-buy]').forEach((b) => { b.onclick = async () => {
      const it = d.items.find((x) => x.id === b.dataset.buy);
      if (!(await window.MixAllDialog.confirm(`${it.name}\n${it.price} Coin で交換しますか？`, { okLabel: '交換する', icon: '🛍️', danger: false }))) return;
      try { const r = await plus('buy', { id: it.id }); toast(`${it.name} を手に入れました！`); setBalance(r.balance); } catch (e) { toast(e.message, { kind: 'error' }); }
      render();
    }; });
    el.querySelectorAll('[data-equip]').forEach((b) => { b.onclick = async () => { try { await plus('equip', { type: b.dataset.type, id: b.dataset.equip }); toast('付け替えました'); } catch (e) { toast(e.message, { kind: 'error' }); } render(); }; });
    el.querySelectorAll('[data-unequip]').forEach((b) => { b.onclick = async () => { try { await plus('equip', { type: b.dataset.unequip, id: null }); toast('外しました'); } catch (e) { toast(e.message, { kind: 'error' }); } render(); }; });
  }

  function boot() { if (session() && window.MixAllPlus && document.querySelector('main')) render(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 400), { once: true });
  else setTimeout(boot, 400);
})();
