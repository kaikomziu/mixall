// 完了度バー(共通部品): const bar = MxProgress.mount(要素); bar.set(0.4, '40%…'); bar.busy('準備中'); bar.done('完了'); bar.hide();
(function () {
  const css = document.createElement('style');
  css.textContent = '.mxp{margin:8px 0}.mxp[hidden]{display:none}.mxp-track{height:16px;border-radius:8px;background:rgba(127,127,127,.25);overflow:hidden}.mxp-fill{height:100%;width:0;border-radius:8px;background:linear-gradient(90deg,var(--accent,#4c9aff),var(--accent-2,#7bd6ff));transition:width .25s}.mxp-busy .mxp-fill{width:35%;animation:mxp-slide 1.1s ease-in-out infinite alternate}.mxp-text{font-size:.82rem;margin-top:3px;color:var(--text-dim,#888)}@keyframes mxp-slide{from{margin-left:0}to{margin-left:65%}}';
  document.head.appendChild(css);
  function mount(before) {
    const el = document.createElement('div'); el.className = 'mxp'; el.hidden = true;
    el.innerHTML = '<div class="mxp-track" role="progressbar" aria-valuemin="0" aria-valuemax="100"><div class="mxp-fill"></div></div><div class="mxp-text"></div>';
    before.parentNode.insertBefore(el, before);
    const fill = el.querySelector('.mxp-fill'), text = el.querySelector('.mxp-text'), track = el.querySelector('.mxp-track');
    return {
      set(f, label) { const p = Math.max(0, Math.min(1, Number(f) || 0)); el.hidden = false; el.classList.remove('mxp-busy'); fill.style.width = (p * 100).toFixed(1) + '%'; track.setAttribute('aria-valuenow', Math.round(p * 100)); text.textContent = (label ? label + ' ' : '') + Math.round(p * 100) + '%'; },
      busy(label) { el.hidden = false; el.classList.add('mxp-busy'); text.textContent = label || '処理中…'; },
      done(label) { this.set(1, ''); text.textContent = label || '完了 100%'; },
      hide() { el.hidden = true; }
    };
  }
  // 要素がまだ無い段階(<head>内のスクリプト等)でも安全に使えるよう、最初に使われた時点でバーを作る
  function lazy(getEl) {
    let real = null;
    const get = () => { if (!real) { const el = typeof getEl === 'function' ? getEl() : getEl; if (!el || !el.parentNode) return null; real = mount(el); } return real; };
    const call = (name) => (...a) => { const b = get(); return b ? b[name](...a) : undefined; };
    return { set: call('set'), busy: call('busy'), done: call('done'), hide: call('hide') };
  }
  window.MxProgress = { mount, lazy };
})();
