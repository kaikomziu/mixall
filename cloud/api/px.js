// MAWSプロキシ: /api/px?u=<URL>  サーバーがサイトを取得して返す(PS等のbot扱いされやすい端末向け)。
// 安全策: 公開アドレスのみ(SSRF対策)・Cookie/ログイン情報は転送しない・パスワード欄は無効化・
//         MAWS側は sandbox(allow-same-origin なし) の iframe で開くのでMixAllのセッションに触れない。
import dns from 'node:dns/promises';
import net from 'node:net';
import crypto from 'node:crypto';
import { SUPABASE_SECRET_KEY } from '../_lib/config.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const MAX_BYTES = 30 * 1024 * 1024;
const MAX_HTML = 6 * 1024 * 1024;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS', 'Access-Control-Expose-Headers': 'Content-Range,Accept-Ranges,Content-Length' };
// ---- 成人向けサイト(FANZA/DMM・Pornhub): 18歳以上と確認済みのログインユーザーだけ。 ----
// /api/pixiv の adultPass で発行する署名つき通行証(k=)がないと開けない。通行証は書き換え後のリンクにも自動で付く。
const ADULT_RE = /(^|\.)(dmm\.co\.jp|dmm\.com|dmm-extension\.com|pornhub\.com|phncdn\.com|pornhubpremium\.com)$/i;
const ADULT_COOKIE = (host) => /pornhub|phncdn/i.test(host) ? 'accessAgeDisclaimerPH=1; accessAgeDisclaimerUK=1; accessPH=1; cookiesBannerSeen=1; hasVisited=1' : 'age_check_done=1; cklg=ja; ckcy=1';
const passSig = (exp) => crypto.createHmac('sha256', 'maws-adult|' + SUPABASE_SECRET_KEY).update(String(exp)).digest('hex').slice(0, 32);
const passOk = (k) => { const m = /^(\d{10,13})\.([0-9a-f]{32})$/.exec(String(k || '')); if (!m || Number(m[1]) < Date.now()) return false; const a = Buffer.from(passSig(m[1])), b = Buffer.from(m[2]); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const P = '/api/px?b='; // 学校等のフィルタに「中身のURL」を見られないよう、対象URLはbase64urlで包む
const b64e = (t) => Buffer.from(String(t), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function page(status, title, msg) {
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font-family:sans-serif;padding:24px;max-width:640px;margin:auto;line-height:1.7"><h2>${title}</h2><p>${msg}</p>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...CORS } });
}

const hits = new Map();
function limited(ip) { const now = Date.now(); const a = (hits.get(ip) || []).filter((t) => now - t < 10000); a.push(now); hits.set(ip, a); if (hits.size > 4000) hits.clear(); return a.length > 120; }

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = String(ip).toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb');
}
async function assertPublic(u, selfHost) {
  if (!/^https?:$/.test(u.protocol)) throw new Error('http(s)のURLのみ開けます');
  if (u.port && !['80', '443'].includes(u.port)) throw new Error('ポート80/443以外は開けません');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === selfHost || /^localhost$|\.local$|\.internal$|\.localhost$/i.test(host)) throw new Error('このURLは開けません');
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new Error('ドメインを解決できませんでした');
  if (addrs.some((a) => isPrivateIp(a.address))) throw new Error('このURLは開けません');
}

const px = (abs) => P + b64e(abs);
function resolve(raw, base) {
  const s = String(raw || '').trim();
  if (!s || /^(data:|blob:|javascript:|about:|#|mailto:|tel:)/i.test(s)) return null;
  try { const u = new URL(s, base); return /^https?:$/.test(u.protocol) ? u.href : null; } catch (_) { return null; }
}
function rewriteCss(css, base) {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (m, q, u) => { const a = resolve(u, base); return a ? `url(${q}${px(a)}${q})` : m; })
    .replace(/@import\s+(['"])([^'"]+)\1/gi, (m, q, u) => { const a = resolve(u, base); return a ? `@import ${q}${px(a)}${q}` : m; });
}
function rewriteSrcset(v, base) {
  return v.split(',').map((part) => { const t = part.trim().split(/\s+/); const a = resolve(t[0], base); if (a) t[0] = px(a); return t.join(' '); }).join(', ');
}

const SHIM = (virt) => `<script>(function(){
var P=${JSON.stringify(P)},VIRT=${JSON.stringify(virt)};
function abs(u){try{return new URL(u,VIRT)}catch(e){return null}}
function b64(t){return btoa(unescape(encodeURIComponent(t))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'')}
function unb64(t){t=t.replace(/-/g,'+').replace(/_/g,'/');while(t.length%4)t+='=';return decodeURIComponent(escape(atob(t)))}
function prox(u){if(u==null)return u;var s=String(u);if(/^(data:|blob:|javascript:|about:|#|mailto:|tel:)/i.test(s))return s;if(s.indexOf(P)===0)return s;var a=abs(s);if(!a||!/^https?:$/.test(a.protocol))return s;return P+b64(a.href)}
function note(){try{parent.postMessage({mawsPx:VIRT},'*')}catch(e){}}
try{var mem={};var st={getItem:function(k){return k in mem?mem[k]:null},setItem:function(k,v){mem[k]=String(v)},removeItem:function(k){delete mem[k]},clear:function(){mem={}},key:function(i){return Object.keys(mem)[i]||null},get length(){return Object.keys(mem).length}};
['localStorage','sessionStorage'].forEach(function(n){try{void window[n]}catch(e){Object.defineProperty(window,n,{value:st,configurable:true})}})}catch(e){}
try{var ck='';Object.defineProperty(document,'cookie',{get:function(){return ck},set:function(v){ck=String(v).split(';')[0]},configurable:true})}catch(e){}
var of=window.fetch;if(of)window.fetch=function(i,init){init=Object.assign({},init||{});init.credentials='omit';if(typeof i==='string'||i instanceof URL)return of.call(this,prox(i),init);if(i&&i.url){return of.call(this,new Request(prox(i.url),i),init)}return of.call(this,i,init)};
var xo=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){arguments[1]=prox(u);var r=xo.apply(this,arguments);try{this.withCredentials=false}catch(e){}return r};
if(navigator.sendBeacon)navigator.sendBeacon=function(){return true};
function patch(proto,prop){var d=Object.getOwnPropertyDescriptor(proto,prop);if(!d||!d.set)return;Object.defineProperty(proto,prop,{get:d.get,set:function(v){d.set.call(this,prox(v))},configurable:true,enumerable:d.enumerable})}
[[HTMLImageElement,'src'],[HTMLScriptElement,'src'],[HTMLIFrameElement,'src'],[HTMLSourceElement,'src'],[HTMLVideoElement,'src'],[HTMLAudioElement,'src'],[HTMLEmbedElement,'src'],[HTMLLinkElement,'href'],[HTMLAnchorElement,'href'],[HTMLFormElement,'action']].forEach(function(x){try{patch(x[0].prototype,x[1])}catch(e){}});
var sa=Element.prototype.setAttribute;Element.prototype.setAttribute=function(n,v){var l=String(n).toLowerCase();if(l==='src'||l==='href'||l==='action'||l==='poster')v=prox(v);else if(l==='srcset')v=String(v).split(',').map(function(p){var t=p.trim().split(/\\s+/);t[0]=prox(t[0]);return t.join(' ')}).join(', ');return sa.call(this,n,v)};
window.open=function(u){if(u)location.href=prox(u);return null};
function real(h){var s=String(h||'');if(s.indexOf(P)===0){try{s=unb64(s.slice(P.length).split('&')[0])}catch(e){}}var a=abs(s);if(!a)return null;if(/(^|\\.)duckduckgo\\.com$/.test(a.hostname)&&a.pathname==='/l/'&&a.searchParams.get('uddg'))return a.searchParams.get('uddg');return a.href}
document.addEventListener('click',function(e){var a=e.target&&e.target.closest?e.target.closest('a[href]'):null;if(!a||e.defaultPrevented)return;var r=real(a.getAttribute('href'));if(!r)return;try{if(/(^|\\.)pixiv\\.net$/.test(new URL(r).hostname)){e.preventDefault();parent.location.href='/MAWS/?ServerAction='+encodeURIComponent(r);return}}catch(x){}if(a.target&&a.target!=='_self'){a.target='_self'}},true);
['pushState','replaceState'].forEach(function(n){var o=history[n];history[n]=function(s,t,u){if(u!=null){var a=abs(u);if(a)VIRT=a.href;note()}return o.call(history,s,t)}});
document.addEventListener('submit',function(e){var f=e.target;if(!f||!f.getAttribute)return;var raw=f.getAttribute('action')||'';if(raw.indexOf(P)===0)return;var a=abs(raw||VIRT);if(!a)return;if((f.method||'get').toLowerCase()==='get'){e.preventDefault();var q=new URLSearchParams(new FormData(f)).toString();a.search=q;location.href=P+b64(a.href)}else{f.setAttribute('action',P+b64(a.href))}},true);
note();
})();</script>`;

function rewriteHtml(html, base) {
  let out = html
    .replace(/<meta[^>]+http-equiv=["']?(?:content-security-policy|refresh)[^>]*>/gi, '')
    .replace(/<base\b[^>]*>/gi, '')
    .replace(/\s(?:integrity|nonce)=("[^"]*"|'[^']*')/gi, '')
    .replace(/<input\b[^>]*type=["']?password["']?[^>]*>/gi, '<input type="text" disabled placeholder="パスワード入力はプロキシ経由では使えません">')
    .replace(/(\s)(src|href|poster|data-src|data-original)=("([^"]*)"|'([^']*)')/gi, (m, sp, attr, whole, d, s) => {
      const q = whole[0]; const val = d !== undefined ? d : s;
      const a = resolve(val.replace(/&amp;/g, '&'), base);
      if (!a) return m;
      return `${sp}${attr}=${q}${px(a).replace(/&/g, '&amp;')}${q}`;
    })
    .replace(/(\s)srcset=("([^"]*)"|'([^']*)')/gi, (m, sp, whole, d, s) => `${sp}srcset="${rewriteSrcset(d !== undefined ? d : s, base).replace(/"/g, '&quot;')}"`)
    .replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (m, at, css) => `<style${at}>${rewriteCss(css, base)}</style>`)
    .replace(/style=("([^"]*)"|'([^']*)')/gi, (m, whole, d, s) => { const v = d !== undefined ? d : s; return /url\(/i.test(v) ? `style="${rewriteCss(v, base).replace(/"/g, '&quot;')}"` : m; })
    .replace(/\starget=["']?_(?:top|parent|blank|new)["']?/gi, ' target="_self"');
  const shim = SHIM(base);
  if (/<head[^>]*>/i.test(out)) out = out.replace(/<head[^>]*>/i, (m) => m + shim);
  else out = shim + out;
  return out;
}

export async function onRequest(context) {
  const req = context.request;
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (!['GET', 'HEAD', 'POST'].includes(req.method)) return page(405, 'この操作はできません', 'GET/HEAD/POSTのみ対応しています。');
  const ip = context.clientIp || req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  if (limited(ip)) return page(429, 'アクセスが多すぎます', '少し待ってからもう一度開いてください。');
  const self = new URL(req.url);
  let target;
  try { target = new URL(self.searchParams.get('b') ? Buffer.from(self.searchParams.get('b').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8') : (self.searchParams.get('u') || '')); } catch (_) { return page(400, 'URLが不正です', '開きたいURLを確認してください。'); }
  const jumpDest = req.headers.get('sec-fetch-dest') || '';
  const pixivJump = (u) => new Response(`<!doctype html><meta charset=utf-8><script>top.location.replace('/MAWS/?ServerAction='+encodeURIComponent(${JSON.stringify(u)}))</script>`, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...CORS } });
  const isPixiv = (u) => { try { return /(^|\.)pixiv\.net$/.test(new URL(u).hostname); } catch (_) { return false; } };
  if (['iframe', 'document'].includes(jumpDest) && isPixiv(target.href) && !self.searchParams.has('raw')) return pixivJump(target.href);
  // DuckDuckGoの「検索結果 → /l/?uddg=(リダイレクト用URL) → 結果ページ」は中継ページを経由せず、直接結果ページへ飛ばす
  if (/(^|\.)duckduckgo\.com$/.test(target.hostname) && target.pathname === '/l/' && target.searchParams.get('uddg')) {
    const dest = resolve(target.searchParams.get('uddg'), target.href);
    if (dest) {
      if (['iframe', 'document'].includes(jumpDest) && isPixiv(dest)) return pixivJump(dest);
      return new Response(null, { status: 302, headers: { Location: K(px(dest)), 'Cache-Control': 'no-store', ...CORS } });
    }
  }
  try { await assertPublic(target, self.hostname); } catch (e) { return page(400, '開けません', String(e.message || e)); }
  const adultHost = ADULT_RE.test(target.hostname);
  const pass = passOk(self.searchParams.get('k')) ? self.searchParams.get('k') : '';
  if (adultHost && !pass) return page(403, '18歳以上の確認が必要です', 'このサイトは、MAWSの画面から開き直してください(ログイン・年齢確認が必要です)。');
  const K = (str) => pass ? String(str).split('/api/px?b=').join('/api/px?k=' + pass + '&b=') : str;

  const headers = { 'User-Agent': UA, Accept: req.headers.get('accept') || '*/*', 'Accept-Language': req.headers.get('accept-language') || 'ja,en;q=0.8', Referer: target.origin + '/' };
  if (adultHost) headers.Cookie = ADULT_COOKIE(target.hostname);
  const range = req.headers.get('range'); if (range) headers.Range = range;
  let body;
  if (req.method === 'POST') {
    const buf = Buffer.from(await req.arrayBuffer());
    if (buf.length > 1024 * 1024) return page(413, '送信データが大きすぎます', '1MBまでです。');
    body = buf; headers['Content-Type'] = req.headers.get('content-type') || 'application/x-www-form-urlencoded'; headers.Origin = target.origin;
  }
  const ac = new AbortController(); const abortTimer = setTimeout(() => ac.abort(), 25000);
  const res = await fetch(target.href, { method: req.method, headers, body, redirect: 'manual', signal: ac.signal }).catch(() => null);
  clearTimeout(abortTimer); // 応答が始まったあとは打ち切らない(動画のストリーミングのため)
  if (!res) return page(502, '接続できませんでした', '相手のサイトに接続できませんでした。時間をおいて試してください。');

  if ([301, 302, 303, 307, 308].includes(res.status)) {
    const loc = resolve(res.headers.get('location') || '', target.href);
    if (!loc) return page(502, 'リダイレクト先が不正です', '');
    if (['iframe', 'document'].includes(jumpDest) && isPixiv(loc)) return pixivJump(loc);
    return new Response(null, { status: 302, headers: { Location: K(px(loc)), 'Cache-Control': 'no-store', ...CORS } });
  }
  const ct = res.headers.get('content-type') || 'application/octet-stream';
  const out = { 'Content-Type': ct, 'X-Content-Type-Options': 'nosniff', ...CORS };
  if (/^text\/html|application\/xhtml/i.test(ct)) {
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_HTML) return page(413, 'ページが大きすぎます', '');
    let text; try { const cs = /charset=([\w-]+)/i.exec(ct)?.[1] || /<meta[^>]+charset=["']?([\w-]+)/i.exec(buf.subarray(0, 4096).toString('latin1'))?.[1] || 'utf-8'; text = new TextDecoder(cs).decode(buf); } catch (_) { text = buf.toString('utf8'); }
    out['Content-Type'] = 'text/html; charset=utf-8'; out['Cache-Control'] = 'no-store';
    return new Response(req.method === 'HEAD' ? null : K(rewriteHtml(text, target.href)), { status: res.status, headers: out });
  }
  if (/^text\/css/i.test(ct)) {
    const text = await res.text();
    out['Cache-Control'] = 'public, max-age=300';
    return new Response(K(rewriteCss(text, target.href)), { status: res.status, headers: out });
  }
  // 動画・音声はバッファせずそのまま流す(Range対応・サイズ上限なし)。HLS(.m3u8)は中のURLをプロキシ経由に書き換える
  if (/mpegurl/i.test(ct) || /\.m3u8(\?|$)/i.test(target.pathname + target.search)) {
    const text = await res.text();
    const rewritten = text.split('\n').map((line) => {
      const t = line.trim(); if (!t) return line;
      if (t.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (m, u) => { const a = resolve(u, target.href); return a ? `URI="${px(a)}"` : m; });
      const a = resolve(t, target.href); return a ? px(a) : line;
    }).join('\n');
    out['Content-Type'] = 'application/vnd.apple.mpegurl'; out['Cache-Control'] = 'no-store';
    return new Response(K(rewritten), { status: res.status, headers: out });
  }
  if (/^(video|audio)\//i.test(ct) || /^application\/(ogg|octet-stream|vnd\.apple\.mpegurl|x-mpegurl)/i.test(ct) && /\.(mp4|webm|m4v|mov|mp3|m4a|ogg|ts|m4s|aac)(\?|$)/i.test(target.pathname)) {
    for (const h of ['content-range', 'accept-ranges', 'content-length']) { const v = res.headers.get(h); if (v && !(h === 'content-length' && res.headers.get('content-encoding'))) out[h] = v; }
    if (!out['accept-ranges']) out['accept-ranges'] = 'bytes';
    out['Cache-Control'] = 'public, max-age=3600';
    return new Response(req.method === 'HEAD' ? null : res.body, { status: res.status, headers: out });
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) return page(413, 'ファイルが大きすぎます', '30MBまでです。');
  for (const h of ['content-range', 'accept-ranges']) { const v = res.headers.get(h); if (v) out[h] = v; }
  out['Cache-Control'] = /^(image|font|video|audio)\//i.test(ct) || /javascript/i.test(ct) ? 'public, max-age=3600' : 'no-store';
  return new Response(req.method === 'HEAD' ? null : buf, { status: res.status, headers: out });
}

export { rewriteHtml, rewriteCss };
