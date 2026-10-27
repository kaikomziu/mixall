// scripts/patches/lending-server.mjs
// サイト作成（/lending）のサーバー側の置き換え。scripts/build-edgeone.mjs が自動で読み込む。
// 友人のファイル（cloud/ 以下）は書き換えず、ビルド時に cloud-functions/ の中身だけを置き換える。
//   13. 保存直後に AI 審査を1件だけ実行（問題なければ誰でも見られる。キーが無い・失敗なら審査待ちのまま）
//   14. /site-view/<slug>（[[default]].js）も第2〜第5の Supabase を読む
//   15. 公開データ（/api/lending-data?...&public=1）の GET に CORS *、OPTIONS にも答える
//   16. 一覧の並列読み込み、HTML の上限をバイト数（UTF-8）で判定
//   19. 一覧・保存の応答に status / statusNote / updatedAt / url / private
//   21. 画像のアップロード・一覧・削除・配信（kv ストア mixall-site-images）
//   22. 公開/非公開（site.private）
import { readFileSync } from 'node:fs';

export const labels = [
  'サイト: 補助関数', 'サイト: 文脈(waitUntil)の受け渡し', 'サイト: 文脈(handle引数)',
  'サイト: 画像配信とOPTIONS', 'サイト: 一覧の並列化と状態', 'サイト: 画像API', 'サイト: HTML上限をバイト数で', 'サイト: 公開/非公開の保存',
  'サイト: 保存時AI審査', 'サイト: 削除時に画像も削除',
  'サイト審査(lending): 画像の補助', 'サイト審査(lending): 自分の画像は外部扱いしない', 'サイト審査(lending): 自分の画像をAIに渡す', 'サイト審査(lending): 画像の読み込み',
  'サイト審査(月次): 画像の補助', 'サイト審査(月次): 自分の画像は外部扱いしない', 'サイト審査(月次): 自分の画像をAIに渡す', 'サイト審査(月次): 画像の読み込み',
  'サイト表示(api): 非公開ページ', 'サイト表示(api): 非公開の判定', 'サイト表示(api): 本人は年齢確認なし',
  'サイト表示(site-view): 非公開ページ', 'サイト表示(site-view): 非公開の判定', 'サイト表示(site-view): 本人は年齢確認なし',
  'サイト表示(site-view): 第2以降のSupabaseの設定', 'サイト表示(site-view): 第2以降のSupabaseを読む',
  'サイトデータ: 公開GETのCORS', 'サイトデータ: 並列化の補助', 'サイトデータ: 一覧の並列化'
];

// ---- lending.js に足す補助関数（require_lending の中に入る。STORE_NAMES / getJSON / setJSON / deleteKey / listKeys / json / normalizeSlug を使う） ----
const LENDING_HELPERS = String.raw`
    var { reviewTarget: __mxReviewTarget } = require_program_review();
    var __MX_IMG_STORE = "mixall-site-images";
    var __MX_IMG_MAX_BYTES = 700 * 1024;
    var __MX_IMG_MAX_COUNT = 30;
    var __MX_REVIEW_WAIT_MS = 15e3;
    var __MX_CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400" };
    // 同時に n 件ずつ並べて実行する（順番は保つ）
    async function __mxMapLimit(items, limit, fn) {
      const out = new Array(items.length);
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
      }));
      return out;
    }
    // 公開 URL のドメイン: 環境変数 MIXALL_SITE_URL → リクエストの Host → リクエストの URL
    function __mxOrigin(event) {
      const fromEnv = String(process.env.MIXALL_SITE_URL || "").trim().replace(/\/+$/, "");
      if (/^https?:\/\/[^/]+$/i.test(fromEnv)) return fromEnv;
      const h = event && event.headers || {};
      const host = String(h["x-forwarded-host"] || h.host || "").split(",")[0].trim();
      if (/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return (/^(localhost|127\.0\.0\.1)(:|$)/i.test(host) ? "http://" : "https://") + host;
      try { return new URL(event.rawUrl).origin; } catch (_) { return ""; }
    }
    // 表示の状態: public（公開中）/ reviewing（審査待ち）/ blocked（停止）/ private（非公開）
    function __mxSiteStatus(s) {
      const pr = s.programReview || {};
      const ar = s.ageReview || {};
      if (pr.human && pr.human.decision === "block") return ["blocked", "運営の審査により停止されています。"];
      if (pr.ai && pr.ai.holdPublic === true && !(pr.human && pr.human.decision === "approve")) return ["blocked", "AIの安全性審査で要確認となったため、運営の確認が終わるまで公開を止めています。"];
      if (s.private === true) return ["private", "非公開です（自分だけが見られます）。"];
      if (ar.status === "reviewed") {
        if (Array.isArray(ar.categories) && ar.categories.length) return ["public", "年齢制限つきで公開中です（ログインして年齢を確認できた人だけが見られます）。"];
        return ["public", "公開中です（誰でも見られます）。"];
      }
      if (ar.status === "needs_manual") return ["reviewing", "運営の確認待ちです（" + String(ar.manualReason || "AIだけでは確認できない内容があります") + "）。それまではログインした人だけが見られます。"];
      if (s.autoReview && s.autoReview.status === "failed") return ["reviewing", "AI審査を実行できなかったため審査待ちです。それまではログインした人だけが見られます。"];
      return ["reviewing", "AI審査中です。終わるまではログインした人だけが見られます。"];
    }
    function __mxSiteSummary(s, origin) {
      const [status, statusNote] = __mxSiteStatus(s);
      return { slug: s.slug, title: s.title, updatedAt: s.updatedAt || null, createdAt: s.createdAt || null, status, statusNote, url: origin + "/site-view/" + s.slug, private: s.private === true };
    }
    async function __mxMySites(email, event) {
      const keys = await listKeys(STORE_NAMES.LENDING_SITES, void 0);
      const origin = __mxOrigin(event);
      const rows = await __mxMapLimit(keys, 12, async (key) => {
        try { return await getJSON(STORE_NAMES.LENDING_SITES, key); } catch (error) { console.error("lending list read failed:", key, error && error.message); return null; }
      });
      return rows.filter((s) => s && s.ownerEmail === email).map((s) => __mxSiteSummary(s, origin));
    }
    // 保存直後の AI 審査（月次審査と同じ reviewTarget を1件だけ）。失敗しても例外は出さず、審査待ちのままにする
    async function __mxAutoReview(slug, fp) {
      try {
        const result = await __mxReviewTarget("site", slug);
        return { ok: true, result };
      } catch (error) {
        const message = String(error && error.message || error).slice(0, 200);
        try {
          const cur = await getJSON(STORE_NAMES.LENDING_SITES, slug);
          if (cur && cur.reviewFingerprint === fp && (!cur.ageReview || cur.ageReview.status === "pending")) {
            cur.autoReview = { status: "failed", at: (/* @__PURE__ */ new Date()).toISOString(), error: message };
            await setJSON(STORE_NAMES.LENDING_SITES, slug, cur);
          }
        } catch (_) {}
        return { ok: false, error: message };
      }
    }
    async function __mxAfterSave(site, event, ctx) {
      let latest = site;
      if (!site.ageReview || site.ageReview.status === "pending") {
        const job = __mxAutoReview(site.slug, site.reviewFingerprint);
        let timer;
        const done = await Promise.race([job.then(() => true), new Promise((resolve) => { timer = setTimeout(() => resolve(false), __MX_REVIEW_WAIT_MS); })]);
        clearTimeout(timer);
        if (done) latest = await getJSON(STORE_NAMES.LENDING_SITES, site.slug) || site;
        else {
          // 時間がかかっているときは応答を先に返し、審査は裏で続ける（結果は site に書き戻される）
          try { if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(job); } catch (_) {}
        }
      }
      const summary = __mxSiteSummary(latest, __mxOrigin(event));
      return json(200, { site: summary, status: summary.status, statusNote: summary.statusNote, url: summary.url, private: summary.private });
    }
    // ---- 画像 ----
    function __mxImageType(buf) {
      if (buf.length > 8 && buf[0] === 137 && buf[1] === 80 && buf[2] === 78 && buf[3] === 71) return "image/png";
      if (buf.length > 3 && buf[0] === 255 && buf[1] === 216 && buf[2] === 255) return "image/jpeg";
      if (buf.length > 6 && buf.toString("latin1", 0, 4) === "GIF8") return "image/gif";
      if (buf.length > 12 && buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return "image/webp";
      return null;
    }
    function __mxImageUrl(origin, slug, id) {
      return origin + "/api/lending?image=" + slug + "/" + id;
    }
    async function __mxImageIndex(slug) {
      const index = await getJSON(__MX_IMG_STORE, "index:" + slug);
      return Array.isArray(index) ? index : [];
    }
    async function __mxServeImage(ref) {
      const base = { ...__MX_CORS, "X-Content-Type-Options": "nosniff" };
      const m = String(ref || "").match(/^([a-z0-9-]{2,40})\/([a-f0-9]{8,40})$/);
      if (!m) return { statusCode: 400, headers: { ...base, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }, body: "invalid image id" };
      const rec = await getJSON(__MX_IMG_STORE, m[1] + "/" + m[2]);
      if (!rec || !rec.data || !/^image\/(png|jpeg|webp|gif)$/.test(rec.type)) return { statusCode: 404, headers: { ...base, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }, body: "image not found" };
      return { statusCode: 200, headers: { ...base, "Content-Type": rec.type, "Cache-Control": "public, max-age=86400", "Content-Security-Policy": "default-src 'none'" }, body: rec.data, isBase64Encoded: true };
    }
    async function __mxDeleteSiteImages(slug) {
      const index = await __mxImageIndex(slug);
      await __mxMapLimit(index, 6, (img) => deleteKey(__MX_IMG_STORE, slug + "/" + img.id).catch(() => {}));
      await deleteKey(__MX_IMG_STORE, "index:" + slug).catch(() => {});
    }
    async function __mxImageAction(action, payload, email, event) {
      const slug = normalizeSlug(payload.slug);
      const site = slug ? await getJSON(STORE_NAMES.LENDING_SITES, slug) : null;
      if (!site || site.ownerEmail !== email) return json(404, { error: "サイトが見つかりません（画像は保存済みの自分のサイトにだけ追加できます）" });
      const origin = __mxOrigin(event);
      const withUrl = (img) => ({ ...img, url: __mxImageUrl(origin, slug, img.id) });
      if (action === "listImages") {
        const index = await __mxImageIndex(slug);
        return json(200, { images: index.map(withUrl), count: index.length, max: __MX_IMG_MAX_COUNT, maxBytes: __MX_IMG_MAX_BYTES });
      }
      if (action === "deleteImage") {
        const id = String(payload.id || "").toLowerCase();
        if (!/^[a-f0-9]{8,40}$/.test(id)) return json(400, { error: "画像IDが不正です" });
        const index = await __mxImageIndex(slug);
        if (!index.some((img) => img.id === id)) return json(404, { error: "画像が見つかりません" });
        await deleteKey(__MX_IMG_STORE, slug + "/" + id);
        const rest2 = index.filter((img) => img.id !== id);
        await setJSON(__MX_IMG_STORE, "index:" + slug, rest2);
        return json(200, { ok: true, count: rest2.length });
      }
      // uploadImage
      const m = String(payload.dataUrl || "").match(/^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=\s]+)$/i);
      if (!m) return json(400, { error: "画像は PNG・JPEG・WebP・GIF の data URL で送ってください" });
      const buf = Buffer.from(m[2].replace(/\s+/g, ""), "base64");
      if (!buf.length) return json(400, { error: "画像が空です" });
      if (buf.length > __MX_IMG_MAX_BYTES) return json(400, { error: "画像は1枚700KBまでです" });
      const type = __mxImageType(buf);
      if (!type) return json(400, { error: "画像の形式を確認できませんでした（PNG・JPEG・WebP・GIF のみ）" });
      const index = await __mxImageIndex(slug);
      if (index.length >= __MX_IMG_MAX_COUNT) return json(400, { error: "画像は1サイト30枚までです。不要な画像を削除してください" });
      const id = __require("crypto").randomBytes(8).toString("hex");
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const name = String(payload.name || "image").replace(/[\u0000-\u001f<>]/g, "").slice(0, 120) || "image";
      await setJSON(__MX_IMG_STORE, slug + "/" + id, { type, data: buf.toString("base64"), name, bytes: buf.length, slug, ownerEmail: email, createdAt: now });
      const entry = { id, name, type, bytes: buf.length, createdAt: now };
      await setJSON(__MX_IMG_STORE, "index:" + slug, [...index, entry]);
      const url = __mxImageUrl(origin, slug, id);
      return json(200, { ok: true, url, id, image: { ...entry, url }, count: index.length + 1 });
    }
`;

// ---- program-review（lending.js と月次審査の両方）に足す補助: 自分のサイトの画像（/api/lending?image=<slug>/<id>）を読み込んで AI に渡す ----
const REVIEW_HELPERS = String.raw`
    var __MX_OWN_IMG = globalThis.__mxOwnImg || (globalThis.__mxOwnImg = new Map());
    var __MX_OWN_IMG_MAX = 6;
    function __mxOwnRefKey(slug, url) {
      const m = String(url || "").replace(/&amp;/g, "&").match(/\/api\/lending\?(?:[^"'#]*&)?image=([a-z0-9-]{2,40})(?:\/|%2F)([a-f0-9]{8,40})/i);
      return m && m[1].toLowerCase() === String(slug || "").toLowerCase() ? m[1].toLowerCase() + "/" + m[2].toLowerCase() : null;
    }
    // 読み込み済みの自分の画像だけを「確認できる画像」として扱う（読めなかったもの・上限を超えたものは外部扱いのまま）
    function __mxOwnFor(item, mediaRefs) {
      const refs = new Set();
      const images = [];
      const seen = new Set();
      for (const url of mediaRefs) {
        const key = __mxOwnRefKey(item && item.slug, url);
        const dataUrl = key ? __MX_OWN_IMG.get(key) : null;
        if (!dataUrl) continue;
        refs.add(url);
        if (!seen.has(key)) { seen.add(key); images.push(dataUrl); }
      }
      return { refs, images };
    }
    async function __mxPreloadImages(item) {
      try {
        const html = String(item && item.html || "");
        const keys = [];
        for (const tag of html.matchAll(/<(?:img|video|audio|source|iframe)\b[^>]*>/gi)) {
          for (const m of tag[0].matchAll(/(?:src|poster)\s*=\s*["']([^"']+)/gi)) {
            const key = __mxOwnRefKey(item.slug, m[1]);
            if (key && !keys.includes(key)) keys.push(key);
          }
        }
        if (__MX_OWN_IMG.size > 60) __MX_OWN_IMG.clear();
        for (const key of keys.slice(0, __MX_OWN_IMG_MAX)) {
          if (__MX_OWN_IMG.has(key)) continue;
          const rec = await getJSON("mixall-site-images", key);
          if (rec && rec.data && /^image\/(png|jpeg|webp|gif)$/.test(rec.type)) __MX_OWN_IMG.set(key, "data:" + rec.type + ";base64," + rec.data);
        }
      } catch (_) {}
    }
`;

// ---- site-view（/api/site-view と /site-view/<slug> の両方）: 非公開のサイトのページ ----
const PRIVATE_PAGE = String.raw`function __mxPrivatePage(slug) {
      return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>非公開のサイトです</title></head><body style="font-family:sans-serif;background:#111;color:#eee;padding:24px"><h1>非公開のサイトです</h1><p id="status">このサイトは作成者だけが見られます。</p><a href="/" style="color:#9cf">MixAllホームへ</a><script>(async()=>{try{const session=JSON.parse(localStorage.getItem("netrify_session")||"null");if(!session||!session.token)return;const response=await fetch("/api/site-view",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"serve",slug:' + escapeScriptString(slug) + ',token:session.token})});if(!response.ok)return;const page=await response.text();document.open();document.write(page);document.close();}catch(_){}})();</script></body></html>';
    }
    `;
const PRIVATE_CHECK = String.raw`if (site.private === true) {
        const __mxViewer = event.httpMethod === "POST" && payload.action === "serve" ? await getSessionInfo(payload.token) : null;
        if (!__mxViewer || __mxViewer.email !== site.ownerEmail) {
          if (event.httpMethod === "POST") return json(404, { error: "非公開のサイトです" });
          return html(404, __mxPrivatePage(slug));
        }
      }
      `;

// /site-view/<slug>（[[default]].js）の getStore を /api/site-view と同じもの（第2〜第5の Supabase と台帳を読む）にする
let siteViewSource = null;
function tierStore() {
  if (siteViewSource === null) {
    try { siteViewSource = readFileSync(new URL('../../cloud/api/site-view.js', import.meta.url), 'utf8'); } catch (_) { siteViewSource = ''; }
  }
  const start = siteViewSource.indexOf('// ---- 第2〜第5Supabase');
  const end = siteViewSource.indexOf('function connectLambda() {');
  return start >= 0 && end > start && siteViewSource.includes('function getStore(arg) {') ? siteViewSource.slice(start, end) : null;
}

export function apply({ kind, rel, text, patch }) {
  if (kind !== 'cloud') return text;

  if (rel === 'api/lending.js') {
    text = patch(text, 'サイト: 補助関数', 'var { fingerprint, getTargetContent } = require_program_review();', 'var { fingerprint, getTargetContent } = require_program_review();' + LENDING_HELPERS);
    text = patch(text, 'サイト: 文脈(waitUntil)の受け渡し', 'return await handle(event);', 'return await handle(event, __mxCtx);');
    text = patch(text, 'サイト: 文脈(handle引数)', 'exports.handler = async (event) => {', 'exports.handler = async (event, __mxCtx) => {');
    text = patch(text, 'サイト: 文脈(handle引数)', 'async function handle(event) {', 'async function handle(event, __mxCtx) {');
    text = patch(text, 'サイト: 画像配信とOPTIONS', 'if (method === "GET") {',
      'if (method === "OPTIONS") return { statusCode: 204, headers: __MX_CORS, body: "" };\n      if (method === "GET" && qs.image) return await __mxServeImage(qs.image);\n      if (method === "GET") {');
    text = patch(text, 'サイト: 一覧の並列化と状態', 'const keys = await listKeys(STORE_NAMES.LENDING_SITES);',
      'return json(200, { sites: await __mxMySites(email2, event) });\n        const keys = await listKeys(STORE_NAMES.LENDING_SITES);');
    text = patch(text, 'サイト: 画像API', 'const { action } = payload;',
      'const { action } = payload;\n      if (action === "uploadImage" || action === "listImages" || action === "deleteImage") return await __mxImageAction(action, payload, email, event);');
    text = patch(text, 'サイト: HTML上限をバイト数で', 'if (html.length > MAX_HTML_BYTES)', 'if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES)');
    text = patch(text, 'サイト: 公開/非公開の保存', 'site.reviewFingerprint = fingerprint(getTargetContent("site", site));',
      'site.private = typeof payload.private === "boolean" ? payload.private : existing?.private === true;\n        site.reviewFingerprint = fingerprint(getTargetContent("site", site));');
    text = patch(text, 'サイト: 保存時AI審査', 'return json(200, { site: { slug: site.slug, title: site.title, updatedAt: site.updatedAt } });',
      'return await __mxAfterSave(site, event, __mxCtx);');
    text = patch(text, 'サイト: 削除時に画像も削除', 'await deleteKey(STORE_NAMES.LENDING_SITES, slug);',
      'await deleteKey(STORE_NAMES.LENDING_SITES, slug);\n        await __mxDeleteSiteImages(slug).catch(() => {});');
  }

  const reviewFile = rel === 'api/lending.js' ? 'lending' : rel === 'api/scheduled-program-review-background.js' ? '月次' : null;
  if (reviewFile) {
    text = patch(text, `サイト審査(${reviewFile}): 画像の補助`, 'var MODEL = "gemini-3.6-flash";', 'var MODEL = "gemini-3.6-flash";' + REVIEW_HELPERS);
    text = patch(text, `サイト審査(${reviewFile}): 自分の画像は外部扱いしない`,
      'const externalMedia2 = mediaRefs.filter((url) => !(url.startsWith("data:image/") && dataImages.includes(url))).length;',
      'const __mxOwn = __mxOwnFor(item, mediaRefs);\n        const externalMedia2 = mediaRefs.filter((url) => !(url.startsWith("data:image/") && dataImages.includes(url)) && !__mxOwn.refs.has(url)).length;');
    text = patch(text, `サイト審査(${reviewFile}): 自分の画像をAIに渡す`, 'externalMedia: externalMedia2, dataImages };', 'externalMedia: externalMedia2, dataImages: [...dataImages, ...__mxOwn.images] };');
    text = patch(text, `サイト審査(${reviewFile}): 画像の読み込み`, 'if (!item) return { skipped: true, reason: "not_found" };',
      'if (!item) return { skipped: true, reason: "not_found" };\n      if (targetType === "site") await __mxPreloadImages(item);');
  }

  const viewFile = rel === 'api/site-view.js' ? 'api' : rel === 'site-view/[[default]].js' ? 'site-view' : null;
  if (viewFile) {
    text = patch(text, `サイト表示(${viewFile}): 非公開ページ`, 'function isAgeGated(site) {', PRIVATE_PAGE + 'function isAgeGated(site) {');
    text = patch(text, `サイト表示(${viewFile}): 非公開の判定`, 'if (site.programReview?.human?.decision === "block") return html(451,', PRIVATE_CHECK + 'if (site.programReview?.human?.decision === "block") return html(451,');
    text = patch(text, `サイト表示(${viewFile}): 本人は年齢確認なし`, 'if (!canViewAgeReviewed(site, viewer.age))', 'if (viewer.email !== site.ownerEmail && !canViewAgeReviewed(site, viewer.age))');
  }

  if (rel === 'site-view/[[default]].js' && !text.includes('__sb2Row')) {
    text = patch(text, 'サイト表示(site-view): 第2以降のSupabaseの設定',
      "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
      "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);\nimport { SUPABASE2_URL, SUPABASE2_KEY, SUPABASE3_URL, SUPABASE3_KEY, SUPABASE4_URL, SUPABASE4_KEY, SUPABASE5_URL, SUPABASE5_KEY } from '../_lib/config2.js';");
    const replacement = tierStore();
    const start = text.indexOf('function getStore(arg) {');
    const end = text.indexOf('function connectLambda() {');
    if (replacement && start >= 0 && end > start) text = patch(text, 'サイト表示(site-view): 第2以降のSupabaseを読む', text.slice(start, end), replacement);
  }

  if (rel === 'api/lending-data.js') {
    text = patch(text, 'サイトデータ: 公開GETのCORS', 'return await handle(event);',
      'if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400" }, body: "" };\n'
      + '        const __mxRes = await handle(event);\n'
      + '        if (event.httpMethod === "GET" && String((event.queryStringParameters || {}).public) === "1" && __mxRes) __mxRes.headers = { ...(__mxRes.headers || {}), "Access-Control-Allow-Origin": "*" };\n'
      + '        return __mxRes;');
    text = patch(text, 'サイトデータ: 並列化の補助', 'var MAX_ITEMS = 200;',
      'var MAX_ITEMS = 200;\n    async function __mxMapLimit(items, limit, fn) { const out = new Array(items.length); let next = 0; await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } })); return out; }');
    text = patch(text, 'サイトデータ: 一覧の並列化', 'const keys = await listKeys(STORE_NAMES.LENDING_DATA, `${slug}:`);',
      'const keys = await listKeys(STORE_NAMES.LENDING_DATA, `${slug}:`);\n      return (await __mxMapLimit(keys, 12, (storageKey) => getJSON(STORE_NAMES.LENDING_DATA, storageKey))).filter((record) => record && record.slug === slug);');
  }
  return text;
}
