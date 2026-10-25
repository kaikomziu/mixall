import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __commonJS = (cb, mod2) => function __require() {
  try {
    return mod2 || (0, cb[__getOwnPropNames(cb)[0]])((mod2 = { exports: {} }).exports, mod2), mod2.exports;
  } catch (e) {
    throw mod2 = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod2, isNodeMode, target) => (target = mod2 != null ? __create(__getProtoOf(mod2)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod2 || !mod2.__esModule ? __defProp(target, "default", { value: mod2, enumerable: true }) : target,
  mod2
));
var __toCommonJS = (mod2) => __copyProps(__defProp({}, "__esModule", { value: true }), mod2);

// shim/config.js
var SUPABASE_URL, SUPABASE_SECRET_KEY, CRON_SECRET;
var init_config = __esm({
  "shim/config.js"() {
    SUPABASE_URL = "";
    SUPABASE_SECRET_KEY = "";
    CRON_SECRET = "";
  }
});

// shim/blobs.js
var blobs_exports = {};
__export(blobs_exports, {
  connectLambda: () => connectLambda,
  getDeployStore: () => getDeployStore,
  getStore: () => getStore,
  setEnv: () => setEnv
});
function setEnv(env) {
  ENV = env || {};
}
function cfg() {
  const url = (ENV.SUPABASE_URL || typeof process !== "undefined" && process.env.SUPABASE_URL || SUPABASE_URL || "").replace(/\/+$/, "");
  const key = ENV.SUPABASE_SECRET_KEY || ENV.SUPABASE_SERVICE_KEY || typeof process !== "undefined" && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY) || SUPABASE_SECRET_KEY || "";
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SECRET_KEY \u304C\u672A\u8A2D\u5B9A\u3067\u3059(EdgeOne\u306E\u74B0\u5883\u5909\u6570\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044)");
  return { url, key };
}
function headers(extra) {
  const { key } = cfg();
  const h = { apikey: key, "Content-Type": "application/json", ...extra };
  if (key.startsWith("eyJ")) h.Authorization = "Bearer " + key;
  return h;
}
async function rest(path, init = {}) {
  const { url } = cfg();
  const res = await fetch(url + "/rest/v1/" + path, { ...init, headers: headers(init.headers) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase ${res.status}: ${text.slice(0, 300)}`);
  }
  return res;
}
function toBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(bin);
}
function fromBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function encodeValue(value) {
  if (typeof value === "string") return { value, encoding: "text" };
  if (value instanceof ArrayBuffer) return { value: toBase64(new Uint8Array(value)), encoding: "base64" };
  if (ArrayBuffer.isView(value)) return { value: toBase64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)), encoding: "base64" };
  if (typeof Blob !== "undefined" && value instanceof Blob) return { value: toBase64(new Uint8Array(await value.arrayBuffer())), encoding: "base64" };
  return { value: String(value), encoding: "text" };
}
function decodeRow(row, type) {
  if (row.encoding === "gzip64") {
    const text = (typeof require !== "undefined" ? require("zlib") : __require("zlib")).gunzipSync(Buffer.from(row.value, "base64")).toString("utf8");
    if (type === "json") return JSON.parse(text);
    if (type === "arrayBuffer") return new TextEncoder().encode(text).buffer;
    if (type === "blob") return new Blob([text]);
    return text;
  }
  if (row.encoding === "base64") {
    const bytes = fromBase64(row.value);
    if (type === "text") return new TextDecoder().decode(bytes);
    if (type === "json") return JSON.parse(new TextDecoder().decode(bytes));
    if (type === "blob") return new Blob([bytes]);
    return bytes.buffer;
  }
  if (type === "json") return JSON.parse(row.value);
  if (type === "arrayBuffer") return new TextEncoder().encode(row.value).buffer;
  if (type === "blob") return new Blob([row.value]);
  return row.value;
}

// ---- サイト本体(/data)に書き出したデータの読み取り補助 ----
// 書き出し済みデータは暗号化(AES-GCM)され、/data/<store>/<推測できない名前>.json と /data/<store>/_index.json に置かれる。
// Supabaseに無いキーだけ、ここから読む。削除は _deleted ストアに記録して復活を防ぐ。
var __ARCH = { idx: {}, key: null, mac: null };
function __archiveOrigin() {
  return String((ENV && ENV.MIXALL_DATA_URL) || (typeof process !== "undefined" && process.env && process.env.MIXALL_DATA_URL) || "https://mixall-data.edgeone.dev").replace(/\/+$/, "");
}
function __archiveSecret() {
  return String((ENV && ENV.MIXALL_ARCHIVE_SECRET) || (typeof process !== "undefined" && process.env && process.env.MIXALL_ARCHIVE_SECRET) || "");
}
async function __archiveKeys() {
  if (__ARCH.key) return;
  const te = new TextEncoder(), sub = globalThis.crypto.subtle, secret = __archiveSecret();
  const h = await sub.digest("SHA-256", te.encode("mixall-archive-v1:" + secret));
  __ARCH.key = await sub.importKey("raw", h, "AES-GCM", false, ["encrypt", "decrypt"]);
  __ARCH.mac = await sub.importKey("raw", te.encode("mixall-archive-name:" + secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}
async function __archiveName(store, key) {
  await __archiveKeys();
  const sig = await globalThis.crypto.subtle.sign("HMAC", __ARCH.mac, new TextEncoder().encode(store + "\n" + key));
  return Array.from(new Uint8Array(sig)).map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 48);
}
async function __archiveSeal(obj) {
  await __archiveKeys();
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv }, __ARCH.key, new TextEncoder().encode(JSON.stringify(obj)));
  return { v: 1, iv: toBase64(iv), data: toBase64(new Uint8Array(ct)) };
}
async function __archiveOpen(box) {
  try {
    if (!box || !box.iv || !box.data) return null;
    await __archiveKeys();
    const pt = await globalThis.crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(box.iv) }, __ARCH.key, fromBase64(box.data));
    return JSON.parse(new TextDecoder().decode(pt));
  } catch (_) { return null; }
}
async function __archiveJson(path) {
  try {
    const r = await fetch(__archiveOrigin() + path, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    return await r.json();
  } catch (_) { return null; }
}
async function __archiveIndex(store) {
  const c = __ARCH.idx[store];
  if (c && Date.now() - c.at < 60000) return c.keys;
  const j = await __archiveOpen(await __archiveJson("/data/" + encodeURIComponent(store) + "/_index.json"));
  const keys = new Set(Array.isArray(j && j.keys) ? j.keys : []);
  __ARCH.idx[store] = { at: Date.now(), keys };
  return keys;
}
async function __archiveRow(store, key) {
  try {
    if (store === "_deleted") return null;
    const idx = await __archiveIndex(store);
    if (!idx.has(key)) return null;
    const t = await rest(`kv?store=eq._deleted&key=eq.${enc(store + "/" + key)}&select=key&limit=1`);
    if ((await t.json()).length) return null;
    const row = await __archiveOpen(await __archiveJson("/data/" + encodeURIComponent(store) + "/" + await __archiveName(store, key) + ".json"));
    return row && row.key === key && typeof row.value === "string" ? row : null;
  } catch (_) { return null; }
}
async function __archiveTomb(store, key) {
  try {
    if (store === "_deleted") return;
    const idx = await __archiveIndex(store);
    if (!idx.has(key)) return;
    await rest("kv?on_conflict=store,key", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([{ store: "_deleted", key: store + "/" + key, value: "1", encoding: "text", metadata: null, updated_at: new Date().toISOString() }])
    });
  } catch (_) {}
}
async function __archiveMerge(store, prefix, blobs) {
  try {
    if (store === "_deleted") return;
    const idx = await __archiveIndex(store);
    if (!idx.size) return;
    const have = new Set(blobs.map((b) => b.key));
    const dead = new Set();
    const res = await rest(`kv?store=eq._deleted&key=like.${enc(store + "/")}*&select=key`);
    for (const r of await res.json()) dead.add(r.key.slice(store.length + 1));
    const p = String(prefix || "").replace(/\*/g, "");
    for (const k of idx) if (!have.has(k) && !dead.has(k) && (!p || k.startsWith(p))) blobs.push({ key: k, etag: "" });
    blobs.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  } catch (_) {}
}

function getStore(arg) {
  const store = typeof arg === "string" ? arg : arg && arg.name || "default";
  async function fetchRow(key) {
    const res = await rest(`kv?store=eq.${enc(store)}&key=eq.${enc(key)}&select=value,encoding,metadata&limit=1`);
    const rows = await res.json();
    return rows[0] || await __archiveRow(store, key);
  }
  return {
    async get(key, opts = {}) {
      const row = await fetchRow(key);
      return row ? decodeRow(row, opts.type || "text") : null;
    },
    async getWithMetadata(key, opts = {}) {
      const row = await fetchRow(key);
      return row ? { data: decodeRow(row, opts.type || "text"), etag: "", metadata: row.metadata || {} } : null;
    },
    async set(key, value, opts = {}) {
      const { value: v, encoding } = await encodeValue(value);
      await rest("kv?on_conflict=store,key", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify([{ store, key, value: v, encoding, metadata: opts.metadata || null, updated_at: (/* @__PURE__ */ new Date()).toISOString() }])
      });
    },
    async setJSON(key, value, opts = {}) {
      return this.set(key, JSON.stringify(value), opts);
    },
    async delete(key) {
      await rest(`kv?store=eq.${enc(store)}&key=eq.${enc(key)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      await __archiveTomb(store, key);
    },
    async list(opts = {}) {
      const prefix = opts.prefix || "";
      const blobs = [];
      const page = 1e3;
      for (let from = 0; ; from += page) {
        const filter = prefix ? `&key=like.${enc(prefix.replace(/\*/g, ""))}*` : "";
        const res = await rest(`kv?store=eq.${enc(store)}${filter}&select=key&order=key.asc`, {
          headers: { Range: `${from}-${from + page - 1}`, "Range-Unit": "items" }
        });
        const rows = await res.json();
        for (const r of rows) blobs.push({ key: r.key, etag: "" });
        if (rows.length < page) break;
      }
      await __archiveMerge(store, prefix, blobs);
      return { blobs, directories: [] };
    }
  };
}
function connectLambda() {
}
var ENV, enc, getDeployStore;
var init_blobs = __esm({
  "shim/blobs.js"() {
    init_config();
    ENV = {};
    enc = encodeURIComponent;
    getDeployStore = getStore;
  }
});

// src/lib/store.js
var require_store = __commonJS({
  "src/lib/store.js"(exports, module) {
    var { getStore: getStore2 } = (init_blobs(), __toCommonJS(blobs_exports));
    var STORE_NAMES = {
      ACCOUNTS: "netrify-accounts",
      UCH_THREADS: "netrify-uch-threads",
      UCH_BOTS: "netrify-uch-bots",
      UCH_AI_JOBS: "netrify-uch-ai-jobs",
      SESSIONS: "netrify-sessions",
      PRESENCE: "netrify-presence",
      POCKET_ROOMS: "netrify-pocket-rooms",
      MAIL_THREADS: "netrify-mail-threads",
      GHOST_POSTS: "netrify-ghost-posts",
      GHOST_STAMPS: "netrify-stamps",
      GHOST_TAGS: "netrify-ghost-tags",
      GHOST_MODERATION: "netrify-ghost-age-moderation",
      LENDING_SITES: "netrify-lending-sites",
      LENDING_DATA: "netrify-lending-data",
      ADMIN_AUDIT: "netrify-admin-audit",
      SITE_STATE: "netrify-site-state",
      CALLS: "netrify-calls",
      ADMIN_FILES: "netrify-admin-files",
      ADMIN_SECRETS: "netrify-admin-secrets",
      GHOST_ID_REQUESTS: "netrify-ghost-id-requests",
      GHOST_CHATS: "netrify-ghost-chats",
      SESSION_LOGOUTS: "netrify-session-logout-requests",
      ATTACHMENTS: "netrify-attachments",
      CUSTOM_ROOMS: "netrify-custom-rooms",
      CUSTOM_PROJECTS: "netrify-custom-projects",
      CUSTOM_DATA: "netrify-custom-data",
      CUSTOM_SIGNALS: "netrify-custom-signals",
      FILE_CHUNKS: "netrify-file-chunks",
      FILE_MANIFESTS: "netrify-file-manifests",
      STAMPS: "netrify-stamps",
      COINS: "netrify-coins",
      STAMP_OWNERS: "netrify-stamp-owners",
      NOTIFICATION_SETTINGS: "netrify-notification-settings",
      NOTIFICATIONS: "netrify-notifications",
      COIN_EARNING_SITES: "netrify-coin-earning-sites",
      WEBHOOKS: "netrify-webhooks",
      LANGUAGES: "netrify-languages",
      CALENDARS: "netrify-calendars",
      OFFICIAL_ACCOUNTS: "netrify-official-accounts",
      GEMINI_MEMORIES: "netrify-gemini-memories",
      SEARCH_HISTORY: "netrify-search-history",
      TOOL_DATA: "netrify-tools-data",
      MESSAGE_FILTER_SETTINGS: "netrify-message-filter-settings",
      MESSAGE_FILTER_CACHE: "netrify-message-filter-cache",
      ANON_BOXES: "netrify-anon-boxes",
      TEMP_ROOMS: "netrify-temporary-rooms",
      TEMP_SHARES: "netrify-temporary-shares",
      WIKI: "netrify-wiki-pages",
      EXTENSIONS: "netrify-extensions",
      EXTENSION_DATA: "netrify-extension-data",
      AI_JOBS: "netrify-ai-background-jobs",
      ACCOUNT_RECOVERY: "netrify-account-recovery"
    };
    function store(name) {
      return getStore2({ name });
    }
    async function getJSON(storeName, key) {
      const val = await store(storeName).get(key, { type: "json" });
      return val === void 0 ? null : val;
    }
    async function setJSON(storeName, key, value) {
      await store(storeName).setJSON(key, value);
    }
    async function deleteKey(storeName, key) {
      await store(storeName).delete(key);
    }
    async function listKeys(storeName, prefix) {
      const result = await store(storeName).list(prefix ? { prefix } : void 0);
      return result.blobs.map((blob) => blob.key);
    }
    async function putChunkedText(storeName, fileId, text, meta = {}) {
      const raw = String(text || "");
      const chunkSize = Math.max(64 * 1024, Number(process.env.BLOBS_CHUNK_SIZE_BYTES || 512 * 1024));
      const total = Math.max(1, Math.ceil(Buffer.byteLength(raw, "utf8") / chunkSize));
      const chunks = [];
      let offset = 0;
      for (let index = 0; offset < raw.length || index === 0; index += 1) {
        const chunk = raw.slice(offset, offset + chunkSize);
        chunks.push({ index, bytes: Buffer.byteLength(chunk, "utf8") });
        await setJSON(storeName, `chunk:${fileId}:${String(index).padStart(8, "0")}`, { fileId, index, data: chunk });
        offset += chunk.length;
        if (offset >= raw.length) break;
      }
      await setJSON(storeName, `meta:${fileId}`, { fileId, totalChunks: chunks.length, bytes: Buffer.byteLength(raw, "utf8"), ...meta, createdAt: (/* @__PURE__ */ new Date()).toISOString() });
      return { fileId, totalChunks: chunks.length, bytes: Buffer.byteLength(raw, "utf8") };
    }
    async function getChunkedText(storeName, fileId) {
      const meta = await getJSON(storeName, `meta:${fileId}`);
      if (!meta) return null;
      const chunks = [];
      for (let index = 0; index < Number(meta.totalChunks || 0); index += 1) {
        const item = await getJSON(storeName, `chunk:${fileId}:${String(index).padStart(8, "0")}`);
        if (!item) return null;
        chunks.push(item.data || "");
      }
      return { ...meta, data: chunks.join("") };
    }
    async function deleteChunked(storeName, fileId) {
      const meta = await getJSON(storeName, `meta:${fileId}`);
      if (meta) for (let index = 0; index < Number(meta.totalChunks || 0); index += 1) await deleteKey(storeName, `chunk:${fileId}:${String(index).padStart(8, "0")}`);
      await deleteKey(storeName, `meta:${fileId}`);
    }
    module.exports = { STORE_NAMES, getJSON, setJSON, deleteKey, listKeys, putChunkedText, getChunkedText, deleteChunked };
  }
});

// src/functions/ogp-post.js
var require_ogp_post = __commonJS({
  "src/functions/ogp-post.js"(exports) {
    var { connectLambda: connectLambda2 } = (init_blobs(), __toCommonJS(blobs_exports));
    var { STORE_NAMES, getJSON } = require_store();
    function esc(value) {
      return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
    }
    function baseUrl() {
      const value = process.env.URL || process.env.DEPLOY_PRIME_URL || "https://mixalls.edgeone.dev";
      return String(value).replace(/\/$/, "");
    }
    exports.handler = async (event) => {
      connectLambda2(event);
      const id = String(event.queryStringParameters?.id || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
      if (!id) return { statusCode: 400, headers: { "Content-Type": "text/plain; charset=utf-8" }, body: "\u6295\u7A3FID\u304C\u3042\u308A\u307E\u305B\u3093" };
      let post = null;
      try { post = await getJSON(STORE_NAMES.GHOST_POSTS, id); } catch (_) { post = null; }
      if (!post || post.deleted) return { statusCode: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }, body: `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>Ghost - MixAll</title></head><body><script>location.replace(${JSON.stringify("/Ghost/post.html?id=" + id)});</script></body></html>` };
      const base = baseUrl();
      const canonical = `${base}/ghost/post/${encodeURIComponent(id)}`;
      const fallback = `${base}/ogp/04-ghost-post.jpg?v=20261019-2`;
      const media = Array.isArray(post.media) ? post.media : [];
      let image = fallback;
      const reviewStatus = post.ageReview?.status;
      const reviewOk = reviewStatus !== "signature_hold" && reviewStatus !== "blocked" && !(post.ageReview?.categories || []).some((c) => ["sexual", "other", "inm"].includes(c));
      let imgMeta = "";
      if (reviewOk && media.some((item) => ["image", "imageBlob", "imageUrl"].includes(item.kind))) {
        let ogpRow = null;
        try { ogpRow = await getJSON(STORE_NAMES.GHOST_POSTS, `media:ogp:${id}`); } catch (_) { ogpRow = null; }
        const hasOgp = !!(ogpRow && ogpRow.data);
        const ver = hasOgp ? String(post.ogpAt || "1") : "src" + String(post.createdAt || post.updatedAt || "1");
        image = `${base}/api/ghost?ogp=${encodeURIComponent(id)}&v=${encodeURIComponent(ver.replace(/[^0-9A-Za-z]/g, "").slice(0, 24))}`;
        if (hasOgp) imgMeta = '<meta property="og:image:type" content="image/jpeg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">';
      } else imgMeta = '<meta property="og:image:type" content="image/jpeg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">';
      const title = String(post.title || post.authorName || "Ghost\u6295\u7A3F").slice(0, 160);
      const description = String(post.description || post.text || "MixAll Ghost\u306E\u6295\u7A3F").replace(/\s+/g, " ").slice(0, 300);
      const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${esc(title)} - MixAll</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${esc(canonical)}"><meta property="og:type" content="article"><meta property="og:site_name" content="MixAll"><meta property="og:locale" content="ja_JP"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(canonical)}"><meta property="og:image" content="${esc(image)}"><meta property="og:image:secure_url" content="${esc(image)}">${imgMeta}<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${esc(image)}"></head><body><p><a href="${esc(canonical)}">${esc(title)}</a></p><script>location.replace(${JSON.stringify(`/Ghost/post.html?id=${id}`)});</script></body></html>`;
      return { statusCode: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=60, s-maxage=300" }, body: html };
    };
  }
});

// entries/[id]-2g8g2.mjs
var import_ogp_post = __toESM(require_ogp_post(), 1);

// shim/compat.js
init_blobs();
init_config();
function wrap(handler2, opts = {}) {
  return async function onRequest2(context) {
    const env = context.env || {};
    setEnv(env);
    for (const [k, v] of Object.entries(env)) if (process.env[k] === void 0) process.env[k] = String(v);
    if (!process.env.CRON_SECRET) process.env.CRON_SECRET = CRON_SECRET;
    const req = context.request;
    const url = new URL(req.url);
    const headers2 = {};
    req.headers.forEach((v, k) => {
      headers2[k.toLowerCase()] = v;
    });
    if (context.clientIp) headers2["x-nf-client-connection-ip"] = context.clientIp;
    if (opts.cron) {
      const expected = env.CRON_SECRET || CRON_SECRET;
      if (headers2["x-cron-secret"] !== expected) {
        return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
      }
    }
    const query = {};
    const multi = {};
    url.searchParams.forEach((v, k) => {
      query[k] = v;
      (multi[k] ||= []).push(v);
    });
    if (opts.extraQuery) Object.assign(query, opts.extraQuery(context));
    const hasBody = !["GET", "HEAD"].includes(req.method);
    const rawBody = hasBody ? Buffer.from(await req.arrayBuffer()) : null;
    const ct = String(headers2["content-type"] || "");
    const binary = rawBody && !/(json|text|xml|x-www-form-urlencoded|javascript)/i.test(ct) && rawBody.length > 0;
    const event = {
      httpMethod: req.method,
      path: url.pathname,
      rawUrl: req.url,
      rawQuery: url.search.slice(1),
      headers: headers2,
      queryStringParameters: query,
      multiValueQueryStringParameters: multi,
      body: rawBody ? binary ? rawBody.toString("base64") : rawBody.toString("utf8") : null,
      isBase64Encoded: Boolean(binary)
    };
    let result;
    try {
      result = await handler2(event, { ...context, clientContext: {} });
    } catch (e) {
      console.error("function error:", e && e.stack || e);
      return new Response(JSON.stringify({ error: "\u30B5\u30FC\u30D0\u30FC\u30A8\u30E9\u30FC: " + String(e && e.message || e).slice(0, 200) }), {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    }
    if (result instanceof Response) return result;
    const { statusCode = 200, headers: h = {}, multiValueHeaders = {}, body = "", isBase64Encoded = false } = result || {};
    const out = new Headers();
    for (const [k, v] of Object.entries(h)) if (v !== void 0 && v !== null) out.set(k, String(v));
    for (const [k, vals] of Object.entries(multiValueHeaders)) for (const v of vals) out.append(k, v);
    const payload = isBase64Encoded ? Buffer.from(body, "base64") : body;
    return new Response([204, 304].includes(statusCode) ? null : payload, { status: statusCode, headers: out });
  };
}

// entries/[id]-2g8g2.mjs
var handler = import_ogp_post.default.handler || import_ogp_post.default.default && import_ogp_post.default.default.handler;
var __onRequest = wrap(handler, { extraQuery: (c) => ({ id: c.params.id }) });

export async function onRequest(context) {
  return __onRequest(context);
}
