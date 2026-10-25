// MixAll フローティングウィンドウ
// ページ内に重ねて表示できる小窓(iframe)。タイトルバーのドラッグで移動、右下のつまみで大きさ変更。
// マウスでもタッチでも動作し、ページを移動しても(同じタブの間は)開いていた窓を復元する。
(function () {
  if (window.self !== window.top || window.MixAllFloat) return;
  const KEY = 'mixall-float-windows';
  const MAX_WINDOWS = 6;
  const wins = new Map();
  let seq = 0;
  let zTop = 140;

  const read = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch (_) { return []; } };
  const persist = () => { try { sessionStorage.setItem(KEY, JSON.stringify([...wins.values()].map((w) => w.state))); } catch (_) {} };

  function clamp(st) {
    const vw = window.innerWidth, vh = window.innerHeight;
    st.w = Math.max(200, Math.min(st.w, vw - 8));
    st.h = Math.max(140, Math.min(st.h, vh - 8));
    st.x = Math.max(80 - st.w, Math.min(st.x, vw - 80));
    st.y = Math.max(0, Math.min(st.y, vh - 40));
  }

  function apply(win) {
    const { el, state: st } = win;
    if (st.full) { el.style.cssText = `left:0;top:0;width:100vw;height:${window.innerHeight}px;border-radius:0;z-index:${el.style.zIndex || zTop}`; }
    else { clamp(st); el.style.cssText = `left:${st.x}px;top:${st.y}px;width:${st.w}px;${st.min ? '' : `height:${st.h}px;`}z-index:${el.style.zIndex || zTop}`; }
    el.classList.toggle('min', !!st.min);
  }

  function front(win) { win.el.style.zIndex = String(++zTop); }

  function create(st) {
    const el = document.createElement('div');
    el.className = 'mx-float';
    el.setAttribute('role', 'dialog');
    el.innerHTML = '<div class="mx-float-bar"><span class="mx-float-title"></span><button type="button" data-act="min" aria-label="最小化">—</button><button type="button" data-act="full" aria-label="全画面">▢</button><button type="button" data-act="close" aria-label="閉じる">✕</button></div><iframe loading="lazy" allow="clipboard-read; clipboard-write; fullscreen"></iframe><div class="mx-float-resize" aria-hidden="true"></div>';
    el.querySelector('.mx-float-title').textContent = st.title;
    const frame = el.querySelector('iframe');
    let sameOrigin = false;
    try { sameOrigin = new URL(st.url, location.href).origin === location.origin; } catch (_) {}
    if (!sameOrigin) frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups allow-downloads'); // 外部サイトは権限を絞って表示
    frame.src = st.url;
    const win = { id: st.id, el, state: st };
    wins.set(st.id, win);
    document.body.appendChild(el);
    front(win);
    apply(win);

    el.addEventListener('pointerdown', () => front(win), true);
    const bar = el.querySelector('.mx-float-bar');
    const grip = el.querySelector('.mx-float-resize');
    function track(handle, onMove) {
      handle.addEventListener('pointerdown', (event) => {
        if (event.target.closest('button') || st.full) return;
        event.preventDefault();
        const sx = event.clientX, sy = event.clientY, ox = st.x, oy = st.y, ow = st.w, oh = st.h;
        handle.setPointerCapture(event.pointerId);
        el.classList.add('dragging');
        const move = (ev) => { onMove(ev.clientX - sx, ev.clientY - sy, { ox, oy, ow, oh }); apply(win); };
        const up = () => {
          handle.removeEventListener('pointermove', move);
          handle.removeEventListener('pointerup', up);
          handle.removeEventListener('pointercancel', up);
          el.classList.remove('dragging');
          persist();
        };
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', up);
        handle.addEventListener('pointercancel', up);
      });
    }
    track(bar, (dx, dy, o) => { st.x = o.ox + dx; st.y = o.oy + dy; });
    track(grip, (dx, dy, o) => { st.w = o.ow + dx; st.h = o.oh + dy; });
    bar.addEventListener('dblclick', (event) => { if (!event.target.closest('button')) { st.min = !st.min; apply(win); persist(); } });
    el.addEventListener('click', (event) => {
      const act = event.target.closest('button')?.dataset.act;
      if (!act) return;
      if (act === 'close') { el.remove(); wins.delete(st.id); }
      if (act === 'min') { st.min = !st.min; st.full = false; apply(win); }
      if (act === 'full') { st.full = !st.full; st.min = false; apply(win); }
      persist();
    });
    return win;
  }

  function open(url, title) {
    let u;
    try { u = new URL(String(url || ''), location.origin); } catch (_) { return null; }
    if (!/^https?:$/.test(u.protocol)) return null;
    while (wins.size >= MAX_WINDOWS) { const first = wins.keys().next().value; wins.get(first).el.remove(); wins.delete(first); }
    const vw = window.innerWidth, vh = window.innerHeight;
    const n = seq++ % 6;
    const w = Math.min(440, vw - 24), h = Math.min(520, Math.round(vh * 0.6));
    const label = title || (u.origin === location.origin ? u.pathname.replace(/\/$/, '') || '/' : u.hostname);
    const win = create({ id: 'w' + Date.now().toString(36) + seq, url: u.origin === location.origin ? u.pathname + u.search + u.hash : u.href, title: label, x: 12 + n * 26, y: 64 + n * 26, w, h, min: false, full: false });
    persist();
    return win.id;
  }

  function closeAll() { wins.forEach((win) => win.el.remove()); wins.clear(); persist(); }

  window.addEventListener('resize', () => wins.forEach((win) => apply(win)));
  window.MixAllFloat = { open, closeAll, count: () => wins.size };
  const restore = () => read().slice(0, MAX_WINDOWS).forEach((st) => { if (st && st.id && st.url) create(st); });
  if (document.body) restore(); else document.addEventListener('DOMContentLoaded', restore, { once: true });
})();
