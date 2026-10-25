// js/plus-pocket.js（MixAll +（二世代）・ぽけっとのルーム/スレッド）
// 以前の GitHub 版（js/pocket-plus.js）から移したもの:
//   録音メッセージ・音声の文字起こし（Gemini。結果はこの端末に保存し、サーバーには残さない）
// MixAll + で足したもの:
//   ミニゲーム（入力欄の🎲、または /dice /omikuji /janken グー /coin /choose A B C）。結果はサーバーが決めて署名し、
//   メッセージに「✓ MixAll判定」の印を付ける（手で書いた結果には付かない）
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

  // =================================================================
  // ミニゲーム
  // =================================================================
  const GAMES = {
    dice: 'dice', サイコロ: 'dice', さいころ: 'dice', omikuji: 'omikuji', おみくじ: 'omikuji', janken: 'janken', じゃんけん: 'janken',
    coin: 'coin', コイン: 'coin', choose: 'choose', えらぶ: 'choose', game: 'help', games: 'help', ゲーム: 'help'
  };
  const CMD_RE = /^[/／](\S+)(?:\s+([\s\S]*))?$/;
  const PAIRS = { msgSubmit: 'msgBody', threadSubmit: 'threadBody' };
  let passing = false;
  let busy = false;
  function parseCommand(text) {
    const m = CMD_RE.exec(text.trim());
    const kind = m && GAMES[m[1].toLowerCase()];
    return kind ? { kind, arg: (m[2] || '').trim() } : null;
  }
  async function play(btn, body, kind, arg) {
    if (kind === 'help') { body.value = ''; openMenu(btn, body); return; }
    if (kind === 'janken' && !arg) { openMenu(btn, body); return; }
    if (busy) return;
    busy = true;
    try {
      const r = await window.MixAllPlus.api('game', { kind, arg });
      body.value = r.text;
      passing = true;
      btn.click();
    } catch (e) { toast(e.message, { kind: 'error' }); } finally { passing = false; busy = false; }
  }
  // 送信ボタンを押したとき、入力が「/dice」などならサーバーで結果を作ってから送る
  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('#msgSubmit, #threadSubmit');
    if (!btn || passing) return;
    const body = document.getElementById(PAIRS[btn.id]);
    const cmd = body && parseCommand(body.value);
    if (!cmd) return;
    e.preventDefault(); e.stopImmediatePropagation();
    play(btn, body, cmd.kind, cmd.arg);
  }, true);

  let menu = null;
  function closeMenu() { if (menu) { menu.remove(); menu = null; } }
  function openMenu(btn, body) {
    if (menu) { closeMenu(); return; }
    menu = document.createElement('div');
    menu.className = 'mx-game-menu'; menu.setAttribute('role', 'menu');
    menu.innerHTML = `<div class="mx-game-head">ミニゲーム<small>結果はみんなに送られます</small></div>
      <button type="button" data-g="dice">🎲 サイコロ</button><button type="button" data-g="dice" data-a="2d6">🎲🎲 2個</button>
      <button type="button" data-g="omikuji">🔮 おみくじ</button><button type="button" data-g="coin">🪙 コイントス</button>
      <div class="mx-game-row"><span>じゃんけん</span><button type="button" data-g="janken" data-a="グー">✊</button><button type="button" data-g="janken" data-a="チョキ">✌️</button><button type="button" data-g="janken" data-a="パー">🖐️</button></div>
      <button type="button" data-g="choose">🎯 えらぶ…</button>
      <p class="mx-game-tip">入力欄に <code>/dice 3d10</code>・<code>/choose 寿司 焼肉</code> と書いて送っても遊べます</p>`;
    menu.querySelectorAll('[data-g]').forEach((b) => {
      b.onclick = async () => {
        const kind = b.dataset.g;
        let arg = b.dataset.a || '';
        closeMenu();
        if (body.value.trim() && !parseCommand(body.value)) { toast('入力中のメッセージを送るか消してから遊んでください'); return; }
        if (kind === 'choose') {
          arg = await window.MixAllDialog.prompt('候補を空白か「、」で区切って入れてください（例: 寿司、焼肉、ラーメン）', '');
          if (!arg || !arg.trim()) return;
        }
        play(btn, body, kind, arg);
      };
    });
    const r = btn.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - 268))}px`;
    // ふだんは送信ボタンの上に開く。上に場所が無いときは下に開く
    if (r.top > 300) menu.style.bottom = `${Math.max(8, window.innerHeight - r.top + 8)}px`;
    else menu.style.top = `${r.bottom + 8}px`;
    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener('pointerdown', function off(ev) {
      if (menu && !menu.contains(ev.target)) closeMenu();
      if (!menu) document.removeEventListener('pointerdown', off, true);
    }, true), 0);
  }
  function addGameButton() {
    const submit = document.getElementById('msgSubmit');
    const body = document.getElementById('msgBody');
    if (!submit || !body || document.getElementById('mxGameBtn')) return;
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'mxGameBtn'; b.className = 'ghost mx-game-btn'; b.title = 'ミニゲーム'; b.setAttribute('aria-label', 'ミニゲーム');
    b.textContent = '🎲';
    b.onclick = () => openMenu(submit, body);
    submit.insertAdjacentElement('beforebegin', b);
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

  // 送られたゲームの結果に「✓ MixAll判定」を付ける（同じ本文は1回だけ確かめる）
  const CODE_RE = /（#[0-9a-f]{12}）\s*$/;
  const verified = new Map();
  let verifying = false;
  function badge(el, ok) {
    el.classList.add('mx-game');
    el.innerHTML = el.innerHTML.replace(/\s*（#[0-9a-f]{12}）\s*$/, ok
      ? ' <span class="mx-game-badge" title="MixAll のサーバーが決めた結果です">✓ MixAll判定</span>'
      : ' <span class="mx-game-badge ng" title="サーバーの署名と合いません（手で書かれた結果かもしれません）">⚠ 未確認</span>');
  }
  async function markGames() {
    const els = [...document.querySelectorAll('.post[data-message-id] .text')].filter((el) => !el.classList.contains('mx-game') && CODE_RE.test(el.textContent));
    const ask = [...new Set(els.map((el) => el.textContent.trim()).filter((t) => !verified.has(t)))].slice(0, 60);
    if (ask.length && !verifying) {
      verifying = true;
      try { const r = await window.MixAllPlus.api('verifyGames', { texts: ask }); ask.forEach((t, i) => verified.set(t, Boolean(r.ok[i]))); } catch (_) { /* 次の描画でもう一度 */ }
      verifying = false;
    }
    els.forEach((el) => { const t = el.textContent.trim(); if (verified.has(t) && el.isConnected) badge(el, verified.get(t)); });
  }

  function boot() {
    if (!session() || !/^\/pocket\/(room|thread)\.html$/i.test(location.pathname)) return;
    const list = document.getElementById('messageList') || document.querySelector('main');
    if (!list) return;
    let t = null;
    const run = () => { decorate(); markGames(); };
    new MutationObserver(() => { clearTimeout(t); t = setTimeout(run, 150); }).observe(list, { childList: true, subtree: true });
    run();
    addGameButton();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 300), { once: true });
  else setTimeout(boot, 300);
})();
