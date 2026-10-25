// MixAll 表示言語: 登録時に選んだ言語でサイトを表示(あとから変更可)。メッセージ翻訳にも使う共通スクリプト。
(function () {
  'use strict';
  var LANGS = [['ja','日本語'],['en','English'],['zh-CN','简体中文'],['zh-TW','繁體中文'],['ko','한국어'],['es','Español'],['fr','Français'],['de','Deutsch'],['pt','Português'],['ru','Русский'],['id','Bahasa Indonesia'],['vi','Tiếng Việt'],['th','ไทย'],['it','Italiano'],['ar','العربية'],['hi','हिन्दी'],['tr','Türkçe']];
  var KEY = 'mixall-lang', SYNC = 'mixall-lang-synced';
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (_) {} return null; }
  function session() { try { return JSON.parse(localStorage.getItem('netrify_session') || 'null'); } catch (_) { return null; } }
  var lang = ls(KEY) || 'ja';
  if (!LANGS.some(function (l) { return l[0] === lang; })) lang = 'ja';
  document.documentElement.lang = lang;
  if (lang === 'ar') document.documentElement.dir = 'rtl';
  var cacheKey = 'mixall-i18n-' + lang, cache = {};
  try { cache = JSON.parse(localStorage.getItem(cacheKey) || '{}') || {}; } catch (_) {}
  function saveCache() { try { var k = Object.keys(cache); if (k.length > 6000) k.slice(0, 2000).forEach(function (x) { delete cache[x]; }); localStorage.setItem(cacheKey, JSON.stringify(cache)); } catch (_) {} }

  function api(body) {
    var s = session(); if (s && s.token) body.token = s.token;
    return fetch('/api/tools', { quiet: true, method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || '翻訳に失敗しました'); return d; }); });
  }
  // 配列を翻訳(キャッシュ+分割送信)
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  // 1回分の翻訳。間隔制限(429)は待って再試行、結果が合わないときは半分に分けて再試行、それでもだめなら原文のまま(全体を失敗させない)
  function callTranslate(target, arr, ui, attempt) {
    attempt = attempt || 0;
    return api({ action: 'translate', target: target, texts: arr, ui: ui ? 1 : 0 }).catch(function (e) {
      var msg = String((e && e.message) || '');
      if (/間隔|429|too many/i.test(msg) && attempt < 6) return sleep(900 + attempt * 500).then(function () { return callTranslate(target, arr, ui, attempt + 1); });
      if (arr.length > 1) {
        var h = Math.ceil(arr.length / 2);
        return callTranslate(target, arr.slice(0, h), ui, 0).then(function (x) { return callTranslate(target, arr.slice(h), ui, 0).then(function (y) { return { translations: x.translations.concat(y.translations) }; }); });
      }
      return { translations: [arr[0]] };
    });
  }
  // 一括翻訳(キャッシュ+分割)。opts.onChunk(index配列, 訳配列) で、できた分から順に画面へ反映できる
  function translateMany(texts, target, opts) {
    opts = opts || {}; target = target || lang;
    var out = new Array(texts.length), todo = [], hit = [];
    texts.forEach(function (t, i) { if (target === lang && cache[t] != null) { out[i] = cache[t]; hit.push(i); } else todo.push(i); });
    if (opts.onChunk && hit.length) opts.onChunk(hit, hit.map(function (i) { return out[i]; }));
    var chunks = [], cur = [], size = 0;
    todo.forEach(function (i) { var l = texts[i].length; if (cur.length >= 35 || size + l > 4000) { chunks.push(cur); cur = []; size = 0; } cur.push(i); size += l; });
    if (cur.length) chunks.push(cur);
    return chunks.reduce(function (p, idxs, ci) {
      return p.then(function () { return ci ? sleep(750) : null; }).then(function () {
        return callTranslate(target, idxs.map(function (i) { return texts[i]; }), opts.ui).then(function (d) {
          idxs.forEach(function (i, n) { out[i] = d.translations[n]; if (target === lang && d.translations[n] != null && d.translations[n] !== texts[i]) cache[texts[i]] = d.translations[n]; });
          if (target === lang) saveCache();
          if (opts.onChunk) opts.onChunk(idxs, idxs.map(function (i) { return out[i]; }));
        });
      });
    }, Promise.resolve()).then(function () { return out.map(function (x, i) { return x == null ? texts[i] : x; }); });
  }

  // ---- ページ全体の翻訳(日本語以外) ----
  var SKIP = 'script,style,noscript,textarea,code,pre,svg,[data-no-translate],.text,.msg-text,.ghost-text-content,.mixall-tr,[contenteditable="true"]';
  var orig = new WeakMap(), busy = false, pending = false;
  function collect(root) {
    var nodes = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: function (n) {
      var t = n.nodeValue; if (!t || !t.trim() || !/[぀-ヿ一-鿿]/.test(t)) return NodeFilter.FILTER_REJECT;
      var p = n.parentElement; if (!p || p.closest(SKIP)) return NodeFilter.FILTER_REJECT;
      return orig.has(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; } });
    var n; while ((n = w.nextNode())) nodes.push(n);
    var attrs = [];
    root.querySelectorAll && root.querySelectorAll('[placeholder],[title],[aria-label]').forEach(function (el) {
      if (el.closest(SKIP)) return;
      ['placeholder', 'title', 'aria-label'].forEach(function (a) { var v = el.getAttribute(a); if (v && /[぀-ヿ一-鿿]/.test(v) && !(el.__tr && el.__tr[a])) attrs.push([el, a, v]); });
    });
    return { nodes: nodes, attrs: attrs };
  }
  function badge(on) {
    var el = document.getElementById('mixallTrBadge');
    if (!on) { if (el) el.remove(); return; }
    if (el || !document.body) return;
    el = document.createElement('div'); el.id = 'mixallTrBadge'; el.setAttribute('data-no-translate', '');
    el.textContent = '🌐 Translating…';
    el.style.cssText = 'position:fixed;left:8px;top:8px;z-index:2147482000;background:rgba(20,22,27,.8);color:#fff;font-size:.72rem;padding:3px 10px;border-radius:999px;pointer-events:none';
    document.body.appendChild(el);
  }
  function run() {
    if (lang === 'ja') return;
    if (busy) { pending = true; return; }
    busy = true;
    var c = collect(document.body);
    var items = c.nodes.map(function (n) { return n.nodeValue.trim(); }).concat(c.attrs.map(function (a) { return a[2].trim(); }));
    if (!items.length) { busy = false; return; }
    var uniq = Array.from(new Set(items)), map = {};
    badge(true);
    // できた分から順に反映する(全部終わるのを待たない)
    function apply() {
      c.nodes.forEach(function (n) { if (orig.has(n)) return; var t = n.nodeValue, k = t.trim(); if (map[k] != null && n.parentNode) { orig.set(n, t); n.nodeValue = t.replace(k, map[k]); } });
      c.attrs.forEach(function (a) { var k = a[2].trim(); if (map[k] != null && !(a[0].__tr && a[0].__tr[a[1]])) { a[0].__tr = a[0].__tr || {}; a[0].__tr[a[1]] = a[2]; a[0].setAttribute(a[1], map[k]); } });
    }
    translateMany(uniq, lang, { ui: true, onChunk: function (idxs, tr) { idxs.forEach(function (i, n) { map[uniq[i]] = tr[n]; }); apply(); } })
      .catch(function () {}).then(function () { badge(false); busy = false; if (pending) { pending = false; setTimeout(run, 300); } });
  }
  var timer = null;
  function schedule() { clearTimeout(timer); timer = setTimeout(run, 400); }
  function startPageTranslation() {
    if (lang === 'ja') return;
    run();
    new MutationObserver(function (m) { if (!busy) schedule(); else pending = true; }).observe(document.body, { childList: true, subtree: true, characterData: false });
  }

  // ---- メッセージ翻訳 ----
  function translateMessage(post) {
    var el = post.querySelector('.text'); var text = el ? el.textContent.trim() : '';
    if (!text) { alert('翻訳できる本文がありません'); return; }
    var box = post.querySelector('.mixall-tr');
    if (box) { box.remove(); return; }
    box = document.createElement('div'); box.className = 'mixall-tr';
    box.style.cssText = 'margin-top:6px;padding:6px 10px;border-left:3px solid var(--accent,#5865f2);background:var(--panel-2,rgba(128,128,128,.12));border-radius:6px;font-size:.92em;white-space:pre-wrap;overflow-wrap:anywhere';
    box.textContent = '翻訳中…';
    el.insertAdjacentElement('afterend', box);
    var target = lang === 'ja' ? 'ja' : lang;
    translateRaw([text], target).then(function (r) { box.textContent = '🌐 ' + r[0]; }).catch(function (e) { box.textContent = '翻訳できませんでした: ' + e.message; });
  }
  function translateRaw(texts, target) { return api({ action: 'translate', target: target, texts: texts }).then(function (d) { return d.translations; }); }

  // ---- 言語設定 ----
  function setLang(l, opts) {
    ls(KEY, l); ls(SYNC, null);
    var s = session();
    var p = s && s.token ? api({ action: 'setLang', lang: l }).then(function () { ls(SYNC, l); }).catch(function () {}) : Promise.resolve();
    if (!opts || opts.reload !== false) p.then(function () { location.reload(); });
    return p;
  }
  function syncAccount() {
    var s = session(); if (!s || !s.token) return;
    if (ls(KEY) && ls(SYNC) !== ls(KEY)) { api({ action: 'setLang', lang: ls(KEY) }).then(function () { ls(SYNC, ls(KEY)); }).catch(function () {}); return; }
    if (!ls(KEY)) api({ action: 'getLang' }).then(function (d) { if (d.lang && d.lang !== 'ja') { ls(KEY, d.lang); ls(SYNC, d.lang); location.reload(); } }).catch(function () {});
  }
  function selectHtml(id) { return '<select id="' + id + '">' + LANGS.map(function (l) { return '<option value="' + l[0] + '"' + (l[0] === lang ? ' selected' : '') + '>' + l[1] + '</option>'; }).join('') + '</select>'; }

  window.MixAllI18n = { lang: lang, langs: LANGS, set: setLang, translateMessage: translateMessage, translate: translateMany, selectHtml: selectHtml, choose: function (l) { ls(KEY, l); ls(SYNC, null); } };
  document.addEventListener('DOMContentLoaded', function () { syncAccount(); startPageTranslation(); });
})();
