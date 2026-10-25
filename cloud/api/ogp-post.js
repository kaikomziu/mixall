import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);
import { SUPABASE2_URL, SUPABASE2_KEY, SUPABASE3_URL, SUPABASE3_KEY, SUPABASE4_URL, SUPABASE4_KEY, SUPABASE5_URL, SUPABASE5_KEY } from '../_lib/config2.js';
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


// ---- 第2〜第5Supabase(直列つなぎ) + 保管場所の台帳: 第1が満杯に近づいたら新規データを第2へ、第2も満杯なら第3へ…。
// 「どのキーがどこにあるか」を第1の専用ストア(_route)に記録し、読み・一覧・削除は台帳を見て目的の場所へ直接行く(順番に探さない)。 ----
var __SB2 = { full: false, at: 0 };
var __SBT = {};
function __sbTiers() {
  const e = (typeof ENV !== "undefined" && ENV) || {};
  const pe = (typeof process !== "undefined" && process.env) || {};
  const out = [];
  const dflt = { 2: [SUPABASE2_URL, SUPABASE2_KEY], 3: [SUPABASE3_URL, SUPABASE3_KEY], 4: [SUPABASE4_URL, SUPABASE4_KEY], 5: [SUPABASE5_URL, SUPABASE5_KEY] };
  for (const n of [2, 3, 4, 5]) {
    const url = String(e["SUPABASE" + n + "_URL"] || pe["SUPABASE" + n + "_URL"] || dflt[n][0] || "").replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
    const key = String(e["SUPABASE" + n + "_KEY"] || pe["SUPABASE" + n + "_KEY"] || dflt[n][1] || "");
    if (url && key) out.push({ n, url, key });
  }
  return out;
}
function __sb2Cfg() { return __sbTiers().length > 0; }
async function __tRest(t, path, init = {}) {
  const h = { apikey: t.key, "Content-Type": "application/json", ...(init.headers || {}) };
  if (t.key.startsWith("eyJ")) h.Authorization = "Bearer " + t.key;
  const res = await fetch(t.url + "/rest/v1/" + path, { ...init, headers: h, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error("Supabase" + t.n + " " + res.status + ": " + (await res.text().catch(() => "")).slice(0, 200));
  return res;
}
function __dbLimits() {
  const e = (typeof ENV !== "undefined" && ENV) || {};
  const pe = (typeof process !== "undefined" && process.env) || {};
  return { limit: (Number(e.SUPABASE_DB_LIMIT_MB || pe.SUPABASE_DB_LIMIT_MB) || 500) * 1048576, ratio: Number(e.SUPABASE_FULL_RATIO || pe.SUPABASE_FULL_RATIO) || 0.9 };
}
async function __usageFull(url, key) {
  const { limit, ratio } = __dbLimits();
  const h = { apikey: key, "Content-Type": "application/json" };
  if (key.startsWith("eyJ")) h.Authorization = "Bearer " + key;
  const r = await fetch(url + "/rest/v1/rpc/mixall_db_usage", { method: "POST", headers: h, body: "{}", signal: AbortSignal.timeout(5000) });
  if (!r.ok) return null;
  return Number((await r.json()).db_bytes) > limit * ratio;
}
async function __sb2Full() {
  if (Date.now() - __SB2.at < 60000) return __SB2.full;
  let full = __SB2.full;
  try { const { url, key } = cfg(); const f = await __usageFull(url, key); if (f !== null) full = f; } catch (_) {}
  __SB2.full = full; __SB2.at = Date.now();
  return full;
}
async function __tFull(t) {
  const s = (__SBT[t.n] ||= { full: false, at: 0, bad: 0 });
  if (Date.now() - s.at < 60000) return s.full;
  try { const f = await __usageFull(t.url, t.key); if (f !== null) s.full = f; } catch (_) {}
  s.at = Date.now();
  return s.full;
}
var __RT = new Map();
var __RTS = { ready: null, at: 0, tried: 0, busy: null };
const __rtk = (store, key) => store + "|" + key;
const __rtSkip = (store) => store === "_deleted" || store === "_route";
async function __rtGet(store, key) {
  const k = __rtk(store, key), c = __RT.get(k);
  if (c && c.exp > Date.now()) return c.n;
  let n = null;
  try { const r = await rest(`kv?store=eq._route&key=eq.${enc(k)}&select=value&limit=1`); const row = (await r.json())[0]; if (row) n = Number(row.value) || null; } catch (_) {}
  if (__RT.size > 5000) __RT.clear();
  __RT.set(k, { n, exp: Date.now() + (n ? 600000 : 30000) });
  return n;
}
async function __rtSet(store, key, n) {
  __RT.set(__rtk(store, key), { n, exp: Date.now() + 600000 });
  try { await rest("kv?on_conflict=store,key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([{ store: "_route", key: __rtk(store, key), value: String(n), encoding: "text", metadata: null, updated_at: (/* @__PURE__ */ new Date()).toISOString() }]) }); }
  catch (_) { __rtUnready(); }
}
async function __rtDel(store, key) {
  __RT.set(__rtk(store, key), { n: null, exp: Date.now() + 30000 });
  try { await rest(`kv?store=eq._route&key=eq.${enc(__rtk(store, key))}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }); } catch (_) {}
}
function __rtUnready() { __RTS.ready = false; __RTS.at = Date.now(); try { rest("kv?store=eq._route&key=eq.__ready", { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {}); } catch (_) {} }
// 既存データの台帳づくり: 各場所の全キーを一度だけ読み、台帳に登録してから「準備完了」の印をつける
async function __rtBackfill() {
  const tiers = __sbTiers();
  for (const t of tiers) {
    for (let from = 0; ; from += 1000) {
      let rows;
      try { const r = await __tRest(t, "kv?select=store,key&order=store.asc,key.asc", { headers: { Range: `${from}-${from + 999}`, "Range-Unit": "items" } }); rows = await r.json(); }
      catch (err) { if (/Supabase\d 404/.test(String(err && err.message)) && from === 0) break; throw err; } // テーブル未作成=空とみなす
      const batch = rows.filter((x) => !__rtSkip(x.store)).map((x) => ({ store: "_route", key: __rtk(x.store, x.key), value: String(t.n), encoding: "text", metadata: null, updated_at: (/* @__PURE__ */ new Date()).toISOString() }));
      for (let i = 0; i < batch.length; i += 300) await rest("kv?on_conflict=store,key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(batch.slice(i, i + 300)) });
      if (rows.length < 1000) break;
    }
  }
  await rest("kv?on_conflict=store,key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([{ store: "_route", key: "__ready", value: "1", encoding: "text", metadata: null, updated_at: (/* @__PURE__ */ new Date()).toISOString() }]) });
}
async function __rtReady() {
  if (!__sbTiers().length) return false;
  if (__RTS.ready === true) return true;
  if (__RTS.ready === false && Date.now() - __RTS.at < 60000) return false;
  if (__RTS.busy) return __RTS.busy;
  __RTS.busy = (async () => {
    try {
      const r = await rest("kv?store=eq._route&key=eq.__ready&select=key&limit=1");
      if (!(await r.json()).length) await __rtBackfill();
      __RTS.ready = true;
    } catch (_) { __RTS.ready = false; }
    __RTS.at = Date.now(); __RTS.busy = null;
    return __RTS.ready;
  })();
  return __RTS.busy;
}
async function __restSet(store, key, path, init) {
  const tiers = __sbTiers();
  if (__rtSkip(store) || !tiers.length) return rest(path, init);
  let toB = await __sb2Full();
  if (toB) {
    try { const r = await rest(`kv?store=eq.${enc(store)}&key=eq.${enc(key)}&select=key&limit=1`); if ((await r.json()).length) toB = false; } catch (_) {}
  }
  if (!toB) {
    try { return await rest(path, init); } catch (err) {
      if (!/read-only|disk|quota|space|full|exceed|507/i.test(String(err && err.message))) throw err;
      __SB2.full = true; __SB2.at = Date.now();
    }
  }
  // 溢れた分の置き場: すでにそのキーがあるところ → 空いている第2 → 第3 → (満杯でも)最後の手段
  const live = tiers.filter((t) => !((__SBT[t.n] || {}).bad > Date.now()));
  const order = [];
  const ready = await __rtReady(); // 台帳が未完成なら先に作る
  const known = await __rtGet(store, key); // 台帳にあればその場所を最優先
  const kt = known && live.find((t) => t.n === known); if (kt) order.push(kt);
  else if (!ready) { for (const t of live) { try { const r = await __tRest(t, `kv?store=eq.${enc(store)}&key=eq.${enc(key)}&select=key&limit=1`); if ((await r.json()).length) { order.push(t); break; } } catch (_) {} } }
  const free = [], fullOnes = [];
  for (const t of live) { if (order.includes(t)) continue; ((await __tFull(t)) ? fullOnes : free).push(t); }
  for (const t of [...order, ...free, ...fullOnes]) {
    try { const res = await __tRest(t, path, init); await __rtSet(store, key, t.n); return res; } catch (_) { (__SBT[t.n] ||= { full: false, at: 0, bad: 0 }).bad = Date.now() + 5 * 60000; } // テーブル未作成などで書けないときは次へ
  }
  return rest(path, init); // どこにも書けなければ第1(止めない)
}
async function __sb2Row(store, key) {
  if (__rtSkip(store)) return null;
  const tiers = __sbTiers(); if (!tiers.length) return null;
  const q = `kv?store=eq.${enc(store)}&key=eq.${enc(key)}&select=value,encoding,metadata&limit=1`;
  const ready = await __rtReady(); // 台帳が未完成なら先に作る(既存データも登録される)
  const n = await __rtGet(store, key);
  if (n) { const t = tiers.find((x) => x.n === n); if (t) { try { const row = (await (await __tRest(t, q)).json())[0]; if (row) return row; } catch (_) {} } }
  if (ready) return null; // 台帳が完成していて載っていない=どこにも無い(探し回らない)
  for (const t of tiers) { try { const row = (await (await __tRest(t, q)).json())[0]; if (row) { __rtSet(store, key, t.n); return row; } } catch (_) {} }
  return null;
}
async function __sb2Delete(store, key) {
  if (__rtSkip(store)) return;
  const tiers = __sbTiers(); if (!tiers.length) return;
  const ready = await __rtReady();
  const n = await __rtGet(store, key);
  const targets = n ? tiers.filter((t) => t.n === n) : ready ? [] : tiers;
  for (const t of targets) { try { await __tRest(t, `kv?store=eq.${enc(store)}&key=eq.${enc(key)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }); } catch (_) {} }
  if (n) await __rtDel(store, key);
}
async function __sb2Merge(store, prefix, blobs) {
  if (__rtSkip(store) || !__sbTiers().length) return;
  const have = new Set(blobs.map((b) => b.key));
  if (await __rtReady()) { // 台帳から一覧(各場所を回らない)
    try {
      const p = __rtk(store, String(prefix || "").replace(/\*/g, ""));
      for (let from = 0; ; from += 1000) {
        const r = await rest(`kv?store=eq._route&key=like.${enc(p)}*&select=key&order=key.asc`, { headers: { Range: `${from}-${from + 999}`, "Range-Unit": "items" } });
        const rows = await r.json();
        for (const x of rows) { const k = x.key.slice(store.length + 1); if (!have.has(k)) { blobs.push({ key: k, etag: "" }); have.add(k); } }
        if (rows.length < 1000) break;
      }
      blobs.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
      return;
    } catch (_) {}
  }
  const filter = prefix ? `&key=like.${enc(String(prefix).replace(/\*/g, ""))}*` : "";
  for (const t of __sbTiers()) {
    try {
      for (let from = 0; ; from += 1000) {
        const r = await __tRest(t, `kv?store=eq.${enc(store)}${filter}&select=key&order=key.asc`, { headers: { Range: `${from}-${from + 999}`, "Range-Unit": "items" } });
        const rows = await r.json();
        for (const x of rows) if (!have.has(x.key)) { blobs.push({ key: x.key, etag: "" }); have.add(x.key); }
        if (rows.length < 1000) break;
      }
    } catch (_) {}
  }
  blobs.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

function getStore(arg) {
  const store = typeof arg === "string" ? arg : arg && arg.name || "default";
  async function fetchRow(key) {
    const res = await rest(`kv?store=eq.${enc(store)}&key=eq.${enc(key)}&select=value,encoding,metadata&limit=1`);
    const rows = await res.json();
    return rows[0] || await __sb2Row(store, key) || await __archiveRow(store, key);
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
      await __restSet(store, key, "kv?on_conflict=store,key", {
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
      await __sb2Delete(store, key);
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
      await __sb2Merge(store, prefix, blobs);
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

// entries/ogp-post-aozmw.mjs
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

// entries/ogp-post-aozmw.mjs
var handler = import_ogp_post.default.handler || import_ogp_post.default.default && import_ogp_post.default.default.handler;
var __onRequest = wrap(handler, {});

export async function onRequest(context) {
  return __onRequest(context);
}
