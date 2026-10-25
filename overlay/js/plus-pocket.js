// js/plus-pocket.js（MixAll +（二世代）・ぽけっとのルーム/スレッド）
// 以前の GitHub 版（js/pocket-plus.js）から移したもの:
//   録音メッセージ・音声の文字起こし（Gemini。結果はこの端末に保存し、サーバーには残さない）
(function () {
  'use strict';
  if (!window.MixAllPlus) return;
  const { esc, session, toast } = window.MixAllPlus;
  const KEY = 'mixall.transcripts';
  const getT = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (_) { return {}; } };
  const setT = (t) => { try { const e = Object.entries(t).slice(-300); localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(e))); } catch (_) { /* ignore */ } };

  function show(slot, text) {
    let box = slot.nextElementSibling && slot.nextElementSibling.classList.contains('mx-transcript') ? slot.nextElementSibling : null;
    if (!box) { box = document.createElement('div'); box.className = 'mx-transcript'; slot.insertAdjacentElement('afterend', box); }
    box.innerHTML = `<span class="mx-transcript-label">📝 文字起こし</span><span>${esc(text)}</span>`;
  }
  async function transcribe(slot, btn) {
    const fileId = slot.dataset.fileId;
    btn.disabled = true; btn.textContent = '文字起こし中…';
    try {
      const r = await window.MixAllPlus.api('transcribe', { fileId });
      const t = getT(); t[fileId] = r.text; setT(t);
      show(slot, r.text);
      btn.remove();
    } catch (e) { toast(e.message, { kind: 'error' }); btn.disabled = false; btn.textContent = '📝 文字起こし'; }
  }
  function decorate() {
    const saved = getT();
    document.querySelectorAll('.voice-message[data-file-id], .attachment-slot[data-kind="audio"][data-file-id]').forEach((slot) => {
      const fileId = slot.dataset.fileId;
      if (!fileId || slot.dataset.mxT) return;
      slot.dataset.mxT = '1';
      if (saved[fileId]) { show(slot, saved[fileId]); return; }
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'ghost mx-transcribe-btn'; btn.textContent = '📝 文字起こし';
      btn.onclick = (e) => { e.stopPropagation(); transcribe(slot, btn); };
      slot.insertAdjacentElement('afterend', btn);
    });
  }

  function boot() {
    if (!session() || !/^\/pocket\/(room|thread)\.html$/i.test(location.pathname)) return;
    const list = document.getElementById('messageList') || document.querySelector('main');
    if (!list) return;
    let t = null;
    new MutationObserver(() => { clearTimeout(t); t = setTimeout(decorate, 150); }).observe(list, { childList: true, subtree: true });
    decorate();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 300), { once: true });
  else setTimeout(boot, 300);
})();
