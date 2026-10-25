import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);
import nodeCrypto from 'node:crypto';
import { SUPABASE2_URL, SUPABASE2_KEY, SUPABASE3_URL, SUPABASE3_KEY, SUPABASE4_URL, SUPABASE4_KEY, SUPABASE5_URL, SUPABASE5_KEY } from '../_lib/config2.js';
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __commonJS = (cb, mod2) => function __require2() {
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

// src/lib/ghost-age.js
var require_ghost_age = __commonJS({
  "src/lib/ghost-age.js"(exports, module) {
    var AGE_CATEGORIES = /* @__PURE__ */ new Set(["inm", "sexual", "other"]);
    var BIRTH_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
    var AGE_TIME_ZONE = "Asia/Tokyo";
    function parseBirthDate(value) {
      const match = String(value || "").match(BIRTH_DATE_PATTERN);
      if (!match) return null;
      const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
      const date = new Date(Date.UTC(year, month - 1, day));
      if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
      return { year, month, day };
    }
    function datePartsInTokyo(now = /* @__PURE__ */ new Date()) {
      const parts = new Intl.DateTimeFormat("en-CA", { timeZone: AGE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
      const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
      return { year: values.year, month: values.month, day: values.day };
    }
    function getAgeFromBirthDate(value, now = /* @__PURE__ */ new Date()) {
      const birth = parseBirthDate(value);
      if (!birth) return null;
      const today = datePartsInTokyo(now);
      let age = today.year - birth.year;
      if (today.month < birth.month || today.month === birth.month && today.day < birth.day) age -= 1;
      return age >= 0 && age <= 120 ? age : null;
    }
    function isValidBirthDate(value, now = /* @__PURE__ */ new Date()) {
      return getAgeFromBirthDate(value, now) !== null;
    }
    function isValidAge(value) {
      if (value === null || value === void 0 || String(value).trim() === "") return false;
      const age = Number(value);
      return Number.isInteger(age) && age >= 0 && age <= 120;
    }
    function normalizedCategories(review) {
      const source = Array.isArray(review?.categories) ? review.categories : [];
      return new Set(source.filter((category) => AGE_CATEGORIES.has(category)));
    }
    function canViewAgeReviewed(item, age) {
      if (!isValidAge(age)) return false;
      if (age >= 13) return true;
      const review = item?.ageReview;
      if (!review || review.status !== "reviewed") return false;
      const categories = normalizedCategories(review);
      if (categories.has("sexual") || categories.has("other")) return false;
      if (age < 10 && categories.has("inm")) return false;
      return true;
    }
    function visibleComments(comments, age) {
      return (Array.isArray(comments) ? comments : []).filter((comment) => canViewAgeReviewed(comment, age));
    }
    module.exports = { AGE_CATEGORIES, parseBirthDate, getAgeFromBirthDate, isValidBirthDate, isValidAge, canViewAgeReviewed, visibleComments };
  }
});

// src/lib/session.js
var require_session = __commonJS({
  "src/lib/session.js"(exports, module) {
    var crypto = __require("crypto");
    function stablePeerId(email) {
      return "mixall-" + crypto.createHash("sha256").update(String(email)).digest("hex").slice(0, 24);
    }
    function stableUchId(email, createdAt) {
      return "u" + crypto.createHmac("sha256", process.env.UCH_ID_SECRET || "mixall-uch-id-v1").update(`${String(email)}|${String(createdAt || "")}`).digest("hex").slice(0, 10);
    }
    var { STORE_NAMES, getJSON, setJSON, deleteKey } = require_store();
    var { getAgeFromBirthDate } = require_ghost_age();
    function tokenFingerprint(token) {
      return crypto.createHash("sha256").update(String(token)).digest("hex");
    }
    async function getSessionInfo(token) {
      if (!token) return null;
      const session = await getJSON(STORE_NAMES.SESSIONS, token);
      if (!session || session.expiresAt < Date.now()) return null;
      const logoutRequest = session.sessionId ? await getJSON(STORE_NAMES.SESSION_LOGOUTS, `logout:${session.sessionId}`) : null;
      if (logoutRequest && logoutRequest.status === "pending") {
        logoutRequest.status = "executed";
        logoutRequest.executedAt = (/* @__PURE__ */ new Date()).toISOString();
        await setJSON(STORE_NAMES.SESSION_LOGOUTS, `logout:${session.sessionId}`, logoutRequest);
        await setJSON(STORE_NAMES.SESSION_LOGOUTS, `notice:${tokenFingerprint(token)}`, { reason: "admin_logout", message: "\u904B\u55B6\u306B\u3088\u308A\u30ED\u30B0\u30A2\u30A6\u30C8\u3055\u305B\u3089\u308C\u307E\u3057\u305F\u3002", createdAt: logoutRequest.executedAt, expiresAt: Date.now() + 10 * 60 * 1e3 });
        await deleteKey(STORE_NAMES.SESSIONS, token);
        return null;
      }
      const account = await getJSON(STORE_NAMES.ACCOUNTS, session.email);
      if (!account) return null;
      const age = getAgeFromBirthDate(account.birthDate);
      if (age === null) return null;
      if (account.age !== age) {
        account.age = age;
        await setJSON(STORE_NAMES.ACCOUNTS, session.email, account);
      }
      const now = Date.now();
      session.lastSeenAt = now;
      await setJSON(STORE_NAMES.SESSIONS, token, session);
      await setJSON(STORE_NAMES.PRESENCE, session.email, { email: session.email, lastSeenAt: now });
      return {
        email: session.email,
        displayName: account.displayName || session.email.split("@")[0],
        age,
        avatarUrl: account.avatarDataUrl || null,
        avatarType: account.avatarType || null,
        avatarCrop: account.avatarCrop || null,
        uchName: account.uchName || account.displayName || session.email.split("@")[0],
        uchId: stableUchId(session.email, account.createdAt),
        isAdmin: account.isAdmin === true,
        isDeputyAdmin: account.isDeputyAdmin === true,
        isOperator: account.isAdmin === true || account.isDeputyAdmin === true,
        isOfficial: account.isOfficial === true || account.isAdmin === true,
        peerId: stablePeerId(session.email)
      };
    }
    async function requireSession(token) {
      const info = await getSessionInfo(token);
      return info ? info.email : null;
    }
    async function requireAdmin(token) {
      const info = await getSessionInfo(token);
      return info && info.isOperator ? info : null;
    }
    async function getAccountProfile(email) {
      const normalized = String(email || "").trim().toLowerCase();
      if (!normalized) return { email: normalized, displayName: normalized, isAdmin: false, isOfficial: false };
      const account = await getJSON(STORE_NAMES.ACCOUNTS, normalized);
      const presence = await getJSON(STORE_NAMES.PRESENCE, normalized);
      return {
        email: normalized,
        displayName: account && account.displayName ? account.displayName : normalized.split("@")[0],
        avatarUrl: account?.avatarDataUrl || null,
        avatarType: account?.avatarType || null,
        avatarCrop: account?.avatarCrop || null,
        uchName: account && (account.uchName || account.displayName) ? account.uchName || account.displayName : normalized.split("@")[0],
        uchId: stableUchId(normalized, account?.createdAt),
        isAdmin: Boolean(account && account.isAdmin === true),
        isDeputyAdmin: Boolean(account && account.isDeputyAdmin === true),
        isOperator: Boolean(account && (account.isAdmin === true || account.isDeputyAdmin === true)),
        isOfficial: Boolean(account && (account.isOfficial === true || account.isAdmin === true)),
        createdAt: account ? account.createdAt : null,
        online: Boolean(presence && Number(presence.lastSeenAt) > Date.now() - 90 * 1e3),
        lastSeenAt: presence ? presence.lastSeenAt : null,
        peerId: stablePeerId(normalized)
      };
    }
    module.exports = { getSessionInfo, getAccountProfile, requireSession, requireAdmin };
  }
});

// src/lib/gemini.js
var require_gemini = __commonJS({
  "src/lib/gemini.js"(exports, module) {
    var crypto = __require("crypto");
    var { STORE_NAMES, getJSON, listKeys } = require_store();
    function newId() {
      return crypto.randomBytes(8).toString("hex");
    }
    async function getGeminiKeyRecords() {
      const configured = await getJSON(STORE_NAMES.ADMIN_SECRETS, "gemini:apiKeys");
      const legacy = await getJSON(STORE_NAMES.ADMIN_SECRETS, "gemini:apiKey");
      const rows = [];
      if (process.env.GEMINI_API_KEY) rows.push({ id: "env", apiKey: process.env.GEMINI_API_KEY, enabled: true, order: -100 });
      const stored = Array.isArray(configured) ? configured : Array.isArray(configured?.keys) ? configured.keys : configured?.apiKey ? [configured] : [];
      for (const row of stored) {
        const apiKey = String(row?.apiKey || "").trim();
        if (apiKey && row.enabled !== false) rows.push({ id: String(row.id || newId()), apiKey, enabled: true, order: Number(row.order) || 0 });
      }
      if (!stored.length && legacy?.apiKey) rows.push({ id: "legacy", apiKey: String(legacy.apiKey), enabled: true, order: 0 });
      return rows.sort((a, b) => a.order - b.order);
    }
    async function getGeminiRuntimeSettings() {
      const saved = await getJSON(STORE_NAMES.ADMIN_SECRETS, "gemini:runtimeSettings") || {};
      const roster = [];
      try {
        for (const key of await listKeys(STORE_NAMES.ACCOUNTS)) {
          const account = await getJSON(STORE_NAMES.ACCOUNTS, key);
          if (!account || !account.isAdmin && !account.isDeputyAdmin && !account.isOperator) continue;
          const role = account.isAdmin ? "\u4E3B\u904B\u55B6" : account.isDeputyAdmin ? "\u526F\u904B\u55B6" : "\u904B\u55B6";
          roster.push(`${account.displayName || account.email || key} (${account.email || key}): ${role}`);
        }
      } catch (_) {
      }
      const rosterPrompt = roster.length ? `

\u73FE\u5728\u306EMixAll\u904B\u55B6\u533A\u5206\uFF08\u30E6\u30FC\u30B6\u30FC\u306B\u516C\u958B\u3055\u308C\u308B\u7BC4\u56F2\u306E\u60C5\u5831\uFF09:
${roster.join("\n")}` : "";
      return { fixedPrompt: "", allowUserReply: true, allowGeminiReply: true, readUch: true, readGhost: true, ...saved, fixedPrompt: `${String(saved.fixedPrompt || "")}${rosterPrompt}` };
    }
    var DEFAULT_RELAY_URL = "https://gemrelay-9gqxhwdt.manus.space";
    function relayUrl() {
      return String(process.env.GEMINI_RELAY_URL || DEFAULT_RELAY_URL).trim().replace(/\/$/, "");
    }
    async function callGeminiRelay({ body, timeoutMs = 25e3 }) {
      const token = String(process.env.GEMRELAY_SHARED_TOKEN || process.env.MANUS_GEMINI_RELAY_TOKEN || "").trim();
      if (!token) return { ok: false, status: 0, data: {}, error: "GemRelay\u8A8D\u8A3C\u30C8\u30FC\u30AF\u30F3\u304C\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093" };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(`${relayUrl()}/api/gemini`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          signal: controller.signal,
          body: JSON.stringify(body)
        });
        const raw = await response.text();
        let data = {};
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch (_) {
        }
        if (response.ok && Array.isArray(data.candidates)) return { ok: true, status: response.status, data, keyId: "manus-relay" };
        return { ok: false, status: response.status || 503, data, error: data.error?.message || data.error || `GemRelay\u30A8\u30E9\u30FC (${response.status})` };
      } catch (error) {
        return { ok: false, status: 503, data: {}, error: error.name === "AbortError" ? "GemRelay\u30BF\u30A4\u30E0\u30A2\u30A6\u30C8" : "GemRelay\u30CD\u30C3\u30C8\u30EF\u30FC\u30AF\u30A8\u30E9\u30FC" };
      } finally {
        clearTimeout(timeout);
      }
    }
    async function callGemini({ model, body, timeoutMs = 25e3 }) {
      const __first = String(model || "").replace(/^models\//, "");
      const __candidates = Array.from(new Set([__first, "gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.5-flash"].filter((m) => m && !/^gemini-(1\.5|2\.0|2\.5)/.test(m))));
      let __last = null;
      for (const m of __candidates) {
        __last = await callGeminiOnce({ model: m, body, timeoutMs });
        if (__last.ok || !/404/.test(String(__last.error || ""))) return __last;
      }
      return __last;
    }
    async function callGeminiOnce({ model, body, timeoutMs = 25e3 }) {
      const keys = await getGeminiKeyRecords();
      if (!keys.length) return callGeminiRelay({ body, timeoutMs });
      const failures = [];
      for (const entry of keys) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "X-goog-api-key": entry.apiKey }, signal: controller.signal, body: JSON.stringify(body) });
          const raw = await response.text();
          let data = {};
          try {
            data = raw ? JSON.parse(raw) : {};
          } catch {
            data = {};
          }
          if (response.ok) return { ok: true, status: response.status, data, keyId: entry.id };
          failures.push(`${response.status}`);
        } catch (error) {
          failures.push(error.name === "AbortError" ? "timeout" : "network");
        } finally {
          clearTimeout(timeout);
        }
      }
      const relay = await callGeminiRelay({ body, timeoutMs });
      if (relay.ok) return relay;
      return { ok: false, status: 503, data: {}, error: `Gemini\u76F4\u63A5\u63A5\u7D9A\u3068GemRelay\u306E\u4E21\u65B9\u306B\u5931\u6557\u3057\u307E\u3057\u305F\uFF08\u76F4\u63A5: ${failures.join(", ")} / \u4E2D\u7D99: ${relay.error}\uFF09` };
    }
    module.exports = { getGeminiKeyRecords, getGeminiRuntimeSettings, callGemini, callGeminiRelay };
  }
});

// src/lib/public-site-source.js
var require_public_site_source = __commonJS({
  "src/lib/public-site-source.js"(exports, module) {
    "use strict";
    var dns = __require("node:dns").promises;
    var http = __require("node:http");
    var https = __require("node:https");
    var net = __require("node:net");
    var path = __require("node:path").posix;
    var crypto = __require("node:crypto");
    var { URL: URL2 } = __require("node:url");
    var MAX_FILE_BYTES = 256 * 1024;
    var MAX_TOTAL_BYTES = 2 * 1024 * 1024;
    var MAX_FILES = 32;
    var MAX_HTML_PAGES = 8;
    var MAX_REQUESTS = 36;
    var MAX_RUNTIME_MS = 24e3;
    var MAX_REDIRECTS = 2;
    var CONCURRENCY = 4;
    var REQUEST_TIMEOUT_MS = 4500;
    var PublicSiteError = class extends Error {
      constructor(message, statusCode = 400) {
        super(message);
        this.name = "PublicSiteError";
        this.statusCode = statusCode;
      }
    };
    var blockedV4 = new net.BlockList();
    [
      ["0.0.0.0", 8],
      ["10.0.0.0", 8],
      ["100.64.0.0", 10],
      ["127.0.0.0", 8],
      ["169.254.0.0", 16],
      ["172.16.0.0", 12],
      ["192.0.0.0", 24],
      ["192.0.2.0", 24],
      ["192.88.99.0", 24],
      ["192.168.0.0", 16],
      ["198.18.0.0", 15],
      ["198.51.100.0", 24],
      ["203.0.113.0", 24],
      ["224.0.0.0", 4],
      ["240.0.0.0", 4]
    ].forEach(([address, prefix]) => blockedV4.addSubnet(address, prefix, "ipv4"));
    var blockedV6 = new net.BlockList();
    [
      ["::", 96],
      ["::1", 128],
      ["::ffff:0:0", 96],
      ["64:ff9b::", 96],
      ["64:ff9b:1::", 48],
      ["100::", 64],
      ["2001::", 23],
      ["2001:db8::", 32],
      ["2002::", 16],
      ["fc00::", 7],
      ["fe80::", 10],
      ["fec0::", 10],
      ["ff00::", 8]
    ].forEach(([address, prefix]) => blockedV6.addSubnet(address, prefix, "ipv6"));
    function bareHost(hostname) {
      return String(hostname || "").replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
    }
    function isPublicIp(address) {
      const value = bareHost(address);
      const family = net.isIP(value);
      if (family === 4) return !blockedV4.check(value, "ipv4");
      if (family === 6) return !blockedV6.check(value, "ipv6");
      return false;
    }
    function assertSafeHostName(hostname) {
      const host = bareHost(hostname);
      if (!host || /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|example)$/i.test(host) || host === "metadata" || host === "metadata.google.internal") {
        throw new PublicSiteError("\u30ED\u30FC\u30AB\u30EB\u30FB\u4E88\u7D04\u30DB\u30B9\u30C8\u540D\u306F\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093");
      }
    }
    function parseAllowedUrl(raw, { allowHttp = false, expectedOrigin = "" } = {}) {
      let url;
      try {
        url = raw instanceof URL2 ? new URL2(raw.href) : new URL2(String(raw || "").trim());
      } catch {
        throw new PublicSiteError("\u6709\u52B9\u306A\u30B5\u30A4\u30C8URL\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044");
      }
      const protocols = allowHttp ? ["http:", "https:"] : ["https:"];
      if (!protocols.includes(url.protocol)) throw new PublicSiteError("\u53D6\u5F97\u5148\u306B\u306F\u516C\u958BHTTPS URL\u3092\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044");
      if (url.username || url.password) throw new PublicSiteError("\u30E6\u30FC\u30B6\u30FC\u540D\u30FB\u30D1\u30B9\u30EF\u30FC\u30C9\u4ED8\u304DURL\u306F\u4F7F\u7528\u3067\u304D\u307E\u305B\u3093");
      const expectedPort = url.protocol === "https:" ? "443" : "80";
      if (url.port && url.port !== expectedPort) throw new PublicSiteError("\u6A19\u6E96\u30DD\u30FC\u30C8\uFF08HTTPS 443 / HTTP 80\uFF09\u4EE5\u5916\u306B\u306F\u63A5\u7D9A\u3067\u304D\u307E\u305B\u3093");
      const host = bareHost(url.hostname);
      assertSafeHostName(host);
      if (net.isIP(host) && !isPublicIp(host)) throw new PublicSiteError("\u975E\u516C\u958B\u30FB\u4E88\u7D04\u6E08\u307FIP\u306B\u306F\u63A5\u7D9A\u3067\u304D\u307E\u305B\u3093");
      if (expectedOrigin && url.origin !== expectedOrigin) throw new PublicSiteError("\u5165\u529B\u3057\u305F\u30B5\u30A4\u30C8\u3068\u5225\u30AA\u30EA\u30B8\u30F3\u306EURL\u306F\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093");
      url.hash = "";
      return url;
    }
    async function resolvePublicAddresses(url) {
      const host = bareHost(url.hostname);
      let records;
      const family = net.isIP(host);
      try {
        records = family ? [{ address: host, family }] : await dns.lookup(host, { all: true, verbatim: true });
      } catch {
        throw new PublicSiteError("\u30B5\u30A4\u30C8\u306E\u516C\u958BDNS\u3092\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F", 502);
      }
      if (!Array.isArray(records) || !records.length || records.length > 32) throw new PublicSiteError("\u30B5\u30A4\u30C8\u306EDNS\u5FDC\u7B54\u304C\u4E0D\u6B63\u3067\u3059", 502);
      if (records.some((record) => !isPublicIp(record.address))) throw new PublicSiteError("\u975E\u516C\u958B\u30FB\u4E88\u7D04\u6E08\u307FIP\u3092\u542B\u3080\u30B5\u30A4\u30C8\u306B\u306F\u63A5\u7D9A\u3067\u304D\u307E\u305B\u3093");
      return records.sort((a, b) => (a.family === 4 ? 0 : 1) - (b.family === 4 ? 0 : 1));
    }
    function requestOnce(url, address, { method = "GET", maxBytes = MAX_FILE_BYTES, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
      return new Promise((resolve, reject) => {
        let settled = false;
        let received = 0;
        const chunks = [];
        const finish = (error, value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (error) reject(error);
          else resolve(value);
        };
        const host = bareHost(url.hostname);
        const transport = url.protocol === "https:" ? https : http;
        const options = {
          protocol: url.protocol,
          hostname: host,
          port: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
          method,
          path: `${url.pathname || "/"}${url.search || ""}`,
          headers: {
            "User-Agent": "MixAll-PublicSiteSource/1.0",
            "Accept": "text/html,application/xhtml+xml,text/css,application/javascript,text/javascript,application/json,application/manifest+json;q=0.9,*/*;q=0.1",
            "Accept-Encoding": "identity",
            "Connection": "close"
          },
          lookup: (_hostname, lookupOptions, callback) => {
            if (lookupOptions?.all) callback(null, [{ address: address.address, family: address.family }]);
            else callback(null, address.address, address.family);
          }
        };
        if (url.protocol === "https:" && !net.isIP(host)) options.servername = host;
        const req = transport.request(options, (res) => {
          const status = Number(res.statusCode || 0);
          const headers2 = res.headers || {};
          const location = Array.isArray(headers2.location) ? headers2.location[0] : headers2.location;
          const shouldRead = method === "GET" && status >= 200 && status < 300 && maxBytes > 0;
          if (!shouldRead) {
            res.destroy();
            finish(null, { status, headers: headers2, location: location || "", body: Buffer.alloc(0) });
            return;
          }
          const encoding = String(headers2["content-encoding"] || "identity").toLowerCase();
          if (encoding !== "identity" && encoding !== "") {
            res.destroy();
            finish(new PublicSiteError("\u5727\u7E2E\u3055\u308C\u305F\u5FDC\u7B54\u306F\u5B89\u5168\u306E\u305F\u3081\u53D6\u5F97\u3057\u307E\u305B\u3093", 502));
            return;
          }
          const declared = Number(headers2["content-length"]);
          if (Number.isFinite(declared) && declared > maxBytes) {
            res.destroy();
            finish(new PublicSiteError("\u30D5\u30A1\u30A4\u30EB\u304C\u30B5\u30A4\u30BA\u4E0A\u9650\u3092\u8D85\u3048\u3066\u3044\u307E\u3059", 413));
            return;
          }
          res.on("data", (chunk) => {
            received += chunk.length;
            if (received > maxBytes) {
              res.destroy();
              req.destroy();
              finish(new PublicSiteError("\u30D5\u30A1\u30A4\u30EB\u304C\u30B5\u30A4\u30BA\u4E0A\u9650\u3092\u8D85\u3048\u3066\u3044\u307E\u3059", 413));
              return;
            }
            chunks.push(chunk);
          });
          res.once("end", () => finish(null, { status, headers: headers2, location: location || "", body: Buffer.concat(chunks, received) }));
          res.once("error", (error) => finish(error));
          res.once("aborted", () => finish(new PublicSiteError("\u30B5\u30A4\u30C8\u5FDC\u7B54\u304C\u9014\u4E2D\u3067\u7D42\u4E86\u3057\u307E\u3057\u305F", 502)));
        });
        const timer = setTimeout(() => req.destroy(new PublicSiteError("\u30B5\u30A4\u30C8\u5FDC\u7B54\u304C\u30BF\u30A4\u30E0\u30A2\u30A6\u30C8\u3057\u307E\u3057\u305F", 504)), timeoutMs);
        req.setTimeout(timeoutMs, () => req.destroy(new PublicSiteError("\u30B5\u30A4\u30C8\u5FDC\u7B54\u304C\u30BF\u30A4\u30E0\u30A2\u30A6\u30C8\u3057\u307E\u3057\u305F", 504)));
        req.once("error", (error) => finish(error instanceof PublicSiteError ? error : new PublicSiteError("\u30B5\u30A4\u30C8\u306B\u63A5\u7D9A\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F", 502)));
        req.end();
      });
    }
    async function requestPublicResource(raw, options = {}) {
      const allowHttp = options.allowHttp === true;
      const expectedOrigin = options.expectedOrigin || "";
      const method = String(options.method || "GET").toUpperCase();
      if (!["GET", "HEAD"].includes(method)) throw new PublicSiteError("GET/HEAD\u4EE5\u5916\u306EHTTP\u30E1\u30BD\u30C3\u30C9\u306F\u4F7F\u7528\u3067\u304D\u307E\u305B\u3093");
      const maxBytes = Math.min(MAX_FILE_BYTES, Math.max(0, Number(options.maxBytes ?? MAX_FILE_BYTES)));
      const maxRedirects = Math.min(MAX_REDIRECTS, Math.max(0, Number(options.maxRedirects || 0)));
      let url = parseAllowedUrl(raw, { allowHttp, expectedOrigin });
      let redirects = 0;
      while (true) {
        const addresses = await resolvePublicAddresses(url);
        let response = null;
        let lastError = null;
        for (const address of addresses) {
          try {
            response = await requestOnce(url, address, { method, maxBytes, timeoutMs: options.timeoutMs || REQUEST_TIMEOUT_MS });
            break;
          } catch (error) {
            lastError = error;
            if (error.statusCode === 413) throw error;
          }
        }
        if (!response) throw lastError || new PublicSiteError("\u30B5\u30A4\u30C8\u306B\u63A5\u7D9A\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F", 502);
        const isRedirect = response.status >= 300 && response.status < 400 && response.location;
        if (!isRedirect || redirects >= maxRedirects) return { ...response, url };
        let next;
        try {
          next = new URL2(String(response.location), url);
        } catch {
          throw new PublicSiteError("\u30B5\u30A4\u30C8\u306E\u30EA\u30C0\u30A4\u30EC\u30AF\u30C8\u5148\u304C\u4E0D\u6B63\u3067\u3059", 502);
        }
        url = parseAllowedUrl(next, { allowHttp: false, expectedOrigin: expectedOrigin || url.origin });
        redirects += 1;
      }
    }
    function mimeType(headers2) {
      return String(headers2?.["content-type"] || "").split(";")[0].trim().toLowerCase();
    }
    function isHtmlMime(mime) {
      return mime === "text/html" || mime === "application/xhtml+xml";
    }
    function isJsMime(mime) {
      return ["application/javascript", "text/javascript", "application/x-javascript", "application/ecmascript", "text/ecmascript"].includes(mime);
    }
    function isJsonMime(mime) {
      return ["application/json", "application/manifest+json", "application/source-map+json", "text/json"].includes(mime);
    }
    function extension(url) {
      return path.extname(url.pathname).toLowerCase();
    }
    function decodePathSegments(url) {
      const segments = [];
      for (const part of url.pathname.split("/").filter(Boolean)) {
        let value;
        try {
          value = decodeURIComponent(part);
        } catch {
          throw new PublicSiteError("\u30B5\u30A4\u30C8\u306E\u30D1\u30B9\u304C\u4E0D\u6B63\u3067\u3059");
        }
        if (!value || value === "." || value === ".." || value.includes("/") || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value) || value.startsWith(".")) {
          throw new PublicSiteError("\u96A0\u3057\u30D5\u30A1\u30A4\u30EB\u3084\u4E0D\u6B63\u306A\u30D1\u30B9\u306F\u53D6\u5F97\u3057\u307E\u305B\u3093");
        }
        segments.push(value);
      }
      return segments;
    }
    function archivePath(url, kind) {
      let segments = decodePathSegments(url);
      if (kind === "page") {
        if (!segments.length || url.pathname.endsWith("/")) segments.push("index.html");
        else {
          const leaf = segments.pop();
          const ext = path.extname(leaf).toLowerCase();
          segments.push([".html", ".htm"].includes(ext) ? leaf : `${ext ? leaf.slice(0, -ext.length) : leaf}.html`);
        }
      } else if (!segments.length) return "";
      if (url.search) {
        const last = segments.pop();
        const ext = path.extname(last);
        const suffix = crypto.createHash("sha1").update(url.search).digest("hex").slice(0, 8);
        segments.push(`${ext ? last.slice(0, -ext.length) : last}-${suffix}${ext}`);
      }
      return segments.join("/");
    }
    function resolveSameOrigin(raw, base, origin) {
      const value = String(raw || "").trim().replace(/&amp;/gi, "&").replace(/&#38;/g, "&");
      if (!value || /^(?:#|javascript:|mailto:|tel:|data:|blob:)/i.test(value)) return null;
      let url;
      try {
        url = new URL2(value, base);
      } catch {
        return null;
      }
      url.hash = "";
      if (url.protocol !== "https:" || url.origin !== origin || url.username || url.password) return null;
      try {
        decodePathSegments(url);
      } catch {
        return null;
      }
      return url;
    }
    function tagAttributes(tag) {
      const attrs = /* @__PURE__ */ Object.create(null);
      const body = tag.replace(/^<\w+\b|\s*\/?\s*>$/g, " ");
      const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
      let match;
      while (match = re.exec(body)) attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
      return attrs;
    }
    function looksLikePage(url) {
      const ext = extension(url);
      return !ext || [".html", ".htm", ".php", ".aspx", ".jsp"].includes(ext);
    }
    function looksLikeJs(url) {
      return [".js", ".mjs", ".cjs"].includes(extension(url));
    }
    function looksLikeCss(url) {
      return extension(url) === ".css";
    }
    function discoverHtml(source, baseUrl, origin, depth) {
      const assets = [];
      const pages = [];
      const tags = /<(script|link|a)\b[^>]*>/gi;
      let match;
      while (match = tags.exec(source)) {
        const tagName = match[1].toLowerCase();
        const attrs = tagAttributes(match[0]);
        const raw = tagName === "script" ? attrs.src : attrs.href;
        if (!raw) continue;
        const url = resolveSameOrigin(raw, baseUrl, origin);
        if (!url) continue;
        if (tagName === "script" && looksLikeJs(url)) assets.push({ url, kind: "script" });
        if (tagName === "link") {
          const rel = String(attrs.rel || "").toLowerCase().split(/\s+/);
          if (rel.includes("stylesheet") && looksLikeCss(url)) assets.push({ url, kind: "style" });
          else if ((rel.includes("modulepreload") || rel.includes("preload") && attrs.as === "script") && looksLikeJs(url)) assets.push({ url, kind: "script" });
          else if (rel.includes("manifest") && [".webmanifest", ".json"].includes(extension(url))) assets.push({ url, kind: "manifest" });
        }
        if (tagName === "a" && depth < 1 && looksLikePage(url)) pages.push({ url, kind: "page", depth: depth + 1 });
      }
      return { assets, pages };
    }
    function discoverImports(source, baseUrl, origin, kind) {
      const found = [];
      let regex;
      if (kind === "style") regex = /@import\s+(?:url\()?\s*['"]([^'"]+)['"]/gi;
      else regex = /\b(?:import\s*(?:[^'";]*?\sfrom\s*)?|export\s+[^'";]*?\sfrom\s*)['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gi;
      let match;
      while (match = regex.exec(source)) {
        const raw = match[1] || match[2];
        const url = resolveSameOrigin(raw, baseUrl, origin);
        if (!url) continue;
        if (kind === "style" && looksLikeCss(url)) found.push({ url, kind: "style" });
        if (kind === "script" && looksLikeJs(url)) found.push({ url, kind: "script" });
      }
      return found;
    }
    function resourceMatches(kind, mime, url) {
      if (kind === "page") return isHtmlMime(mime);
      if (kind === "script") return isJsMime(mime) || isJsonMime(mime) && extension(url) === ".map";
      if (kind === "style") return mime === "text/css";
      if (kind === "manifest") return isJsonMime(mime);
      return false;
    }
    async function crawlPublicSite(rawUrl) {
      const root = parseAllowedUrl(rawUrl, { allowHttp: false });
      const origin = root.origin;
      const startedAt = Date.now();
      const queue = [{ url: root, kind: "page", depth: 0 }];
      const queued = /* @__PURE__ */ new Set();
      const filePaths = /* @__PURE__ */ new Set();
      const files = [];
      const warnings = [];
      let totalBytes = 0;
      let requests = 0;
      let htmlPages = 0;
      const enqueue = (item) => {
        const url = item.url instanceof URL2 ? item.url : new URL2(item.url);
        if (url.origin !== origin || url.protocol !== "https:") return;
        const key = `${item.kind}:${url.href}`;
        if (queued.has(key) || queue.length + requests >= MAX_REQUESTS) return;
        if (item.kind === "page" && htmlPages + queue.filter((entry) => entry.kind === "page").length >= MAX_HTML_PAGES) return;
        queued.add(key);
        queue.push({ ...item, url });
      };
      queued.add(`page:${root.href}`);
      while (queue.length && requests < MAX_REQUESTS && Date.now() - startedAt < MAX_RUNTIME_MS && files.length < MAX_FILES && totalBytes < MAX_TOTAL_BYTES) {
        const batch = [];
        while (queue.length && batch.length < CONCURRENCY && requests + batch.length < MAX_REQUESTS && files.length + batch.length < MAX_FILES) {
          const task = queue.shift();
          if (task.kind === "page" && htmlPages + batch.filter((item) => item.kind === "page").length >= MAX_HTML_PAGES) continue;
          batch.push(task);
        }
        if (!batch.length) break;
        requests += batch.length;
        const responses = await Promise.all(batch.map(async (task) => {
          try {
            const response = await requestPublicResource(task.url, {
              allowHttp: false,
              expectedOrigin: origin,
              maxRedirects: MAX_REDIRECTS,
              maxBytes: Math.min(MAX_FILE_BYTES, MAX_TOTAL_BYTES - totalBytes),
              timeoutMs: REQUEST_TIMEOUT_MS
            });
            return { task, response };
          } catch (error) {
            return { task, error };
          }
        }));
        for (const item of responses) {
          if (Date.now() - startedAt >= MAX_RUNTIME_MS) {
            warnings.push("\u5B9F\u884C\u6642\u9593\u306E\u4E0A\u9650\u306B\u9054\u3057\u305F\u305F\u3081\u3001\u53D6\u5F97\u3092\u9014\u4E2D\u3067\u7D42\u4E86\u3057\u307E\u3057\u305F\u3002");
            break;
          }
          if (item.error) {
            if (item.error.statusCode === 413) warnings.push("\u30B5\u30A4\u30BA\u4E0A\u9650\u3092\u8D85\u3048\u305F\u30D5\u30A1\u30A4\u30EB\u3092\u9664\u5916\u3057\u307E\u3057\u305F\u3002");
            else warnings.push("\u53D6\u5F97\u3067\u304D\u306A\u3044\u516C\u958B\u30D5\u30A1\u30A4\u30EB\u3092\u4E00\u90E8\u9664\u5916\u3057\u307E\u3057\u305F\u3002");
            continue;
          }
          const { task, response } = item;
          if (response.status !== 200) {
            warnings.push("HTTP 200\u4EE5\u5916\u306E\u5FDC\u7B54\u3092\u4E00\u90E8\u9664\u5916\u3057\u307E\u3057\u305F\u3002");
            continue;
          }
          const mime = mimeType(response.headers);
          if (!resourceMatches(task.kind, mime, response.url)) {
            warnings.push("\u5BFE\u8C61\u5916\u306E\u30D5\u30A1\u30A4\u30EB\u5F62\u5F0F\u3092\u4E00\u90E8\u9664\u5916\u3057\u307E\u3057\u305F\u3002");
            continue;
          }
          const bytes = response.body.length;
          if (!bytes) {
            warnings.push("\u7A7A\u306E\u30D5\u30A1\u30A4\u30EB\u3092\u4E00\u90E8\u9664\u5916\u3057\u307E\u3057\u305F\u3002");
            continue;
          }
          if (bytes > MAX_FILE_BYTES || totalBytes + bytes > MAX_TOTAL_BYTES) {
            warnings.push("\u5408\u8A08\u30B5\u30A4\u30BA\u4E0A\u9650\u306B\u9054\u3057\u305F\u305F\u3081\u3001\u4EE5\u964D\u306E\u30D5\u30A1\u30A4\u30EB\u3092\u9664\u5916\u3057\u307E\u3057\u305F\u3002");
            queue.length = 0;
            break;
          }
          let relPath;
          try {
            relPath = archivePath(response.url, task.kind);
          } catch {
            warnings.push("\u4E0D\u6B63\u306A\u30D1\u30B9\u306E\u30D5\u30A1\u30A4\u30EB\u3092\u9664\u5916\u3057\u307E\u3057\u305F\u3002");
            continue;
          }
          if (!relPath || filePaths.has(relPath)) continue;
          filePaths.add(relPath);
          const content = response.body.toString("utf8");
          files.push({ path: relPath, content, bytes, type: mime });
          totalBytes += bytes;
          if (task.kind === "page") {
            htmlPages += 1;
            const discovered = discoverHtml(content, response.url, origin, task.depth);
            discovered.assets.forEach(enqueue);
            discovered.pages.forEach(enqueue);
          } else if (task.kind === "style" || task.kind === "script") {
            discoverImports(content, response.url, origin, task.kind).forEach(enqueue);
          }
        }
      }
      if (queue.length || requests >= MAX_REQUESTS || files.length >= MAX_FILES || Date.now() - startedAt >= MAX_RUNTIME_MS) {
        warnings.push("\u4EF6\u6570\u30FB\u6642\u9593\u4E0A\u9650\u306B\u9054\u3057\u305F\u305F\u3081\u3001\u516C\u958B\u30D5\u30A1\u30A4\u30EB\u306E\u4E00\u90E8\u306E\u307F\u3092\u53D6\u5F97\u3057\u307E\u3057\u305F\u3002");
      }
      if (!files.some((file) => file.path.endsWith(".html"))) throw new PublicSiteError("\u516C\u958BHTML\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u30ED\u30B0\u30A4\u30F3\u304C\u5FC5\u8981\u306A\u30DA\u30FC\u30B8\u3084\u5BFE\u8C61\u5916\u306E\u5F62\u5F0F\u3067\u306F\u5229\u7528\u3067\u304D\u307E\u305B\u3093", 502);
      const payload = { origin, entryPath: root.pathname || "/", fileCount: files.length, totalBytes, requestCount: requests, warnings: [...new Set(warnings)], files };
      while (Buffer.byteLength(JSON.stringify(payload), "utf8") > 3.5 * 1024 * 1024 && payload.files.length > 1) {
        const removed = payload.files.pop();
        payload.totalBytes -= removed.bytes;
        payload.fileCount = payload.files.length;
        payload.warnings.push("\u5FDC\u7B54\u30C7\u30FC\u30BF\u4E0A\u9650\u306E\u305F\u3081\u3001\u4E00\u90E8\u30D5\u30A1\u30A4\u30EB\u3092ZIP\u306B\u542B\u3081\u307E\u305B\u3093\u3067\u3057\u305F\u3002");
      }
      return payload;
    }
    module.exports = {
      PublicSiteError,
      isPublicIp,
      parseAllowedUrl,
      resolvePublicAddresses,
      requestPublicResource,
      crawlPublicSite
    };
  }
});

// src/functions/tools.js
var require_tools = __commonJS({
  "src/functions/tools.js"(exports) {
    var crypto = __require("crypto");
    var { connectLambda: connectLambda2 } = (init_blobs(), __toCommonJS(blobs_exports));
    var { STORE_NAMES, getJSON, setJSON, deleteKey, listKeys } = require_store();
    var { requireSession } = require_session();
    var { callGemini } = require_gemini();
    var { PublicSiteError, parseAllowedUrl, resolvePublicAddresses, requestPublicResource, crawlPublicSite } = require_public_site_source();
    var MAX_TEXT = 12e3;
    var now = () => Date.now();
    var id = (n = 12) => crypto.randomBytes(n).toString("hex");
    var json = (statusCode, body) => ({ statusCode, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(body) });
    var asText = (v, n = MAX_TEXT) => String(v || "").trim().slice(0, n);
    var parse = (event) => event.httpMethod === "GET" ? event.queryStringParameters || {} : JSON.parse(event.body || "{}");
    function buildRedirectBase(event) {
      const headers2 = event.headers || {};
      const host = headers2["x-forwarded-host"] || headers2.host || "";
      const proto = headers2["x-forwarded-proto"] || "https";
      if (process.env.MIXALL_SITE_URL) { try { return new URL(process.env.MIXALL_SITE_URL).origin; } catch (_) {} }
      if (!/^[a-z0-9.-]+(?::\d+)?$/i.test(host) || /\.qcloudteo\.com(:\d+)?$/i.test(host)) return "https://mixalls.edgeone.dev";
      return `${proto}://${host}`;
    }
    async function publicHttpUrl(raw) {
      const url = parseAllowedUrl(raw, { allowHttp: true });
      await resolvePublicAddresses(url);
      return url;
    }
    async function callAi(prompt, system, maxOutputTokens = 900) {
      const result = await callGemini({ model: "gemini-3.6-flash", timeoutMs: 24e3, body: { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: String(prompt).slice(0, 7e3) }] }], generationConfig: { maxOutputTokens, temperature: 0.8 } } });
      if (!result.ok) throw new Error(result.error || "AI\u306E\u5FDC\u7B54\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F");
      return result.data.candidates?.[0]?.content?.parts?.map((x) => x.text || "").join("").trim() || "\u56DE\u7B54\u3092\u751F\u6210\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002";
    }
    async function expiredRecord(store, key) {
      const item = await getJSON(store, key);
      if (item && Number(item.expiresAt) <= now()) {
        await deleteKey(store, key);
        return null;
      }
      return item;
    }
    async function rateLimit(namespace, key, intervalMs) {
      const hash = crypto.createHash("sha256").update(String(key || "unknown")).digest("hex").slice(0, 24);
      const k = `${namespace}:${hash}`;
      const previous = await getJSON(STORE_NAMES.TOOL_DATA, k);
      if (previous && now() - Number(previous.at) < intervalMs) return false;
      await setJSON(STORE_NAMES.TOOL_DATA, k, { at: now() });
      return true;
    }
    exports.handler = async (event) => {
      connectLambda2(event);
      if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" } };
      if (!["GET", "POST"].includes(event.httpMethod)) return json(405, { error: "GET/POST\u306E\u307F\u5BFE\u5FDC\u3057\u3066\u3044\u307E\u3059" });
      let p;
      try {
        p = parse(event);
      } catch {
        return json(400, { error: "\u30EA\u30AF\u30A8\u30B9\u30C8\u5F62\u5F0F\u304C\u4E0D\u6B63\u3067\u3059" });
      }
      const action = String(p.action || "");
      const ip = event.headers?.["x-nf-client-connection-ip"] || event.headers?.["x-forwarded-for"]?.split(",")[0] || "unknown";
      try {
        if (event.httpMethod === "GET" && action !== "redirectGet" && action !== "pximg") {
          if (action === "boxInfo") {
            const slug = asText(p.slug, 32).toLowerCase();
            const box = await getJSON(STORE_NAMES.ANON_BOXES, `box:${slug}`);
            return box ? json(200, { box: { slug: box.slug, displayName: box.displayName, message: String(box.message || "") }, messages: void 0 }) : json(404, { error: "\u30DC\u30C3\u30AF\u30B9\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
          }
          if (action === "inbox") {
            const email2 = await requireSession(p.token);
            if (!email2) return json(401, { error: "\u30ED\u30B0\u30A4\u30F3\u3057\u3066\u304F\u3060\u3055\u3044" });
            const box = await getJSON(STORE_NAMES.ANON_BOXES, `owner:${email2}`);
            if (!box) return json(200, { box: null, messages: [] });
            const rows = await getJSON(STORE_NAMES.ANON_BOXES, `messages:${box.slug}`) || [];
            return json(200, { box: { slug: box.slug, displayName: box.displayName }, messages: rows.slice(-300).reverse() });
          }
          if (action === "roomGet") {
            const room = await expiredRecord(STORE_NAMES.TEMP_ROOMS, `room:${asText(p.id, 32)}`);
            return room ? json(200, { room }) : json(404, { error: "\u30C1\u30E3\u30C3\u30C8\u30EB\u30FC\u30E0\u306F\u5B58\u5728\u3057\u306A\u3044\u304B\u3001\u6709\u52B9\u671F\u9650\u304C\u5207\u308C\u307E\u3057\u305F" });
          }
          if (action === "lockerGet") {
            const item = await expiredRecord(STORE_NAMES.TEMP_SHARES, `share:${asText(p.id, 32)}`);
            if (!item) return json(404, { error: "\u5171\u6709\u30C7\u30FC\u30BF\u306F\u5B58\u5728\u3057\u306A\u3044\u304B\u3001\u6709\u52B9\u671F\u9650\u304C\u5207\u308C\u307E\u3057\u305F" });
            return json(200, { item: { id: item.id, name: item.name, type: item.type, text: item.text || "", dataUrl: item.dataUrl || "", expiresAt: item.expiresAt, createdAt: item.createdAt } });
          }
          if (action === "wikiList") {
            const viewerEmail = p.token ? await requireSession(p.token).catch(() => null) : null;
            const keys = await listKeys(STORE_NAMES.WIKI, "wiki:");
            const pages = [];
            for (const key of keys) {
              const item = await getJSON(STORE_NAMES.WIKI, key);
              if (item && !item.deleted) pages.push({ id: item.id, title: item.title, summary: item.summary, body: String(item.body || "").slice(0, 1500), updatedAt: item.updatedAt, createdAt: item.createdAt, authorName: item.authorName, authorId: item.ownerEmail ? crypto.createHash("sha256").update("wiki|" + item.ownerEmail).digest("hex").slice(0, 12) : "", mine: Boolean(viewerEmail && item.ownerEmail === viewerEmail) });
            }
            return json(200, { pages: pages.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))) });
          }
          if (action === "wikiGet") {
            const item = await getJSON(STORE_NAMES.WIKI, `wiki:${asText(p.id, 32)}`);
            if (!item || item.deleted) return json(404, { error: "\u30DA\u30FC\u30B8\u304C\u3042\u308A\u307E\u305B\u3093" });
            const { ownerEmail, ...publicPage } = item;
            const viewerEmail2 = p.token ? await requireSession(p.token).catch(() => null) : null;
            return json(200, { page: { ...publicPage, mine: Boolean(viewerEmail2 && ownerEmail === viewerEmail2) } });
          }
          return json(400, { error: "\u4E0D\u660E\u306Aaction\u3067\u3059" });
        }
        if (action === "pximg") {
          let target;
          try { target = new URL(String(p.u || "")); } catch (_) { return json(400, { error: "URL\u304C\u4E0D\u6B63\u3067\u3059" }); }
          if (target.protocol !== "https:" || target.hostname !== "i.pximg.net" || !/^\/[A-Za-z0-9_\/.-]+\.(jpe?g|png|gif|webp|zip)$/i.test(target.pathname) || /\.zip$/i.test(target.pathname) && !/^\/img-zip-ugoira\//.test(target.pathname)) return json(400, { error: "i.pximg.net \u306E\u753B\u50CFURL\u306E\u307F\u5BFE\u5FDC\u3057\u3066\u3044\u307E\u3059" });
          const resp = await fetch(target.href, { headers: { Referer: "https://www.pixiv.net/", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" }, signal: AbortSignal.timeout(15e3) }).catch(() => null);
          if (!resp || !resp.ok) return json(502, { error: "\u753B\u50CF\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F" });
          const buf = Buffer.from(await resp.arrayBuffer());
          const isZip = /\.zip$/i.test(target.pathname);
          if (buf.length > (isZip ? 24 : 8) * 1024 * 1024) return json(413, { error: "\u753B\u50CF\u304C\u5927\u304D\u3059\u304E\u307E\u3059" });
          const ctype = isZip ? "application/zip" : /^image\//.test(resp.headers.get("content-type") || "") ? resp.headers.get("content-type") : "image/jpeg";
          return { statusCode: 200, headers: { "Content-Type": ctype, "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox" }, body: buf.toString("base64"), isBase64Encoded: true };
        }
        if (action === "pixivImage") {
          const m = /artworks\/(\d{3,12})|^(\d{3,12})$/.exec(String(p.url || "").trim());
          const illustId = m && (m[1] || m[2]);
          if (!illustId) return json(400, { error: "pixiv\u306E\u4F5C\u54C1URL\uFF08https://www.pixiv.net/artworks/\u6570\u5B57\uFF09\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044" });
          if (!await rateLimit("pixiv-info", ip, 1200)) return json(429, { error: "\u3057\u3070\u3089\u304F\u3057\u3066\u304B\u3089\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044" });
          const headers = { Referer: "https://www.pixiv.net/", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", Accept: "application/json" };
          const r1 = await fetch(`https://www.pixiv.net/ajax/illust/${illustId}/pages?lang=ja`, { headers, signal: AbortSignal.timeout(12e3) }).catch(() => null);
          const d1 = r1 && r1.ok ? await r1.json().catch(() => null) : null;
          if (!d1 || d1.error || !Array.isArray(d1.body) || !d1.body.length) return json(502, { error: "pixiv\u304B\u3089\u753B\u50CF\u60C5\u5831\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\uFF08\u975E\u516C\u958B\u30FB\u5236\u9650\u4ED8\u304D\u4F5C\u54C1\u3001\u307E\u305F\u306Fpixiv\u5074\u306E\u5236\u9650\u306E\u53EF\u80FD\u6027\uFF09" });
          const proxy = (u) => `/api/tools?action=pximg&u=${encodeURIComponent(u)}`;
          const c1200 = (u) => String(u).replace("https://i.pximg.net/img-master/", "https://i.pximg.net/c/1200x1200_80_webp/img-master/");
          const pages = d1.body.slice(0, 30).map((x, i) => { const regular = x.urls?.regular || "", original = x.urls?.original || ""; return { page: i + 1, image1200: c1200(regular), regular, original, proxyUrl: proxy(regular), proxyOriginalUrl: proxy(original) }; });
          return json(200, { id: illustId, artworkUrl: `https://www.pixiv.net/artworks/${illustId}`, pages });
        }
        if (action === "pixivSearch") {
          const word = String(p.q || "").trim().slice(0, 100);
          if (!word) return json(400, { error: "\u691C\u7D22\u30AD\u30FC\u30EF\u30FC\u30C9\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044" });
          if (!await rateLimit("pixiv-search", ip, 1500)) return json(429, { error: "\u3057\u3070\u3089\u304F\u3057\u3066\u304B\u3089\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044" });
          const page = Math.min(Math.max(parseInt(p.page, 10) || 1, 1), 20);
          const order = p.order === "popular_d" ? "popular_d" : "date_d";
          const sm = p.mode === "title" ? "s_tc" : "s_tag";
          const hdrs = { Referer: "https://www.pixiv.net/", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", Accept: "application/json", "Accept-Language": "ja,en;q=0.8" };
          const url = `https://www.pixiv.net/ajax/search/artworks/${encodeURIComponent(word)}?word=${encodeURIComponent(word)}&order=${order}&mode=safe&p=${page}&s_mode=${sm}&type=all&lang=ja`;
          const r = await fetch(url, { headers: hdrs, signal: AbortSignal.timeout(12e3) }).catch(() => null);
          const d = r && r.ok ? await r.json().catch(() => null) : null;
          const list = d && !d.error ? (d.body?.illustManga?.data || d.body?.illust?.data || []) : null;
          if (!list) return json(502, { error: "pixiv\u306E\u691C\u7D22\u7D50\u679C\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F" + (r ? `(${r.status})` : "") });
          const prox = (u2) => /^https:\/\/i\.pximg\.net\//.test(String(u2 || "")) ? `/api/tools?action=pximg&u=${encodeURIComponent(u2)}` : "";
          const items = list.filter((x) => x && x.id && !x.isAdContainer).slice(0, 60).map((x) => ({ id: String(x.id), title: String(x.title || "").slice(0, 120), author: String(x.userName || "").slice(0, 60), pages: Number(x.pageCount) || 1, tags: (x.tags || []).slice(0, 8), thumb: prox(x.url) }));
          return json(200, { q: word, page, items, total: d.body?.illustManga?.total ?? null });
        }
        if (action === "pixivImg") {
          const tok = String(p.t || "");
          if (!/^[a-f0-9]{16,64}$/.test(tok)) return { statusCode: 400, headers: { "Content-Type": "text/plain; charset=utf-8" }, body: "bad token" };
          const rec = await getJSON(STORE_NAMES.TOOL_DATA, `pxtok:${tok}`);
          if (!rec || Number(rec.exp) < now()) return { statusCode: 404, headers: { "Content-Type": "text/plain; charset=utf-8" }, body: "expired" };
          const resp = await fetch(rec.url, { headers: { Referer: "https://www.pixiv.net/", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" }, signal: AbortSignal.timeout(15e3) }).catch(() => null);
          if (!resp || !resp.ok) return { statusCode: 502, headers: { "Content-Type": "text/plain; charset=utf-8" }, body: `pixiv\u304B\u3089\u753B\u50CF\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F(${resp ? resp.status : "network"})` };
          const buf = Buffer.from(await resp.arrayBuffer());
          if (buf.length > 6e6) return { statusCode: 413, headers: { "Content-Type": "text/plain; charset=utf-8" }, body: "too large" };
          const ct = String(resp.headers.get("content-type") || "image/jpeg");
          if (!/^image\/(jpeg|png|webp|gif)/.test(ct)) return { statusCode: 502, headers: { "Content-Type": "text/plain; charset=utf-8" }, body: "not an image" };
          return { statusCode: 200, headers: { "Content-Type": ct, "Cache-Control": "private, max-age=600", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox" }, body: buf.toString("base64"), isBase64Encoded: true };
        }
        if (action === "redirectGet") {
          const redirectId = asText(p.id, 64);
          if (!/^[a-f0-9]{24,64}$/.test(redirectId)) return json(400, { error: "\u30EA\u30C0\u30A4\u30EC\u30AF\u30C8ID\u304C\u4E0D\u6B63\u3067\u3059" });
          const item = await getJSON(STORE_NAMES.TOOL_DATA, `redirect:${redirectId}`);
          if (!item || item.deleted) return { statusCode: 404, headers: { "Content-Type": "text/plain; charset=utf-8" }, body: "\u30EA\u30C0\u30A4\u30EC\u30AF\u30C8\u5148\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" };
          const target = String(item.target || "");
          if (/^https?:\/\//i.test(target)) return { statusCode: 302, headers: { Location: target, "Cache-Control": "public, max-age=300" }, body: "" };
          if (/^data:[^\s]+$/i.test(target)) {
            const match = /^data:([^,]*),(.*)$/is.exec(target);
            if (!match) return { statusCode: 400, headers: { "Content-Type": "text/plain; charset=utf-8" }, body: "Data URL\u306E\u5F62\u5F0F\u304C\u4E0D\u6B63\u3067\u3059" };
            const meta = match[1];
            const mime = (meta.replace(/;base64$/i, "").split(";")[0] || "text/plain").trim().toLowerCase();
            let bytes;
            try {
              bytes = /;base64$/i.test(meta) ? Buffer.from(match[2], "base64") : Buffer.from(decodeURIComponent(match[2]), "utf8");
            } catch {
              return { statusCode: 400, headers: { "Content-Type": "text/plain; charset=utf-8" }, body: "Data URL\u3092\u8AAD\u307F\u53D6\u308C\u307E\u305B\u3093" };
            }
            // \u30D6\u30E9\u30A6\u30B6\u306Fdata:\u3078\u306E\u76F4\u63A5\u79FB\u52D5\u3092\u30D6\u30ED\u30C3\u30AF\u3059\u308B\u305F\u3081\u3001\u4E2D\u8EAB\u3092\u5FA9\u53F7\u3057\u3066\u76F4\u63A5\u8FD4\u3059\u3002\u30B9\u30AF\u30EA\u30D7\u30C8\u3092\u5B9F\u884C\u3067\u304D\u308B\u5F62\u5F0F(HTML/SVG\u7B49)\u306F\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u6271\u3044\u306B\u3059\u308B\u3002
            const inlineOk = /^(image\/(png|jpe?g|gif|webp|avif|bmp)|audio\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+|application\/pdf|text\/plain)$/.test(mime);
            const headers = { "Content-Type": mime === "text/plain" ? "text/plain; charset=utf-8" : inlineOk ? mime : "application/octet-stream", "Content-Disposition": inlineOk ? "inline" : 'attachment; filename="mixall-data"', "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=300" };
            if (mime !== "application/pdf") headers["Content-Security-Policy"] = /^(image|audio|video)\//.test(mime) ? "sandbox" : "default-src 'none'; sandbox";
            headers["Accept-Ranges"] = "bytes";
            const rangeHeader = String(event.headers?.range || event.headers?.Range || "");
            const rangeMatch = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
            if (rangeMatch && (rangeMatch[1] || rangeMatch[2]) && bytes.length) {
              let start = rangeMatch[1] ? Number(rangeMatch[1]) : Math.max(0, bytes.length - Number(rangeMatch[2]));
              let end = rangeMatch[1] && rangeMatch[2] ? Number(rangeMatch[2]) : bytes.length - 1;
              end = Math.min(end, bytes.length - 1);
              if (start > end || start >= bytes.length) return { statusCode: 416, headers: { "Content-Range": `bytes */${bytes.length}` }, body: "" };
              headers["Content-Range"] = `bytes ${start}-${end}/${bytes.length}`;
              return { statusCode: 206, headers, body: bytes.subarray(start, end + 1).toString("base64"), isBase64Encoded: true };
            }
            return { statusCode: 200, headers, body: bytes.toString("base64"), isBase64Encoded: true };
          }
          return { statusCode: 400, headers: { "Content-Type": "text/plain; charset=utf-8" }, body: "\u5BFE\u5FDC\u3057\u3066\u3044\u306A\u3044\u30EA\u30C0\u30A4\u30EC\u30AF\u30C8\u5148\u3067\u3059" };
        }
        if (action === "anonSend") {
          if (!await rateLimit("anon", ip, 5e3)) return json(429, { error: "\u9001\u4FE1\u304C\u65E9\u3059\u304E\u307E\u3059\u3002\u5C11\u3057\u5F85\u3063\u3066\u304F\u3060\u3055\u3044" });
          const slug = asText(p.slug, 32).toLowerCase();
          const box = await getJSON(STORE_NAMES.ANON_BOXES, `box:${slug}`);
          if (!box) return json(404, { error: "\u30DC\u30C3\u30AF\u30B9\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
          const text = asText(p.text, 1200);
          if (!text) return json(400, { error: "\u30E1\u30C3\u30BB\u30FC\u30B8\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044" });
          const key = `messages:${slug}`;
          const rows = await getJSON(STORE_NAMES.ANON_BOXES, key) || [];
          rows.push({ id: id(8), text, createdAt: (/* @__PURE__ */ new Date()).toISOString() });
          await setJSON(STORE_NAMES.ANON_BOXES, key, rows.slice(-500));
          return json(201, { ok: true });
        }
        if (action === "roomCreate") {
          if (!await rateLimit("roomcreate", ip, 4e3)) return json(429, { error: "\u30EB\u30FC\u30E0\u4F5C\u6210\u306E\u9593\u9694\u3092\u7A7A\u3051\u3066\u304F\u3060\u3055\u3044" });
          const roomId = id(9);
          const room = { id: roomId, title: asText(p.title, 80) || "\u4E00\u6642\u30C1\u30E3\u30C3\u30C8", messages: [], createdAt: now(), expiresAt: now() + 6 * 60 * 60 * 1e3 };
          await setJSON(STORE_NAMES.TEMP_ROOMS, `room:${roomId}`, room);
          return json(201, { room });
        }
        if (action === "roomPost") {
          if (!await rateLimit("room", `${ip}:${p.id}`, 700)) return json(429, { error: "\u5C11\u3057\u5F85\u3063\u3066\u304B\u3089\u9001\u4FE1\u3057\u3066\u304F\u3060\u3055\u3044" });
          const room = await expiredRecord(STORE_NAMES.TEMP_ROOMS, `room:${asText(p.id, 32)}`);
          if (!room) return json(404, { error: "\u30C1\u30E3\u30C3\u30C8\u30EB\u30FC\u30E0\u306F\u5B58\u5728\u3057\u306A\u3044\u304B\u3001\u6709\u52B9\u671F\u9650\u304C\u5207\u308C\u307E\u3057\u305F" });
          const text = asText(p.text, 1e3), name = asText(p.name, 32) || "\u30B2\u30B9\u30C8";
          if (!text) return json(400, { error: "\u30E1\u30C3\u30BB\u30FC\u30B8\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044" });
          room.messages.push({ id: id(8), name, text, createdAt: (/* @__PURE__ */ new Date()).toISOString() });
          room.messages = room.messages.slice(-400);
          await setJSON(STORE_NAMES.TEMP_ROOMS, `room:${room.id}`, room);
          return json(201, { room });
        }
        if (action === "roomDelete") {
          await deleteKey(STORE_NAMES.TEMP_ROOMS, `room:${asText(p.id, 32)}`);
          return json(200, { ok: true });
        }
        if (action === "lockerCreate") {
          if (!await rateLimit("lockercreate", ip, 5e3)) return json(429, { error: "\u5171\u6709\u30EA\u30F3\u30AF\u767A\u884C\u306E\u9593\u9694\u3092\u7A7A\u3051\u3066\u304F\u3060\u3055\u3044" });
          const text = String(p.text || "");
          const dataUrl = String(p.dataUrl || "");
          if (text.length > 3e4 || dataUrl.length > 5 * 1024 * 1024) return json(413, { error: "\u30C6\u30AD\u30B9\u30C8\u306F3\u4E07\u6587\u5B57\u3001\u30D5\u30A1\u30A4\u30EB\u306F\u7D043.5MB\u307E\u3067\u3067\u3059" });
          if (!text && !dataUrl) return json(400, { error: "\u5171\u6709\u3059\u308B\u30C6\u30AD\u30B9\u30C8\u304B\u30D5\u30A1\u30A4\u30EB\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044" });
          if (dataUrl) {
            const match = dataUrl.match(/^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([a-z0-9+/=\r\n]+)$/i);
            if (!match || /^(text\/html|application\/(?:xhtml\+xml|javascript|ecmascript)|image\/svg\+xml)$/i.test(match[1]) || match[2].replace(/\s/g, "").length % 4 !== 0) return json(400, { error: "\u3053\u306E\u5F62\u5F0F\u306E\u30D5\u30A1\u30A4\u30EB\u306F\u5171\u6709\u3067\u304D\u307E\u305B\u3093" });
          }
          const shareId = id(16), hours = Math.min(24, Math.max(1, Number(p.hours) || 6));
          const item = { id: shareId, name: asText(p.name, 120) || "\u5171\u6709\u30D5\u30A1\u30A4\u30EB", type: asText(p.type, 100) || "text/plain", text, dataUrl, createdAt: now(), expiresAt: now() + hours * 60 * 60 * 1e3 };
          await setJSON(STORE_NAMES.TEMP_SHARES, `share:${shareId}`, item);
          return json(201, { id: shareId, expiresAt: item.expiresAt, url: `/Tools?locker=${shareId}` });
        }
        if (action === "lockerDelete") {
          await deleteKey(STORE_NAMES.TEMP_SHARES, `share:${asText(p.id, 32)}`);
          return json(200, { ok: true });
        }
        if (action === "translate") {
          const LANG_NAMES = { ja: "Japanese", en: "English", "zh-CN": "Simplified Chinese", "zh-TW": "Traditional Chinese", ko: "Korean", es: "Spanish", fr: "French", de: "German", pt: "Portuguese", ru: "Russian", id: "Indonesian", vi: "Vietnamese", th: "Thai", it: "Italian", ar: "Arabic", hi: "Hindi", tr: "Turkish" };
          const target = String(p.target || "");
          if (!LANG_NAMES[target]) return json(400, { error: "\u5BFE\u5FDC\u3057\u3066\u3044\u306A\u3044\u8A00\u8A9E\u3067\u3059" });
          const texts = Array.isArray(p.texts) ? p.texts.slice(0, 40).map((x) => String(x == null ? "" : x).slice(0, 2000)) : [];
          if (!texts.length) return json(200, { translations: [] });
          const sessionEmail = p.token ? await requireSession(p.token).catch(() => null) : null;
          // 画面の文言(ui)は、言語ごとの共通キャッシュを使う: 同じ文言は誰かが一度翻訳すれば、あとはAIを呼ばずに返す(速い・間隔制限に引っかからない)
          const useCache = p.ui === 1 || p.ui === true;
          const hashOf = (t) => nodeCrypto.createHash("sha1").update(t).digest("hex").slice(0, 12);
          const bundleKey = `trui:${target}`;
          let bundle = useCache ? (await getJSON(STORE_NAMES.TOOL_DATA, bundleKey).catch(() => null)) || {} : {};
          const result = new Array(texts.length).fill(null), miss = [];
          texts.forEach((t, i) => { const v = useCache && t.length <= 200 ? bundle[hashOf(t)] : null; if (v != null) result[i] = v; else miss.push(i); });
          if (miss.length) {
            if (!await rateLimit("translate", sessionEmail || ip, 700)) return json(429, { error: "\u7FFB\u8A33\u306E\u9593\u9694\u3092\u7A7A\u3051\u3066\u304F\u3060\u3055\u3044" });
            const missTexts = miss.map((i) => texts[i]);
            const raw = await callAi(JSON.stringify(missTexts), `Translate every string in the given JSON array into ${LANG_NAMES[target]}. Output ONLY a JSON array of strings with exactly the same length and order. Keep emoji, numbers, URLs, @mentions, #tags, HTML-like tokens and line breaks unchanged. If a string is already in the target language, return it unchanged. Do not add explanations.`, 3500);
            let arr = null;
            try { const m = raw.match(/\[[\s\S]*\]/); arr = m ? JSON.parse(m[0]) : null; } catch (_) { arr = null; }
            if (!Array.isArray(arr) || arr.length !== missTexts.length) return json(502, { error: "\u7FFB\u8A33\u7D50\u679C\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F" });
            miss.forEach((i, n) => { result[i] = String(arr[n] == null ? "" : arr[n]); });
            if (useCache) {
              miss.forEach((i) => { if (texts[i].length <= 200 && result[i] && result[i] !== texts[i]) bundle[hashOf(texts[i])] = result[i]; });
              const keys = Object.keys(bundle); if (keys.length > 3500) keys.slice(0, keys.length - 3000).forEach((k) => delete bundle[k]);
              await setJSON(STORE_NAMES.TOOL_DATA, bundleKey, bundle).catch(() => {});
            }
          }
          return json(200, { translations: result.map((x) => String(x == null ? "" : x)) });
        }
        const email = await requireSession(p.token);
        if (action === "getLang") { const r = await getJSON(STORE_NAMES.TOOL_DATA, `lang:${email}`); return json(200, { lang: r && r.lang || null }); }
        if (action === "setLang") {
          const lang = String(p.lang || "");
          if (!/^[a-zA-Z]{2,3}(-[A-Za-z]{2,4})?$/.test(lang)) return json(400, { error: "\u8A00\u8A9E\u304C\u4E0D\u6B63\u3067\u3059" });
          await setJSON(STORE_NAMES.TOOL_DATA, `lang:${email}`, { lang, updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
          return json(200, { ok: true, lang });
        }
        if (!email) return json(401, { error: "\u3053\u306E\u6A5F\u80FD\u306B\u306F\u30ED\u30B0\u30A4\u30F3\u304C\u5FC5\u8981\u3067\u3059" });
        if (action === "pixivInfo") {
          const m = /pixiv\.net\/(?:[a-z]{2}\/)?artworks\/(\d{1,12})/i.exec(String(p.url || ""));
          if (!m) return json(400, { error: "pixiv\u306E\u4F5C\u54C1URL(https://www.pixiv.net/artworks/\u6570\u5B57)\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044" });
          if (!await rateLimit("pixiv-info", email, 4e3)) return json(429, { error: "\u9593\u9694\u3092\u7A7A\u3051\u3066\u304B\u3089\u3082\u3046\u4E00\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044" });
          const headers = { Referer: "https://www.pixiv.net/", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", Accept: "application/json" };
          const r1 = await fetch(`https://www.pixiv.net/ajax/illust/${m[1]}`, { headers, signal: AbortSignal.timeout(12e3) }).catch(() => null);
          if (!r1 || !r1.ok) return json(502, { error: `pixiv\u304B\u3089\u60C5\u5831\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F(${r1 ? r1.status : "\u63A5\u7D9A\u5931\u6557"})\u3002\u30DC\u30C3\u30C8\u5BFE\u7B56\u7B49\u3067\u30D6\u30ED\u30C3\u30AF\u3055\u308C\u3066\u3044\u308B\u53EF\u80FD\u6027\u304C\u3042\u308A\u307E\u3059\u3002` });
          const d = await r1.json().catch(() => null); const b = d && d.body;
          if (!b || !b.urls || !b.urls.regular) return json(404, { error: "\u4F5C\u54C1\u304C\u898B\u3064\u304B\u3089\u306A\u3044\u304B\u3001\u516C\u958B\u3055\u308C\u3066\u3044\u307E\u305B\u3093" });
          if (Number(b.xRestrict) !== 0) return json(403, { error: "\u5E74\u9F62\u5236\u9650\u306E\u3042\u308B\u4F5C\u54C1\u306F\u8868\u793A\u3067\u304D\u307E\u305B\u3093" });
          let page = Math.max(0, Math.min(Number(p.page) || 0, Math.max(0, (Number(b.pageCount) || 1) - 1)));
          let imgUrl = b.urls.regular;
          if (page > 0) { const r2 = await fetch(`https://www.pixiv.net/ajax/illust/${m[1]}/pages`, { headers, signal: AbortSignal.timeout(12e3) }).catch(() => null); const d2 = r2 && r2.ok ? await r2.json().catch(() => null) : null; const u = d2 && d2.body && d2.body[page] && d2.body[page].urls && d2.body[page].urls.regular; if (u) imgUrl = u; else page = 0; }
          if (!/^https:\/\/i\.pximg\.net\/[A-Za-z0-9_\/.\-]+$/.test(imgUrl)) return json(502, { error: "\u753B\u50CFURL\u304C\u4E0D\u6B63\u3067\u3059" });
          const tok = id(16);
          await setJSON(STORE_NAMES.TOOL_DATA, `pxtok:${tok}`, { url: imgUrl, exp: now() + 36e5, by: email });
          return json(200, { id: m[1], title: String(b.illustTitle || "").slice(0, 200), author: String(b.userName || "").slice(0, 100), pages: Number(b.pageCount) || 1, page, src: `/api/tools?action=pixivImg&t=${tok}`, source: `https://www.pixiv.net/artworks/${m[1]}` });
        }
        if (action === "xgdDirect") {
          // 普通のURLを x.gd で直接短縮(リダイレクト中継なし)
          const target = String(p.target || "").trim();
          if (!/^https?:\/\/[^\s]{3,2000}$/i.test(target)) return json(400, { error: "http(s):// から始まるURLを入力してください" });
          if (!await rateLimit("xgd-direct", email, 1500)) return json(429, { error: "少し間隔を空けてください" });
          const hexKey = (v) => /^[0-9a-f]{32}$/i.test(String(v || ""));
          const userKey = String(p.xgdKey || "").trim();
          if (userKey && !hexKey(userKey)) return json(400, { error: "x.gd APIキーの形式が正しくありません（32桁の英数字）" });
          const savedXgd = await getJSON(STORE_NAMES.ADMIN_SECRETS, "xgd:apiKey").catch(() => null);
          const candidates = [];
          for (const k of [userKey, String(savedXgd && savedXgd.apiKey || "").trim()]) if (hexKey(k) && !candidates.includes(k)) candidates.push(k);
          if (!candidates.length) return json(400, { error: "x.gd APIキーが未設定です。キー欄に入力するか、運営がキーを設定してください" });
          let result = {}, failStatus = 502;
          for (const apiKey of candidates) {
            const xgd = new URL("https://xgd.io/V1/shorten");
            xgd.searchParams.set("url", target);
            xgd.searchParams.set("key", apiKey);
            const response = await fetch(xgd, { method: "GET", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12e3) }).catch(() => null);
            const r = response ? await response.json().catch(() => ({})) : {};
            if (response && response.ok && Number(r.status) === 200 && r.shorturl) { result = r; break; }
            result = r; failStatus = Number(r.status) || 502;
          }
          if (!result.shorturl) return json(failStatus, { error: result.message || "x.gdで短縮URLを発行できませんでした" });
          return json(201, { ok: true, shortUrl: result.shorturl });
        }
        if (action === "redirectCreate" || action === "xgdShorten") {
          const target = String(p.target || "").trim();
          if (!target) return json(400, { error: "\u77ED\u7E2E\u3059\u308BURL\u307E\u305F\u306FData URL\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044" });
          if (!/^(?:https?:\/\/|data:[^\s]+$)/i.test(target)) return json(400, { error: "http(s):// \u307E\u305F\u306F data: URL \u306E\u307F\u5BFE\u5FDC\u3057\u3066\u3044\u307E\u3059" });
          if (!await rateLimit("redirect-create", email, 1500)) return json(429, { error: "\u77ED\u7E2EURL\u306E\u767A\u884C\u9593\u9694\u3092\u7A7A\u3051\u3066\u304F\u3060\u3055\u3044" });
          const redirectId = id(16);
          const record = { id: redirectId, target, createdAt: (/* @__PURE__ */ new Date()).toISOString(), createdBy: email, deleted: false };
          await setJSON(STORE_NAMES.TOOL_DATA, `redirect:${redirectId}`, record);
          const redirectUrl = `${buildRedirectBase(event)}/r/${redirectId}`;
          if (action === "redirectCreate") return json(201, { ok: true, id: redirectId, url: redirectUrl, permanent: true });
          const embeddedKey = [52, 57, 53, 57, 99, 48, 97, 51, 55, 57, 54, 53, 49, 55, 53, 100, 51, 57, 48, 50, 98, 97, 100, 49, 98, 48, 100, 100, 99, 56, 56, 55].map((code) => String.fromCharCode(code)).join("");
          const hexKey = (v) => /^[0-9a-f]{32}$/i.test(String(v || ""));
          const userKey = String(p.xgdKey || "").trim();
          if (userKey && !hexKey(userKey)) return json(400, { error: "x.gd API\u30AD\u30FC\u306E\u5F62\u5F0F\u304C\u6B63\u3057\u304F\u3042\u308A\u307E\u305B\u3093\uFF0832\u6841\u306E\u82F1\u6570\u5B57\uFF09" });
          const savedXgd = await getJSON(STORE_NAMES.ADMIN_SECRETS, "xgd:apiKey").catch(() => null);
          const candidates = [];
          for (const k of [userKey, String(savedXgd && savedXgd.apiKey || "").trim(), embeddedKey]) if (hexKey(k) && !candidates.includes(k)) candidates.push(k);
          let result = {}, usedKey = "", failStatus = 502;
          for (const apiKey of candidates) {
            const xgd = new URL("https://xgd.io/V1/shorten");
            xgd.searchParams.set("url", redirectUrl);
            xgd.searchParams.set("key", apiKey);
            xgd.searchParams.set("analytics", "true");
            xgd.searchParams.set("filterbots", "true");
            const response = await fetch(xgd, { method: "GET", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12e3) }).catch(() => null);
            const r = response ? await response.json().catch(() => ({})) : {};
            if (response && response.ok && Number(r.status) === 200 && r.shorturl) { result = r; usedKey = apiKey; break; }
            result = r; failStatus = Number(r.status) || 502;
          }
          if (!result.shorturl) return json(failStatus, { error: result.message || "x.gd\u3067\u77ED\u7E2EURL\u3092\u767A\u884C\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F" });
          if (userKey && usedKey === userKey) {
            try {
              const op = await require_session().requireAdmin(p.token);
              if (op) await setJSON(STORE_NAMES.ADMIN_SECRETS, "xgd:apiKey", { apiKey: userKey, updatedAt: (/* @__PURE__ */ new Date()).toISOString(), updatedBy: op.email });
            } catch (_) {
            }
          }
          await setJSON(STORE_NAMES.TOOL_DATA, `redirect:${redirectId}`, { ...record, xgdUrl: result.shorturl, xgdCreatedAt: (/* @__PURE__ */ new Date()).toISOString() });
          return json(201, { ok: true, id: redirectId, redirectUrl, shortUrl: result.shorturl, permanent: true, analytics: result.analytics, keySource: usedKey === userKey ? "input" : usedKey === embeddedKey ? "builtin" : "saved" });
        }
        if (action === "siteSource") {
          const raw = asText(p.url, 2048);
          if (!raw) return json(400, { error: "\u30B5\u30A4\u30C8URL\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044" });
          if (!await rateLimit("site-source", `${email}:${ip}`, 3e4)) return json(429, { error: "\u30B5\u30A4\u30C8\u53D6\u5F97\u306F30\u79D2\u4EE5\u4E0A\u9593\u9694\u3092\u7A7A\u3051\u3066\u304F\u3060\u3055\u3044" });
          const result = await crawlPublicSite(raw);
          return json(200, result);
        }
        if (action === "boxCreate") {
          const slug = asText(p.slug, 32).toLowerCase();
          if (!/^[a-z0-9][a-z0-9-]{2,30}$/.test(slug)) return json(400, { error: "URL ID\u306F\u82F1\u5C0F\u6587\u5B57\u30FB\u6570\u5B57\u30FB\u30CF\u30A4\u30D5\u30F3\u306E3\u301C31\u6587\u5B57\u306B\u3057\u3066\u304F\u3060\u3055\u3044" });
          const owned = await getJSON(STORE_NAMES.ANON_BOXES, `owner:${email}`);
          if (owned && owned.slug !== slug) return json(409, { error: `\u3059\u3067\u306B\u533F\u540D\u7BB1\u304C\u3042\u308A\u307E\u3059: ${owned.slug}\u3002\u65E2\u5B58\u306E\u53D7\u4FE1\u30DA\u30FC\u30B8\u3092\u5229\u7528\u3057\u3066\u304F\u3060\u3055\u3044\u3002` });
          const existing = await getJSON(STORE_NAMES.ANON_BOXES, `box:${slug}`);
          if (existing && existing.ownerEmail !== email) return json(409, { error: "\u3053\u306EURL ID\u306F\u4F7F\u7528\u3055\u308C\u3066\u3044\u307E\u3059" });
          const box = { slug, ownerEmail: email, displayName: asText(p.displayName, 60) || email.split("@")[0], message: asText(p.message, 200), createdAt: existing?.createdAt || (/* @__PURE__ */ new Date()).toISOString() };
          await setJSON(STORE_NAMES.ANON_BOXES, `box:${slug}`, box);
          await setJSON(STORE_NAMES.ANON_BOXES, `owner:${email}`, box);
          return json(200, { box: { slug, displayName: box.displayName, message: box.message }, url: `/Tools?anon=${slug}` });
        }
        if (action === "boxDelete") {
          const box = await getJSON(STORE_NAMES.ANON_BOXES, `owner:${email}`);
          if (!box) return json(404, { error: "\u30DC\u30C3\u30AF\u30B9\u304C\u3042\u308A\u307E\u305B\u3093" });
          await deleteKey(STORE_NAMES.ANON_BOXES, `box:${box.slug}`);
          await deleteKey(STORE_NAMES.ANON_BOXES, `owner:${email}`);
          await deleteKey(STORE_NAMES.ANON_BOXES, `messages:${box.slug}`);
          return json(200, { ok: true });
        }
        if (action === "inboxDelete") {
          const box = await getJSON(STORE_NAMES.ANON_BOXES, `owner:${email}`);
          if (!box) return json(404, { error: "\u30DC\u30C3\u30AF\u30B9\u304C\u3042\u308A\u307E\u305B\u3093" });
          const key = `messages:${box.slug}`, rows = await getJSON(STORE_NAMES.ANON_BOXES, key) || [];
          await setJSON(STORE_NAMES.ANON_BOXES, key, rows.filter((x) => x.id !== p.messageId));
          return json(200, { ok: true });
        }
        if (action === "counsel") {
          const text = asText(p.text, 2500);
          if (!text) return json(400, { error: "\u76F8\u8AC7\u5185\u5BB9\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044" });
          const character = ["tsundere", "kansai", "philosopher", "gentle"].includes(p.character) ? p.character : "gentle";
          const personas = { tsundere: "\u5C11\u3057\u30C4\u30F3\u30C7\u30EC\u3060\u304C\u3001\u76F8\u624B\u3092\u50B7\u3064\u3051\u305A\u89AA\u8EAB\u306A\u65E5\u672C\u8A9E\u306E\u76F8\u8AC7\u76F8\u624B\u3002\u7167\u308C\u96A0\u3057\u306E\u77ED\u3044\u8A00\u3044\u56DE\u3057\u306F\u3088\u3044\u304C\u3001\u4FAE\u8FB1\u3057\u306A\u3044\u3002", kansai: "\u81EA\u7136\u306A\u95A2\u897F\u5F01\u3067\u8A71\u3059\u3001\u6E29\u304B\u304F\u73FE\u5B9F\u7684\u306A\u76F8\u8AC7\u76F8\u624B\u3002\u6C7A\u3081\u3064\u3051\u305A\u3001\u8CEA\u554F\u3092\u4E00\u3064\u6DFB\u3048\u308B\u3002", philosopher: "\u54F2\u5B66\u7684\u306A\u554F\u3044\u8FD4\u3057\u3067\u8996\u70B9\u3092\u5E83\u3052\u308B\u76F8\u8AC7\u76F8\u624B\u3002\u96E3\u89E3\u306B\u3057\u3059\u304E\u305A\u3001\u5177\u4F53\u7684\u306A\u4E00\u6B69\u306B\u623B\u3059\u3002", gentle: "\u7A4F\u3084\u304B\u3067\u5171\u611F\u7684\u306A\u76F8\u8AC7\u76F8\u624B\u3002\u307E\u305A\u6C17\u6301\u3061\u3092\u53D7\u3051\u6B62\u3081\u3001\u9078\u629E\u80A2\u3068\u5C0F\u3055\u306A\u6B21\u306E\u4E00\u6B69\u3092\u63D0\u6848\u3059\u308B\u3002" };
          const answer = await callAi(text, `${personas[character]} \u533B\u5E2B\u30FB\u5F01\u8B77\u58EB\u30FB\u5C02\u9580\u5BB6\u306E\u8A3A\u65AD\u3092\u88C5\u308F\u305A\u3001\u5371\u967A\u3092\u65AD\u5B9A\u3057\u306A\u3044\u3002\u81EA\u50B7\u30FB\u8650\u5F85\u30FB\u5DEE\u3057\u8FEB\u3063\u305F\u5371\u967A\u304C\u793A\u5506\u3055\u308C\u305F\u3089\u3001\u8CAC\u3081\u305A\u306B\u5B89\u5168\u306A\u5834\u6240\u3078\u79FB\u52D5\u3057\u3001\u4FE1\u983C\u3067\u304D\u308B\u4EBA\u3084\u65E5\u672C\u306E\u7DCA\u6025\u7A93\u53E3\u3078\u4ECA\u3059\u3050\u76F8\u8AC7\u3059\u308B\u3088\u3046\u52E7\u3081\u308B\u3002\u7DCA\u6025\u6642\u306F119/110\u3002\u500B\u4EBA\u60C5\u5831\u3092\u5C0B\u306D\u306A\u3044\u3002`, 950);
          return json(200, { answer });
        }
        if (action === "recommend") {
          const likes = Array.isArray(p.likes) ? p.likes.map((x) => asText(x, 120)).filter(Boolean).slice(0, 15) : [];
          if (!likes.length) return json(400, { error: "\u597D\u304D\u306A\u4F5C\u54C1\u30921\u3064\u4EE5\u4E0A\u767B\u9332\u3057\u3066\u304F\u3060\u3055\u3044" });
          const answer = await callAi(`\u597D\u304D\u306A\u4F5C\u54C1: ${likes.join("\u3001")}
\u30B8\u30E3\u30F3\u30EB: ${asText(p.kind, 40) || "\u6620\u753B\u30FB\u672C\u3069\u3061\u3089\u3067\u3082"}
\u65E2\u51FA\u5019\u88DC: ${asText(p.exclude, 600)}`, "\u65E5\u672C\u8A9E\u306E\u4F5C\u54C1\u30EC\u30B3\u30E1\u30F3\u30C9\u62C5\u5F53\u3002\u597D\u307F\u306E\u5171\u901A\u70B9\u3092\u77ED\u304F\u63A8\u5B9A\u3057\u3001\u5B9F\u5728\u3059\u308B\u6620\u753B\u30FB\u5C0F\u8AAC\u30FB\u6F2B\u753B\u304B\u3089\u65B0\u3057\u3044\u304A\u3059\u3059\u3081\u3092\u6700\u59275\u4EF6\u3001\u4F5C\u54C1\u540D\u30FB\u4F5C\u8005/\u76E3\u7763\u30FB\u9078\u3093\u3060\u7406\u7531\u306E\u5F62\u5F0F\u3067\u63D0\u6848\u3059\u308B\u3002\u78BA\u4FE1\u306E\u306A\u3044\u4F5C\u54C1\u60C5\u5831\u3092\u634F\u9020\u305B\u305A\u3001\u63A8\u6E2C\u306F\u305D\u306E\u65E8\u3092\u793A\u3059\u3002", 1e3);
          return json(200, { answer });
        }
        if (action === "meal") {
          const foods = asText(p.foods, 1200);
          if (!foods) return json(400, { error: "\u98DF\u6750\u540D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044" });
          const answer = await callAi(`\u98DF\u6750: ${foods}
\u671F\u9650\u304C\u8FD1\u3044\u98DF\u6750: ${asText(p.soon, 600)}
\u907F\u3051\u305F\u3044\u98DF\u6750: ${asText(p.avoid, 300)}`, "\u5BB6\u5EAD\u5411\u3051\u732E\u7ACB\u63D0\u6848\u3002\u5165\u529B\u98DF\u6750\u3092\u512A\u5148\u3057\u3001\u7C21\u5358\u306A\u6599\u7406\u3092\u6700\u59273\u6848\u3001\u6750\u6599\u30FB\u624B\u9806\u30FB\u76EE\u5B89\u6642\u9593\u4ED8\u304D\u3067\u65E5\u672C\u8A9E\u56DE\u7B54\u3002\u30A2\u30EC\u30EB\u30AE\u30FC\u3092\u63A8\u6E2C\u305B\u305A\u3001\u98DF\u54C1\u5B89\u5168\u3084\u6804\u990A\u306B\u3064\u3044\u3066\u533B\u7642\u7684\u306A\u65AD\u5B9A\u3092\u3057\u306A\u3044\u3002", 900);
          return json(200, { answer });
        }
        if (action === "wikiCreate" || action === "wikiUpdate" || action === "wikiDelete") {
          const pageId = asText(p.id, 32) || id(8);
          let page = await getJSON(STORE_NAMES.WIKI, `wiki:${pageId}`);
          if (action !== "wikiCreate" && (!page || page.deleted)) return json(404, { error: "\u30DA\u30FC\u30B8\u304C\u3042\u308A\u307E\u305B\u3093" });
          if (page && page.ownerEmail !== email) return json(403, { error: "\u4F5C\u6210\u8005\u306E\u307F\u7DE8\u96C6\u3067\u304D\u307E\u3059" });
          if (action === "wikiDelete") {
            page.deleted = true;
            page.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
            await setJSON(STORE_NAMES.WIKI, `wiki:${pageId}`, page);
            return json(200, { ok: true });
          }
          const title = asText(p.title, 120), body = asText(p.body, 15e3);
          if (!title || !body) return json(400, { error: "\u30BF\u30A4\u30C8\u30EB\u3068\u672C\u6587\u304C\u5FC5\u8981\u3067\u3059" });
          page = { id: pageId, title, body, summary: asText(body.replace(/[#*_`>\n]/g, " "), 180), ownerEmail: email, authorName: email.split("@")[0], createdAt: page?.createdAt || (/* @__PURE__ */ new Date()).toISOString(), updatedAt: (/* @__PURE__ */ new Date()).toISOString(), deleted: false };
          await setJSON(STORE_NAMES.WIKI, `wiki:${pageId}`, page);
          return json(200, { page });
        }
        if (action === "linkCheck") {
          const raw = asText(p.url, 2048);
          if (!raw) return json(400, { error: "URL\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044" });
          const base = await publicHttpUrl(raw);
          const response = await requestPublicResource(base, { allowHttp: true, maxRedirects: 0, maxBytes: 5e5, timeoutMs: 8e3 });
          if (response.status !== 200 && response.status !== 206) return json(200, { ok: false, status: response.status, error: `\u30C8\u30C3\u30D7\u30DA\u30FC\u30B8\u53D6\u5F97\u5931\u6557 (HTTP ${response.status})` });
          const source = response.body.toString("utf8");
          const links = [...source.matchAll(/\b(?:href|src)\s*=\s*(["'])(.*?)\1/gi)].map((m) => m[2]).filter((h) => h && !h.startsWith("#") && !/^(javascript:|mailto:|tel:|data:)/i.test(h));
          const uniq = [...new Set(links)].slice(0, 25), results = [];
          for (const href of uniq) {
            try {
              const u = new URL(href, response.url);
              if (!["http:", "https:"].includes(u.protocol)) continue;
              await publicHttpUrl(u.href);
              let r = await requestPublicResource(u, { allowHttp: true, method: "HEAD", maxRedirects: 0, maxBytes: 0, timeoutMs: 5e3 });
              if (r.status === 405 || r.status === 501) r = await requestPublicResource(u, { allowHttp: true, method: "GET", maxRedirects: 0, maxBytes: 0, timeoutMs: 5e3 });
              results.push({ url: u.href, status: r.status, ok: r.status >= 200 && r.status < 300 });
            } catch (e) {
              results.push({ url: href, status: 0, ok: false, error: e.message || "\u63A5\u7D9A\u306B\u5931\u6557\u3057\u307E\u3057\u305F" });
            }
          }
          return json(200, { url: `${base.origin}${base.pathname}`, checked: results.length, results });
        }
        if (action === "ogpCheck") {
          const raw = asText(p.url, 2048);
          if (!raw) return json(400, { error: "URL\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044" });
          const base = await publicHttpUrl(raw);
          const response = await requestPublicResource(base, { allowHttp: true, maxRedirects: 0, maxBytes: 5e5, timeoutMs: 8e3 });
          if (response.status !== 200 && response.status !== 206) return json(200, { ok: false, status: response.status, error: `\u30DA\u30FC\u30B8\u53D6\u5F97\u5931\u6557 (HTTP ${response.status})` });
          const html = response.body.toString("utf8");
          const head = html.slice(0, 2e5);
          const decode = (v) => String(v || "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'").trim();
          const attrsOf = (tag) => { const out = {}; for (const m of tag.matchAll(/([a-zA-Z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) out[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? ""); return out; };
          const meta = {};
          for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
            const a = attrsOf(m[0]);
            const key = String(a.property || a.name || "").toLowerCase();
            if (key && a.content !== void 0 && !(key in meta)) meta[key] = a.content;
          }
          const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head);
          let canonical = "";
          for (const m of head.matchAll(/<link\b[^>]*>/gi)) { const a = attrsOf(m[0]); if (/\bcanonical\b/i.test(a.rel || "") && a.href) { canonical = a.href; break; } }
          const absolute = (v) => { try { return v ? new URL(v, response.url).href : ""; } catch { return ""; } };
          const ogp = {};
          for (const [k, v] of Object.entries(meta)) if (k.startsWith("og:")) ogp[k] = v;
          const twitter = {};
          for (const [k, v] of Object.entries(meta)) if (k.startsWith("twitter:")) twitter[k] = v;
          const image = absolute(meta["og:image"] || meta["twitter:image"] || "");
          const issues = [];
          for (const need of ["og:title", "og:description", "og:image", "og:url", "og:type"]) if (!meta[need]) issues.push(`${need} \u304C\u3042\u308A\u307E\u305B\u3093`);
          if (!meta["twitter:card"]) issues.push("twitter:card \u304C\u3042\u308A\u307E\u305B\u3093");
          if (meta["og:image"] && !/^https?:\/\//i.test(meta["og:image"])) issues.push("og:image \u306F\u7D76\u5BFEURL\uFF08https://\uFF09\u306B\u3059\u308B\u3053\u3068\u3092\u304A\u3059\u3059\u3081\u3057\u307E\u3059");
          if (meta["og:title"] && meta["og:title"].length > 70) issues.push("og:title \u304C\u9577\u3059\u304E\u307E\u3059\uFF0870\u6587\u5B57\u7A0B\u5EA6\u307E\u3067\u63A8\u5968\uFF09");
          if (meta["og:description"] && meta["og:description"].length > 200) issues.push("og:description \u304C\u9577\u3059\u304E\u307E\u3059\uFF08200\u6587\u5B57\u7A0B\u5EA6\u307E\u3067\u63A8\u5968\uFF09");
          return json(200, { ok: true, url: response.url, status: response.status, title: decode(titleTag ? titleTag[1] : ""), description: meta.description || "", canonical: absolute(canonical), ogp, twitter, image, issues });
        }
        return json(400, { error: "\u4E0D\u660E\u306Aaction\u3067\u3059" });
      } catch (error) {
        console.error("tools function error", action, error);
        const status = error instanceof PublicSiteError ? error.statusCode : action === "linkCheck" || action === "siteSource" ? 400 : 500;
        return json(status, { error: error.message || "\u5185\u90E8\u30A8\u30E9\u30FC" });
      }
    };
  }
});

// entries/tools-3nz0v.mjs
var import_tools = __toESM(require_tools(), 1);

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

// entries/tools-3nz0v.mjs
var handler = import_tools.default.handler || import_tools.default.default && import_tools.default.default.handler;
var __onRequest = wrap(handler, {});

export async function onRequest(context) {
  return __onRequest(context);
}
