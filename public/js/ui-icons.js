// 絵文字をUIアイコン画像(/icons/ui/*.svg)に置き換える。文字色に追従(mask)・ダーク対応。リアクション等の顔/動物絵文字はそのまま。
// 除外: data-emoji / .no-ico / 入力欄・textarea・contenteditable・script/style
(function () {
  if (window.__mxIcons) return; window.__mxIcons = true;
  const MAP = {"🔍": "search", "📎": "clip", "♫": "music", "♪": "music", "🎵": "music", "🎶": "music", "♥": "heart", "❤": "heart", "♡": "heart", "💞": "heart", "✓": "check", "✅": "check", "✔": "check", "✕": "x", "✗": "x", "❌": "x", "⚙": "gear", "🌐": "globe", "📝": "note", "✎": "note", "✏": "note", "🔖": "bookmark", "👤": "user", "🏫": "school", "🤖": "bot", "🔗": "link", "🔔": "bell", "💬": "chat", "⚠": "warn", "📍": "pin", "🧩": "puzzle", "🔒": "lock", "📨": "mail", "💌": "mail", "📅": "calendar", "📸": "camera", "📷": "camera", "🏷": "tag", "👥": "users", "🛡": "shield", "🎙": "mic", "✦": "sparkle", "✳": "sparkle", "🌟": "sparkle", "📣": "megaphone", "🗑": "trash", "🔇": "mute", "🖼": "image", "🖥": "monitor", "🚩": "flag", "📦": "box", "📁": "folder", "⚡": "bolt", "🔞": "adult", "🕒": "clock", "⏰": "clock", "🔥": "fire", "📄": "file", "📕": "file", "🎨": "palette", "🚀": "rocket", "🎧": "headphones", "🔑": "key", "🔊": "volume", "🎬": "film", "🚫": "ban", "👁": "eye", "⏸": "pause", "❚": "pause", "🛠": "tool", "☰": "menu", "📞": "phone"};
  const keys = Object.keys(MAP).sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const RE = new RegExp('(' + keys.join('|') + ')[\\uFE0F\\uFE0E]?', 'g');
  const st = document.createElement('style');
  st.textContent = '.mxi{display:inline-block;width:1.1em;height:1.1em;vertical-align:-.18em;background:currentColor;-webkit-mask:var(--i) center/contain no-repeat;mask:var(--i) center/contain no-repeat}';
  document.head.appendChild(st);
  const SKIP = /^(SCRIPT|STYLE|TEXTAREA|INPUT|OPTION|SELECT|CODE|PRE|NOSCRIPT|TITLE)$/;
  function skip(el) { for (let n = el; n && n.nodeType === 1; n = n.parentNode) { if (SKIP.test(n.tagName) || n.isContentEditable || n.hasAttribute('data-emoji') || n.classList.contains('no-ico') || n.classList.contains('mxi')) return true; } return false; }
  function convert(node) {
    const t = node.nodeValue; if (!t || !RE.test(t)) { RE.lastIndex = 0; return; } RE.lastIndex = 0;
    if (!node.parentNode || skip(node.parentNode)) return;
    const frag = document.createDocumentFragment(); let last = 0, m;
    while ((m = RE.exec(t))) { if (m.index > last) frag.appendChild(document.createTextNode(t.slice(last, m.index))); const i = document.createElement('i'); i.className = 'mxi'; i.style.setProperty('--i', 'url(/icons/ui/' + MAP[m[1]] + '.svg)'); i.setAttribute('role', 'img'); i.setAttribute('aria-label', m[1]); frag.appendChild(i); last = m.index + m[0].length; }
    if (last < t.length) frag.appendChild(document.createTextNode(t.slice(last)));
    node.parentNode.replaceChild(frag, node);
  }
  function scan(root) { if (!root) return; if (root.nodeType === 3) { convert(root); return; } if (root.nodeType !== 1 || skip(root)) return; const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const list = []; while (w.nextNode()) list.push(w.currentNode); list.forEach(convert); }
  function start() { scan(document.body); new MutationObserver((ms) => { for (const m of ms) { if (m.type === 'characterData') convert(m.target); else m.addedNodes.forEach(scan); } }).observe(document.body, { childList: true, subtree: true, characterData: true }); }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
