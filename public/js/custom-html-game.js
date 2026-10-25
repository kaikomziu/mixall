/* Custom: アップロードしたHTMLゲームを安全に(サンドボックスで)遊ぶための部品
   MixAllHtmlGame.build(files, entry, {name, id}) → iframe の srcdoc に入れるHTML文字列
   MixAllHtmlGame.run(iframe, {projectId, token, user}) → ゲーム側の MixAllCustom.save/load/list/remove 命令をAPIにつなぐ */
(function () {
  const MIME = { html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', mp4: 'video/mp4', webm: 'video/webm', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', txt: 'text/plain', csv: 'text/csv', xml: 'application/xml', glsl: 'text/plain', obj: 'text/plain' };
  const extOf = (p) => (String(p).split('?')[0].split('.').pop() || '').toLowerCase();
  const mimeOf = (p) => MIME[extOf(p)] || 'application/octet-stream';
  const norm = (path) => { const out = []; String(path).replace(/\\/g, '/').split('/').forEach((x) => { if (!x || x === '.') return; if (x === '..') out.pop(); else out.push(x); }); return out.join('/'); };
  const isBin = (f) => typeof f.content === 'string' && f.content.startsWith('data:');
  const dirOf = (p) => { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); };
  const esc = (s) => String(s).replace(/<\/(script)/gi, '<\\/$1');
  function dataUrl(f) { return isBin(f) ? f.content : 'data:' + mimeOf(f.path) + ';charset=utf-8,' + encodeURIComponent(f.content); }
  function build(files, entry, info) {
    info = info || {};
    const byPath = new Map(files.map((f) => [norm(f.path), f]));
    let ep = norm(entry || ''); if (!byPath.has(ep)) { ep = ''; for (const k of byPath.keys()) if (/(^|\/)index\.html?$/i.test(k)) { ep = k; break; } if (!ep) for (const k of byPath.keys()) if (/\.html?$/i.test(k)) { ep = k; break; } }
    const main = byPath.get(ep); if (!main || isBin(main)) throw new Error('HTMLファイルが見つかりません');
    const base = dirOf(ep);
    const find = (ref) => { if (!ref || /^(https?:|data:|blob:|\/\/|#|javascript:|mailto:)/i.test(ref)) return null; const clean = ref.split('#')[0].split('?')[0]; const k = clean.startsWith('/') ? norm(clean) : norm((base ? base + '/' : '') + clean); return byPath.get(k) || byPath.get(norm(clean)) || null; };
    const doc = new DOMParser().parseFromString(main.content, 'text/html');
    const used = new Set();
    doc.querySelectorAll('script[src]').forEach((el) => { const f = find(el.getAttribute('src')); if (f && !isBin(f)) { used.add(f); const n = doc.createElement('script'); [...el.attributes].forEach((a) => { if (a.name !== 'src') n.setAttribute(a.name, a.value); }); n.textContent = esc(f.content); el.replaceWith(n); } });
    const cssInline = (css, cssBase) => css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, u) => { const k = /^(https?:|data:|\/\/)/i.test(u) ? null : byPath.get(norm((cssBase ? cssBase + '/' : '') + u.split('?')[0])); return k ? 'url("' + dataUrl(k) + '")' : m; });
    doc.querySelectorAll('link[rel~="stylesheet"][href]').forEach((el) => { const f = find(el.getAttribute('href')); if (f && !isBin(f)) { used.add(f); const st = doc.createElement('style'); st.textContent = cssInline(f.content, dirOf(norm((base ? base + '/' : '') + el.getAttribute('href').split('?')[0]))); el.replaceWith(st); } });
    doc.querySelectorAll('style').forEach((el) => { el.textContent = cssInline(el.textContent, base); });
    doc.querySelectorAll('img[src],source[src],audio[src],video[src],video[poster],link[rel~="icon"][href],image').forEach((el) => {
      ['src', 'poster', 'href'].forEach((a) => { const v = el.getAttribute && el.getAttribute(a); if (!v) return; const f = find(v); if (f) { used.add(f); el.setAttribute(a, dataUrl(f)); } });
    });
    // ファイルの対応表(fetchで相対パスを読むゲーム用)
    const map = {}; let size = 0;
    byPath.forEach((f, k) => { if (used.has(f) || f === main) return; const n = f.content.length; if (size + n > 3.5e6) return; size += n; map[k] = isBin(f) ? { d: f.content } : { t: f.content, m: mimeOf(f.path) }; });
    const shim = '(function(){var M=' + JSON.stringify(map).replace(/</g, '\\u003c') + ',B=' + JSON.stringify(base) + ';' +
      'function nm(p){var o=[];String(p).split("?")[0].split("#")[0].split("/").forEach(function(x){if(!x||x===".")return;if(x==="..")o.pop();else o.push(x)});return o.join("/")}' +
      'function get(u){u=String(u);if(/^(https?:|data:|blob:|\\/\\/)/i.test(u))return null;return M[nm(u.charAt(0)==="/"?u:(B?B+"/":"")+u)]||M[nm(u)]||null}' +
      'function resp(f){if(f.d){var m=/^data:([^;,]*)(;base64)?,(.*)$/s.exec(f.d);var b=m[2]?atob(m[3]):decodeURIComponent(m[3]);var a=new Uint8Array(b.length);for(var i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return new Response(a,{headers:{"content-type":m[1]||"application/octet-stream"}})}return new Response(f.t,{headers:{"content-type":f.m}})}' +
      'var _f=window.fetch;window.fetch=function(u){var f=get(u&&u.url||u);if(f)return Promise.resolve(resp(f));return Promise.reject(new TypeError("このゲームからは外部への通信はできません"))};' +
      'var _o=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){this.__f=get(u);if(this.__f){this.__u="data:"+(this.__f.m||"text/plain")+","+encodeURIComponent(this.__f.t||"");return _o.call(this,m,this.__f.d||this.__u)}return _o.apply(this,arguments)};' +
      '["localStorage","sessionStorage"].forEach(function(nm){try{window[nm].getItem("x")}catch(e){var st={};var o={getItem:function(k){return Object.prototype.hasOwnProperty.call(st,k)?st[k]:null},setItem:function(k,v){st[k]=String(v)},removeItem:function(k){delete st[k]},clear:function(){st={}},key:function(i){return Object.keys(st)[i]||null}};Object.defineProperty(o,"length",{get:function(){return Object.keys(st).length}});try{Object.defineProperty(window,nm,{value:o,configurable:true})}catch(_){}}});' +
      'var pend={},n=0;function call(op,a){return new Promise(function(res,rej){var id=++n;pend[id]={res:res,rej:rej};parent.postMessage({mx:1,id:id,op:op,args:a},"*");setTimeout(function(){if(pend[id]){delete pend[id];rej(new Error("timeout"))}},20000)})}' +
      'addEventListener("message",function(e){var d=e.data;if(!d||!d.mxr)return;var p=pend[d.id];if(!p)return;delete pend[d.id];d.error?p.rej(new Error(d.error)):p.res(d.result)});' +
      'window.MixAllCustom={user:{name:' + JSON.stringify(String(info.name || 'ゲスト')) + ',id:' + JSON.stringify(String(info.id || '')) + '},' +
      'save:function(k,v,o){return call("save",{key:k,value:v,scope:(o&&o.scope)||"account"})},' +
      'load:function(k,o){return call("load",{key:k,scope:(o&&o.scope)||"account"})},' +
      'list:function(p){return call("list",{prefix:p||""})},remove:function(k){return call("remove",{key:k})}};})();';
    const csp = doc.createElement('meta'); csp.httpEquiv = 'Content-Security-Policy';
    csp.content = "default-src data: blob: 'unsafe-inline' 'unsafe-eval'; script-src data: blob: 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com; style-src data: 'unsafe-inline' https://fonts.googleapis.com; font-src data: https://fonts.gstatic.com; img-src data: blob:; media-src data: blob:; connect-src data:; frame-src 'none'; form-action 'none'";
    const head = doc.head || doc.documentElement.insertBefore(doc.createElement('head'), doc.body);
    const sc = doc.createElement('script'); sc.textContent = shim;
    head.insertBefore(sc, head.firstChild); head.insertBefore(csp, head.firstChild);
    return '<!doctype html>' + doc.documentElement.outerHTML;
  }
  // 親ページ側: ゲームからの保存・読み込み依頼を受けてAPIに中継する
  function run(iframe, ctx) {
    const API = '/api/custom';
    const post = async (body) => { const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: ctx.token, projectId: ctx.projectId, ...body }) }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || '失敗しました'); return d; };
    let active = 0; const waiters = [];
    const slot = () => new Promise((res) => { const go = () => { if (active < 3) { active++; res(); } else waiters.push(go); }; go(); });
    const free = () => { active--; const n = waiters.shift(); if (n) n(); };
    const handler = async (e) => {
      if (e.source !== iframe.contentWindow) return; const d = e.data; if (!d || d.mx !== 1) return;
      const reply = (o) => { try { iframe.contentWindow.postMessage({ mxr: 1, id: d.id, ...o }, '*'); } catch (_) {} };
      await slot();
      try {
        const a = d.args || {};
        if (d.op === 'save') { await post({ action: 'saveData', key: String(a.key), value: a.value, scope: a.scope === 'game' ? 'game' : 'account' }); reply({ result: true }); }
        else if (d.op === 'load') { const r = await post({ action: 'loadData', key: String(a.key), scope: a.scope === 'game' ? 'game' : 'account' }); reply({ result: r.value }); }
        else if (d.op === 'list') { const r = await post({ action: 'listData', prefix: String(a.prefix || '') }); reply({ result: r.items }); }
        else if (d.op === 'remove') { await post({ action: 'deleteData', key: String(a.key) }); reply({ result: true }); }
        else reply({ error: '不明な命令です' });
      } catch (err) { reply({ error: err.message }); } finally { free(); }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }
  window.MixAllHtmlGame = { build, run, extOf, mimeOf, norm };
})();
