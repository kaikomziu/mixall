// public/js/pocket-plus.js
// Pocket の追加機能:
//   ・メッセージのピン留め（この端末だけ。本文が端末にしかないため）→ ルーム上部に固定表示
//   ・録音メッセージの文字起こし（Gemini。結果はこの端末に保存し、サーバーには残さない）
(function () {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (m, o) => window.MixAllUX && window.MixAllUX.toast(m, o);
  const roomId = new URLSearchParams(location.search).get('id') || '';
  const pinKey = `mixall.pins:${roomId}`;
  const tKey = 'mixall.transcripts';
  const getPins = () => { try { return JSON.parse(localStorage.getItem(pinKey) || '[]'); } catch (_) { return []; } };
  const setPins = (p) => { try { localStorage.setItem(pinKey, JSON.stringify(p.slice(-10))); } catch (_) { /* ignore */ } };
  const getT = () => { try { return JSON.parse(localStorage.getItem(tKey) || '{}'); } catch (_) { return {}; } };
  const setT = (t) => { try { localStorage.setItem(tKey, JSON.stringify(t)); } catch (_) { /* ignore */ } };

  function textOf(id) {
    const el = document.getElementById(`message-${id}`);
    const fromDom = el && el.querySelector('.text') ? el.querySelector('.text').textContent.trim() : '';
    return fromDom || (window.MixAllChatVault ? window.MixAllChatVault.text(id) : '') || (el && el.querySelector('.voice-message') ? '🎙 録音メッセージ' : '（添付）');
  }

  // ---------- ピン留め ----------
  function renderPins() {
    let bar = document.getElementById('mxPinBar');
    const pins = getPins().filter((p) => document.getElementById(`message-${p.id}`) || p.text);
    if (!pins.length) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'mxPinBar'; bar.className = 'mx-pin-bar';
      const list = document.getElementById('messageList');
      if (list && list.parentElement) list.parentElement.insertBefore(bar, list); else document.querySelector('main')?.prepend(bar);
    }
    bar.innerHTML = pins.map((p) => `<button type="button" class="mx-pin" data-jump="${esc(p.id)}"><span class="mx-pin-icon">📌</span><span class="mx-pin-text">${esc(p.text)}</span></button>`).join('');
    bar.querySelectorAll('[data-jump]').forEach((b) => { b.onclick = () => {
      const el = document.getElementById(`message-${b.dataset.jump}`);
      if (!el) { toast('このメッセージは画面に読み込まれていません（上にスクロールすると読み込めます）'); return; }
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.add('mx-flash'); setTimeout(() => el.classList.remove('mx-flash'), 1600);
    }; });
  }
  function togglePin(id) {
    const pins = getPins();
    const i = pins.findIndex((p) => p.id === id);
    if (i >= 0) { pins.splice(i, 1); toast('ピン留めを外しました'); }
    else { pins.push({ id, text: textOf(id).slice(0, 120), at: Date.now() }); toast('ピン留めしました（この端末で表示されます）'); }
    setPins(pins); renderPins();
  }

  // ---------- 文字起こし ----------
  function showTranscript(id, text) {
    const el = document.getElementById(`message-${id}`);
    if (!el) return;
    let box = el.querySelector('.mx-transcript');
    if (!box) { box = document.createElement('div'); box.className = 'mx-transcript'; (el.querySelector('.voice-message') || el).insertAdjacentElement('afterend', box); }
    box.innerHTML = `<span class="mx-transcript-label">📝 文字起こし</span><span>${esc(text)}</span>`;
  }
  async function transcribe(id, fileId) {
    const cached = getT()[fileId];
    if (cached) { showTranscript(id, cached); return; }
    toast('文字起こし中…（数秒〜数十秒かかります）');
    try {
      const r = await window.MixAllPlus.api('transcribe', { fileId });
      const t = getT(); t[fileId] = r.text; setT(t);
      showTranscript(id, r.text);
    } catch (e) { toast(e.message, { kind: 'error' }); }
  }
  // 画面が描き直されたら、保存済みの文字起こしを付け直す
  function restoreTranscripts() {
    const t = getT();
    document.querySelectorAll('[data-message-id] .voice-message[data-file-id]').forEach((v) => {
      const id = v.closest('[data-message-id]').dataset.messageId;
      const text = t[v.dataset.fileId];
      if (text && !v.parentElement.querySelector('.mx-transcript')) showTranscript(id, text);
    });
    document.querySelectorAll('[data-message-id]').forEach((m) => m.classList.toggle('mx-pinned', getPins().some((p) => p.id === m.dataset.messageId)));
  }

  window.MixAllPocketPlus = {
    // 長押しメニューに項目を足す（Pocket/room.html から呼ばれる）
    menuItems(post, add) {
      const id = post.dataset.messageId;
      if (!id) return;
      const pinned = getPins().some((p) => p.id === id);
      add(pinned ? '📌 ピン留めを外す' : '📌 ピン留め', () => togglePin(id));
      const voice = post.querySelector('.voice-message[data-file-id]');
      if (voice && voice.dataset.fileId) add('📝 文字起こし', () => transcribe(id, voice.dataset.fileId));
    }
  };

  function boot() {
    const list = document.getElementById('messageList');
    if (!list) { setTimeout(boot, 500); return; }
    let t = null;
    new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => { restoreTranscripts(); renderPins(); }, 150); }).observe(list, { childList: true, subtree: true });
    restoreTranscripts(); renderPins();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
