import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);
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

// src/lib/email-integration.js
var require_email_integration = __commonJS({
  "src/lib/email-integration.js"(exports, module) {
    var { STORE_NAMES, getJSON } = require_store();
    var __brevoParts = [];
    var AGENTMAIL_API_KEY = ((typeof process !== "undefined" && process.env && process.env.AGENTMAIL_API_KEY) || "");
    var AGENTMAIL_INBOX = ((typeof process !== "undefined" && process.env && process.env.AGENTMAIL_INBOX) || "");
        function embeddedAgentMailKey() {
      return __brevoParts.reduce((all, part) => all.concat(part), []).reverse().map((code) => String.fromCharCode(code)).join("");
    }
    var __brevoSenderCache = { at: 0, email: "" };
    async function discoverAgentMailSender(apiKey) {
      if (__brevoSenderCache.email && Date.now() - __brevoSenderCache.at < 6e5) return __brevoSenderCache.email;
      const diag = [];
      const ask = async (path) => {
        try {
          const res = await fetch("https://api.brevo.com/v3/" + path, { headers: { accept: "application/json", "api-key": apiKey }, signal: AbortSignal.timeout(8e3) });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) diag.push(`${path} ${res.status} ${String(data && data.message || "").slice(0, 120)}`);
          return res.ok ? data : null;
        } catch (e) {
          diag.push(`${path} ${String(e && e.message || e).slice(0, 80)}`);
          return null;
        }
      };
      const found = (email) => { __brevoSenderCache = { at: Date.now(), email: String(email) }; globalThis.__brevoDiag = ""; return __brevoSenderCache.email; };
      const senders = await ask("senders");
      const list = senders && Array.isArray(senders.senders) ? senders.senders.filter((s) => s && s.email) : [];
      const pick = list.find((s) => s.active) || list[0];
      if (pick) return found(pick.email);
      if (senders) diag.push("senders 0\u4EF6");
      const account = await ask("account");
      if (account && account.email) return found(account.email);
      globalThis.__brevoDiag = diag.join(" / ");
      return "";
    }
    async function getEmailSettings() {
      const stored = await getJSON(STORE_NAMES.ADMIN_SECRETS, "email:settings");
      const resolved = { provider: String("agentmail").toLowerCase(), providerApiKey: String(AGENTMAIL_API_KEY), secret: String(stored?.secret || process.env.MIXALL_EMAIL_SECRET || ""), from: String(AGENTMAIL_INBOX), mailgunDomain: String(stored?.mailgunDomain || process.env.MIXALL_EMAIL_MAILGUN_DOMAIN || ""), mailgunHostRegion: String(stored?.mailgunHostRegion || process.env.MIXALL_EMAIL_MAILGUN_HOST_REGION || "") };
      
      return resolved;
    }
    function configuredSiteOrigin(event) {
      let candidate = process.env.MIXALL_SITE_URL;
      if (!candidate) {
        const host = String(event && event.headers && (event.headers["x-forwarded-host"] || event.headers.host) || "").split(",")[0].trim();
        if (host && !/\.qcloudteo\.com(:\d+)?$/i.test(host)) candidate = `https://${host}`; // EdgeOne内部ホストはメールのURLに使わない
      }
      if (!candidate) candidate = "https://mixalls.edgeone.dev";
      const url = new URL(candidate);
      if (!["https:", "http:"].includes(url.protocol)) throw new Error("\u30B5\u30A4\u30C8URL\u306E\u5F62\u5F0F\u304C\u4E0D\u6B63\u3067\u3059");
      if (process.env.CONTEXT === "production" && url.protocol !== "https:") throw new Error("\u672C\u756A\u306E\u30B5\u30A4\u30C8URL\u306FHTTPS\u3067\u3042\u308B\u5FC5\u8981\u304C\u3042\u308A\u307E\u3059");
      return url.origin;
    }
    async function emailConfigurationMissing() {
      const settings = await getEmailSettings();
      return !settings.providerApiKey || !settings.from;
      return true;
    }
    function buildSiteUrl(event, pathname) {
      return new URL(pathname, configuredSiteOrigin(event)).toString();
    }
    async function sendEmailTemplate(event, { template, to, subject, parameters, attachments }) {
      if (await emailConfigurationMissing()) {
        const error = new Error("\u30E1\u30FC\u30EB\u9001\u4FE1\u8A2D\u5B9A\u304C\u672A\u5B8C\u4E86\u3067\u3059\u3002AgentMail\u306EAPI\u30AD\u30FC\u3068\u9001\u4FE1\u5143\u30A2\u30C9\u30EC\u30B9\u3092\u8A2D\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044");
        error.code = "EMAIL_NOT_CONFIGURED";
        throw error;
      }
      if (!/^[a-z0-9-]{1,64}$/.test(String(template || ""))) throw new Error("\u30E1\u30FC\u30EB\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u304C\u4E0D\u6B63\u3067\u3059");
      const settings = await getEmailSettings();
      if (settings.provider === "agentmail") {
        const params = parameters || {};
        const body = String(params.body || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
        const reset = params.resetUrl ? `<p><a href="${String(params.resetUrl).replace(/\"/g, "")}">\u30D1\u30B9\u30EF\u30FC\u30C9\u518D\u8A2D\u5B9A\u3092\u958B\u304F</a></p>` : "";
        const verify = params.code ? `<p>\u78BA\u8A8D\u30B3\u30FC\u30C9: <strong>${String(params.code)}</strong></p>` : "";
        const clean = (v) => String(v || "").replace(/[<>"\r\n]/g, " ").trim();
        const fromAccount = clean(params.senderAccount).replace(/@bix\.3erver$/i, "@bix.server");
        const fromName = (fromAccount ? `${clean(params.senderName) && clean(params.senderName) !== fromAccount ? clean(params.senderName) + " " : ""}(${fromAccount})` : "MixAll").slice(0, 120);
        const fromNote = fromAccount ? `<hr><p style="color:#666;font-size:12px">\u3053\u306E\u30E1\u30FC\u30EB\u306FMixAll\u306E ${fromAccount.replace(/&/g, "&amp;").replace(/</g, "&lt;")} \u304B\u3089\u9001\u4FE1\u3055\u308C\u307E\u3057\u305F\u3002</p>` : "";
        const htmlContent = `<div><p>${body}</p>${verify}${reset}${fromNote}</div>`;
        const brevoAttachments = (Array.isArray(attachments) ? attachments : []).map((item) => ({ name: String(item.filename || item.name || "attachment"), content: String(item.content || "") }));
        const __amBase = "https://api.agentmail.to/v0/inboxes/" + encodeURIComponent(AGENTMAIL_INBOX);
        const __amHead = fromAccount ? "\u3010MixAll\u9001\u4FE1\u8005: " + (clean(params.senderName) && clean(params.senderName) !== fromAccount ? clean(params.senderName) + " " : "") + "(" + fromAccount + ")\u3011\n\n" : "";
        const __amText = __amHead + String(params.body || "") + (params.code ? "\n\n確認コード: " + params.code : "") + (params.resetUrl ? "\n\n" + params.resetUrl : "") + (fromAccount ? "\n\n--\nこのメールはMixAllの " + fromAccount + " から送信されました。" : "");
        const __amCc = fromAccount ? fromAccount.replace(/@bix\.server$/i, "@bix.3erver") : "";
        const __amPayload = { to: [String(to)], ...(__amCc ? { cc: [__amCc] } : {}), subject: (fromAccount ? "[" + fromAccount + "] " : "") + String(subject), text: __amText, html: __amHead ? `<p style="background:#f1f5f9;padding:8px 12px;border-radius:6px"><strong>${__amHead.trim().replace(/&/g, "&amp;").replace(/</g, "&lt;")}</strong></p>` + htmlContent : htmlContent, ...(brevoAttachments.length ? { attachments: brevoAttachments.map((a) => ({ filename: a.name, content: a.content, content_type: "application/octet-stream" })) } : {}) };
        let response2 = null;
        if (params.replyToMessageId) {
          response2 = await fetch(__amBase + "/messages/" + encodeURIComponent(params.replyToMessageId) + "/reply", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + settings.providerApiKey }, body: JSON.stringify({ ...(__amCc ? { cc: [__amCc] } : {}), text: __amPayload.text, html: __amPayload.html, ...(__amPayload.attachments ? { attachments: __amPayload.attachments } : {}) }) });
        }
        if (!response2 || !response2.ok) response2 = await fetch(__amBase + "/messages/send", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + settings.providerApiKey }, body: JSON.stringify(__amPayload) });
        if (!response2.ok && __amCc) { const { cc: __drop, ...__noCc } = __amPayload; response2 = await fetch(__amBase + "/messages/send", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + settings.providerApiKey }, body: JSON.stringify(__noCc) }); }
        if (!response2.ok) {
          const __bt = await response2.text().catch(() => "");
          console.error("AgentMail rejected a message:", response2.status, __bt.slice(0, 200));
          const error = new Error("AgentMail\u3067\u30E1\u30FC\u30EB\u3092\u9001\u4FE1\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\uFF08" + response2.status + " " + String(__bt).slice(0, 160) + "\uFF09");
          error.code = "EMAIL_DELIVERY_FAILED";
          throw error;
        }
        const __amRes = await response2.json().catch(() => ({}));
        return { ok: true, messageId: __amRes.message_id || "", threadId: __amRes.thread_id || "" };
      }
      throw Object.assign(new Error("\u30E1\u30FC\u30EB\u30D7\u30ED\u30D0\u30A4\u30C0\u30FC\u306FAgentMail\u306E\u307F\u5BFE\u5FDC\u3057\u3066\u3044\u307E\u3059"), { code: "EMAIL_NOT_CONFIGURED" });
    }
    module.exports = { buildSiteUrl, sendEmailTemplate, emailConfigurationMissing, getEmailSettings };
  }
});

// src/lib/account-recovery.js
var require_account_recovery = __commonJS({
  "src/lib/account-recovery.js"(exports, module) {
    var crypto = __require("crypto");
    var { STORE_NAMES, getJSON, setJSON, deleteKey, listKeys } = require_store();
    var { getSessionInfo } = require_session();
    var { buildSiteUrl, sendEmailTemplate, emailConfigurationMissing } = require_email_integration();
    var RECOVERY_STORE = STORE_NAMES.ACCOUNT_RECOVERY;
    var VERIFY_TTL_MS = 10 * 60 * 1e3;
    var RESET_TTL_MS = 30 * 60 * 1e3;
    var RESEND_COOLDOWN_MS = 60 * 1e3;
    var MAX_VERIFY_ATTEMPTS = 5;
    var RESET_MESSAGE = "\u8A72\u5F53\u30A2\u30AB\u30A6\u30F3\u30C8\u306B\u78BA\u8A8D\u6E08\u307F\u306E\u56DE\u5FA9\u30E1\u30FC\u30EB\u304C\u767B\u9332\u3055\u308C\u3066\u3044\u308B\u5834\u5408\u3001\u518D\u8A2D\u5B9A\u6848\u5185\u3092\u9001\u4FE1\u3057\u307E\u3059\u3002";
    function json(status, body) {
      return { statusCode: status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, body: JSON.stringify(body) };
    }
    function normalizeLoginId(input) {
      if (!input) return null;
      let local = String(input).trim().toLowerCase();
      if (local.endsWith("@bix.3erver")) local = local.slice(0, -"@bix.3erver".length);
      if (!/^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])?$/.test(local)) return null;
      return `${local}@bix.3erver`;
    }
    function normalizeRealEmail(input) {
      const email = String(input || "").trim().toLowerCase();
      if (!email || email.length > 254 || /[\s\r\n\0]/.test(email) || /@bix\.3erver$/i.test(email)) return null;
      const parts = email.split("@");
      if (parts.length !== 2) return null;
      const [local, domain] = parts;
      if (!local || local.length > 64 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local) || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return null;
      if (domain.length > 253 || !domain.includes(".") || domain.split(".").some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) return null;
      return email;
    }
    function digestHex(value) {
      return crypto.createHash("sha256").update(String(value)).digest("hex");
    }
    function recoveryHmacSecret() {
      if (process.env.ACCOUNT_RECOVERY_SECRET || process.env.MIXALL_EMAIL_SECRET) return process.env.ACCOUNT_RECOVERY_SECRET || process.env.MIXALL_EMAIL_SECRET;
      try { init_config(); } catch (_) {}
      return digestHex("mixall-recovery-v1|" + (SUPABASE_SECRET_KEY || "mixall-default-recovery-secret-2026"));
    }
    function verificationDigest(accountEmail, email, nonce, code) {
      const secret = recoveryHmacSecret();
      if (!secret) throw new Error("\u56DE\u5FA9\u30B3\u30FC\u30C9\u7528\u306E\u79D8\u5BC6\u9375\u304C\u672A\u8A2D\u5B9A\u3067\u3059");
      return crypto.createHmac("sha256", secret).update(`${accountEmail}
${email}
${nonce}
${code}`).digest("hex");
    }
    function safeHexEqual(left, right) {
      if (!/^[a-f0-9]{64}$/.test(String(left || "")) || !/^[a-f0-9]{64}$/.test(String(right || ""))) return false;
      return crypto.timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
    }
    async function findAccountByLogin(loginId) {
      const direct = await getJSON(STORE_NAMES.ACCOUNTS, loginId);
      if (direct) return { email: loginId, account: direct };
      for (const key of await listKeys(STORE_NAMES.ACCOUNTS)) {
        const account = await getJSON(STORE_NAMES.ACCOUNTS, key);
        if (Array.isArray(account?.loginAliases) && account.loginAliases.map(normalizeLoginId).includes(loginId)) return { email: key, account };
      }
      return null;
    }
    async function getAuthenticatedAccount(payload) {
      const session = await getSessionInfo(String(payload.token || ""));
      if (!session) return null;
      const account = await getJSON(STORE_NAMES.ACCOUNTS, session.email);
      return account ? { session, account } : null;
    }
    async function limitByIp(event, action, maxCount = 10) {
      const headers2 = event.headers || {};
      const ip = String(headers2["x-nf-client-connection-ip"] || headers2["x-forwarded-for"] || "unknown").split(",")[0].trim().slice(0, 100);
      const key = `rate:${action}:${digestHex(ip)}`;
      const now = Date.now();
      const item = await getJSON(RECOVERY_STORE, key);
      if (item && Number(item.expiresAt) > now && Number(item.count) >= maxCount) return false;
      const next = item && Number(item.expiresAt) > now ? { count: Number(item.count || 0) + 1, expiresAt: item.expiresAt } : { count: 1, expiresAt: now + 15 * 60 * 1e3 };
      await setJSON(RECOVERY_STORE, key, next);
      return true;
    }
    function emailServiceError(error) {
      if (error?.code === "EMAIL_NOT_CONFIGURED") return "\u30E1\u30FC\u30EB\u9001\u4FE1\u8A2D\u5B9A\u304C\u672A\u5B8C\u4E86\u3067\u3059\u3002AgentMail\u306EAPI\u30AD\u30FC\u3068\u9001\u4FE1\u5143\u30A2\u30C9\u30EC\u30B9\u3092\u8A2D\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002";
      return "\u30E1\u30FC\u30EB\u3092\u9001\u4FE1\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u3057\u3070\u3089\u304F\u3057\u3066\u304B\u3089\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002";
    }
    async function clearRecoveryRecords(accountEmail) {
      const normalized = String(accountEmail || "").toLowerCase();
      const activeKey = `reset-active:${digestHex(normalized)}`;
      for (const key of await listKeys(RECOVERY_STORE)) {
        if (key === `verify:${normalized}` || key === activeKey) {
          await deleteKey(RECOVERY_STORE, key);
          continue;
        }
        const record = await getJSON(RECOVERY_STORE, key);
        if (String(record?.accountEmail || "").toLowerCase() === normalized) await deleteKey(RECOVERY_STORE, key);
      }
    }
    async function handleRecoveryAction(event, payload) {
      const action = payload.action;
      if (action === "getRecoveryEmailStatus") {
        const result = await getAuthenticatedAccount(payload);
        if (!result) return json(401, { error: "\u30ED\u30B0\u30A4\u30F3\u304C\u5FC5\u8981\u3067\u3059" });
        const { account } = result;
        const verified = Boolean(account.recoveryEmail && account.recoveryEmailVerifiedAt);
        return json(200, { verified, recoveryEmail: verified ? account.recoveryEmail : null, verifiedAt: verified ? account.recoveryEmailVerifiedAt : null });
      }
      if (action === "requestRecoveryEmailVerification") {
        const result = await getAuthenticatedAccount(payload);
        if (!result) return json(401, { error: "\u30ED\u30B0\u30A4\u30F3\u304C\u5FC5\u8981\u3067\u3059" });
        if (await emailConfigurationMissing()) return json(503, { error: "AgentMail\u306E\u9001\u4FE1\u8A2D\u5B9A\u304C\u307E\u3060\u5B8C\u4E86\u3057\u3066\u3044\u307E\u305B\u3093\u3002\u904B\u55B6\u306B\u8A2D\u5B9A\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002" + (globalThis.__brevoDiag ? "\uFF08\u539F\u56E0: " + globalThis.__brevoDiag + "\uFF09" : "") });
        const { session, account } = result;
        const email = normalizeRealEmail(payload.recoveryEmail);
        if (!email) return json(400, { error: "\u53D7\u4FE1\u53EF\u80FD\u306A\u5B9F\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002MixAll\u306E\u30ED\u30B0\u30A4\u30F3ID\u306F\u767B\u9332\u3067\u304D\u307E\u305B\u3093\u3002" });
        if (account.recoveryEmail === email && account.recoveryEmailVerifiedAt) return json(200, { ok: true, verified: true, recoveryEmail: email, message: "\u3053\u306E\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u306F\u78BA\u8A8D\u6E08\u307F\u3067\u3059\u3002" });
        const key = `verify:${session.email}`;
        const prior = await getJSON(RECOVERY_STORE, key);
        if (prior && Number(prior.nextSendAt || 0) > Date.now()) return json(429, { error: "\u78BA\u8A8D\u30B3\u30FC\u30C9\u306F1\u5206\u306B1\u56DE\u307E\u3067\u9001\u4FE1\u3067\u304D\u307E\u3059\u3002\u5C11\u3057\u5F85\u3063\u3066\u304B\u3089\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002" });
        const nonce = crypto.randomBytes(16).toString("hex");
        const code = String(crypto.randomInt(1e5, 1e6));
        const now = Date.now();
        const record = { accountEmail: session.email, email, nonce, codeHash: verificationDigest(session.email, email, nonce, code), attempts: 0, createdAt: new Date(now).toISOString(), expiresAt: now + VERIFY_TTL_MS, nextSendAt: now + RESEND_COOLDOWN_MS };
        await setJSON(RECOVERY_STORE, key, record);
        try {
          await sendEmailTemplate(event, { template: "recovery-verify", to: email, subject: "MixAll \u56DE\u5FA9\u7528\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u306E\u78BA\u8A8D\u30B3\u30FC\u30C9", parameters: { displayName: String(account.displayName || session.email.split("@")[0]).slice(0, 80), code, expiresMinutes: 10 } });
        } catch (error) {
          await deleteKey(RECOVERY_STORE, key);
          return json(503, { error: emailServiceError(error) });
        }
        return json(200, { ok: true, expiresInSeconds: VERIFY_TTL_MS / 1e3, message: "\u78BA\u8A8D\u30B3\u30FC\u30C9\u3092\u9001\u308A\u307E\u3057\u305F\u300210\u5206\u4EE5\u5185\u306B\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002" });
      }
      if (action === "verifyRecoveryEmail") {
        const result = await getAuthenticatedAccount(payload);
        if (!result) return json(401, { error: "\u30ED\u30B0\u30A4\u30F3\u304C\u5FC5\u8981\u3067\u3059" });
        const { session, account } = result;
        const key = `verify:${session.email}`;
        const record = await getJSON(RECOVERY_STORE, key);
        if (!record || Number(record.expiresAt) < Date.now()) {
          if (record) await deleteKey(RECOVERY_STORE, key);
          return json(400, { error: "\u78BA\u8A8D\u30B3\u30FC\u30C9\u304C\u7121\u52B9\u304B\u3001\u6709\u52B9\u671F\u9650\u304C\u5207\u308C\u3066\u3044\u307E\u3059\u3002\u65B0\u3057\u3044\u30B3\u30FC\u30C9\u3092\u4F9D\u983C\u3057\u3066\u304F\u3060\u3055\u3044\u3002" });
        }
        if (Number(record.attempts || 0) >= MAX_VERIFY_ATTEMPTS) {
          await deleteKey(RECOVERY_STORE, key);
          return json(429, { error: "\u78BA\u8A8D\u30B3\u30FC\u30C9\u306E\u5165\u529B\u56DE\u6570\u3092\u8D85\u3048\u307E\u3057\u305F\u3002\u65B0\u3057\u3044\u30B3\u30FC\u30C9\u3092\u4F9D\u983C\u3057\u3066\u304F\u3060\u3055\u3044\u3002" });
        }
        const code = String(payload.code || "").trim();
        const candidate = /^\d{6}$/.test(code) ? verificationDigest(session.email, record.email, record.nonce, code) : "";
        if (!safeHexEqual(candidate, record.codeHash)) {
          record.attempts = Number(record.attempts || 0) + 1;
          if (record.attempts >= MAX_VERIFY_ATTEMPTS) await deleteKey(RECOVERY_STORE, key);
          else await setJSON(RECOVERY_STORE, key, record);
          return json(400, { error: record.attempts >= MAX_VERIFY_ATTEMPTS ? "\u5165\u529B\u56DE\u6570\u3092\u8D85\u3048\u307E\u3057\u305F\u3002\u65B0\u3057\u3044\u78BA\u8A8D\u30B3\u30FC\u30C9\u3092\u4F9D\u983C\u3057\u3066\u304F\u3060\u3055\u3044\u3002" : "\u78BA\u8A8D\u30B3\u30FC\u30C9\u304C\u9055\u3044\u307E\u3059\u3002" });
        }
        account.recoveryEmail = record.email;
        account.recoveryEmailVerifiedAt = (/* @__PURE__ */ new Date()).toISOString();
        await setJSON(STORE_NAMES.ACCOUNTS, session.email, account);
        await deleteKey(RECOVERY_STORE, key);
        return json(200, { ok: true, verified: true, recoveryEmail: record.email, verifiedAt: account.recoveryEmailVerifiedAt });
      }
      if (action === "requestPasswordReset") {
        if (await emailConfigurationMissing()) return json(503, { error: "\u30E1\u30FC\u30EB\u9001\u4FE1\u8A2D\u5B9A\u304C\u672A\u5B8C\u4E86\u3067\u3059\u3002\u904B\u55B6\u306B\u8A2D\u5B9A\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002" + (globalThis.__brevoDiag ? "\uFF08\u539F\u56E0: " + globalThis.__brevoDiag + "\uFF09" : "") });
        const generic = (masked) => json(200, { ok: true, message: RESET_MESSAGE, ...(masked ? { maskedEmail: masked } : {}) });
        const maskEmail = (addr) => { const [local = "", domain = ""] = String(addr).split("@"); return `${local.slice(0, 2)}\u2026@${domain}`; };
        if (!await limitByIp(event, "reset-request", 10)) return generic();
        const loginId = normalizeLoginId(payload.accountEmail || payload.email);
        if (!loginId) return generic();
        const resolved = await findAccountByLogin(loginId);
        if (!resolved?.account?.recoveryEmail || !resolved.account.recoveryEmailVerifiedAt) return generic();
        const accountHash = digestHex(resolved.email);
        const activeKey = `reset-active:${accountHash}`;
        const prior = await getJSON(RECOVERY_STORE, activeKey);
        const now = Date.now();
        if (prior && Number(prior.expiresAt) > now && now - Number(prior.lastSentAt || 0) < RESEND_COOLDOWN_MS) return generic(maskEmail(resolved.account.recoveryEmail));
        if (prior?.tokenHash) await deleteKey(RECOVERY_STORE, `reset:${prior.tokenHash}`);
        const rawToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = digestHex(rawToken);
        const expiresAt = now + RESET_TTL_MS;
        await setJSON(RECOVERY_STORE, `reset:${tokenHash}`, { accountEmail: resolved.email, tokenHash, createdAt: new Date(now).toISOString(), expiresAt, used: false });
        await setJSON(RECOVERY_STORE, activeKey, { tokenHash, lastSentAt: now, expiresAt });
        try {
          const resetUrl = buildSiteUrl(event, `/reset-password/?token=${rawToken}`);
          await sendEmailTemplate(event, { template: "password-reset", to: resolved.account.recoveryEmail, subject: "MixAll \u30D1\u30B9\u30EF\u30FC\u30C9\u518D\u8A2D\u5B9A\u306E\u3054\u6848\u5185", parameters: { displayName: String(resolved.account.displayName || resolved.email.split("@")[0]).slice(0, 80), resetUrl, expiresMinutes: 30 } });
        } catch (error) {
          await deleteKey(RECOVERY_STORE, `reset:${tokenHash}`);
          await deleteKey(RECOVERY_STORE, activeKey);
          console.error("Password reset email was not sent:", error?.code || error?.message || "unknown error");
          return generic();
        }
        return generic(maskEmail(resolved.account.recoveryEmail));
      }
      if (action === "resetPassword") {
        const token = String(payload.resetToken || "");
        const newPassword = String(payload.newPassword || "");
        if (!/^[a-f0-9]{64}$/.test(token)) return json(400, { error: "\u518D\u8A2D\u5B9A\u30EA\u30F3\u30AF\u304C\u7121\u52B9\u304B\u3001\u6709\u52B9\u671F\u9650\u304C\u5207\u308C\u3066\u3044\u307E\u3059\u3002" });
        if (newPassword.length < 6 || newPassword.length > 1024) return json(400, { error: "\u65B0\u3057\u3044\u30D1\u30B9\u30EF\u30FC\u30C9\u306F6\u6587\u5B57\u4EE5\u4E0A\u306B\u3057\u3066\u304F\u3060\u3055\u3044\u3002" });
        const tokenHash = digestHex(token);
        const key = `reset:${tokenHash}`;
        const record = await getJSON(RECOVERY_STORE, key);
        if (!record || record.used || Number(record.expiresAt) < Date.now() || !safeHexEqual(record.tokenHash, tokenHash)) return json(400, { error: "\u518D\u8A2D\u5B9A\u30EA\u30F3\u30AF\u304C\u7121\u52B9\u304B\u3001\u6709\u52B9\u671F\u9650\u304C\u5207\u308C\u3066\u3044\u307E\u3059\u3002\u65B0\u3057\u3044\u518D\u8A2D\u5B9A\u30E1\u30FC\u30EB\u3092\u4F9D\u983C\u3057\u3066\u304F\u3060\u3055\u3044\u3002" });
        const activeKey = `reset-active:${digestHex(record.accountEmail)}`;
        const active = await getJSON(RECOVERY_STORE, activeKey);
        if (!active || !safeHexEqual(active.tokenHash, tokenHash)) return json(400, { error: "\u3053\u306E\u518D\u8A2D\u5B9A\u30EA\u30F3\u30AF\u306F\u3059\u3067\u306B\u7121\u52B9\u3067\u3059\u3002\u65B0\u3057\u3044\u518D\u8A2D\u5B9A\u30E1\u30FC\u30EB\u3092\u4F9D\u983C\u3057\u3066\u304F\u3060\u3055\u3044\u3002" });
        const account = await getJSON(STORE_NAMES.ACCOUNTS, record.accountEmail);
        if (!account) return json(400, { error: "\u518D\u8A2D\u5B9A\u5BFE\u8C61\u306E\u30A2\u30AB\u30A6\u30F3\u30C8\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002" });
        const salt = crypto.randomBytes(16).toString("hex");
        account.salt = salt;
        account.passwordHash = crypto.scryptSync(newPassword, salt, 64).toString("hex");
        account.passwordChangedAt = (/* @__PURE__ */ new Date()).toISOString();
        await setJSON(STORE_NAMES.ACCOUNTS, record.accountEmail, account);
        for (const sessionKey of await listKeys(STORE_NAMES.SESSIONS)) {
          const session = await getJSON(STORE_NAMES.SESSIONS, sessionKey);
          if (session?.email === record.accountEmail) await deleteKey(STORE_NAMES.SESSIONS, sessionKey);
        }
        await deleteKey(RECOVERY_STORE, key);
        await deleteKey(RECOVERY_STORE, activeKey);
        return json(200, { ok: true, message: "\u30D1\u30B9\u30EF\u30FC\u30C9\u3092\u66F4\u65B0\u3057\u3001\u3059\u3079\u3066\u306E\u30ED\u30B0\u30A4\u30F3\u7AEF\u672B\u3092\u30ED\u30B0\u30A2\u30A6\u30C8\u3057\u307E\u3057\u305F\u3002" });
      }
      return null;
    }
    module.exports = { handleRecoveryAction, normalizeRealEmail, clearRecoveryRecords };
  }
});

// src/functions/auth.js
var require_auth = __commonJS({
  "src/functions/auth.js"(exports) {
    var crypto = __require("crypto");
    var { connectLambda: connectLambda2 } = (init_blobs(), __toCommonJS(blobs_exports));
    var { STORE_NAMES, getJSON, setJSON, deleteKey, listKeys } = require_store();
    var { getSessionInfo } = require_session();
    var { getAgeFromBirthDate, isValidBirthDate } = require_ghost_age();
    var { handleRecoveryAction, clearRecoveryRecords } = require_account_recovery();
    var DOMAIN = "@bix.3erver";
    var SESSION_TTL_MS = 1e3 * 60 * 60 * 24 * 14;
    function json(status, body) {
      return {
        statusCode: status,
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(body)
      };
    }
    function randomLocalPart() {
      const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
      let out = "";
      for (let i = 0; i < 8; i++) {
        out += chars[crypto.randomInt(0, chars.length)];
      }
      return out;
    }
    function normalizeEmail(input) {
      if (!input) return null;
      let local = String(input).trim().toLowerCase();
      if (local.endsWith(DOMAIN)) local = local.slice(0, -DOMAIN.length);
      if (!/^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])?$/.test(local)) return null;
      return local + DOMAIN;
    }
    var ADMIN_EMAIL = "bix.admin" + DOMAIN;
    var ADMIN_INITIAL_PASSWORD = ((typeof process !== "undefined" && process.env && process.env.MIXALL_ADMIN_INITIAL_PASSWORD) || "");
    function hashPassword(password, salt) {
      const derived = crypto.scryptSync(password, salt, 64);
      return derived.toString("hex");
    }
    function makeToken() {
      return crypto.randomBytes(32).toString("hex");
    }
    function connectionAudit(event) {
      const headers2 = event.headers || {};
      const first = (value) => String(value || "").split(",")[0].trim();
      const ip = first(headers2["x-nf-client-connection-ip"] || headers2["x-forwarded-for"] || headers2["client-ip"] || "");
      const country = first(headers2["x-country"] || headers2["x-nf-geo-country"] || "");
      const region = first(headers2["x-region"] || headers2["x-nf-geo-region"] || "");
      return { ip: ip.slice(0, 80), country: country.slice(0, 80), region: region.slice(0, 120), area: region.slice(0, 120), accuracy: region ? "\u63A8\u5B9A" : "\u4E0D\u660E", collectedAt: (/* @__PURE__ */ new Date()).toISOString() };
    }
    async function findAccountByLogin(email) {
      const normalized = normalizeEmail(email);
      if (!normalized) return null;
      const direct = await getJSON(STORE_NAMES.ACCOUNTS, normalized);
      if (direct) return { email: normalized, account: direct };
      for (const key of await listKeys(STORE_NAMES.ACCOUNTS)) {
        const account = await getJSON(STORE_NAMES.ACCOUNTS, key);
        if (Array.isArray(account?.loginAliases) && account.loginAliases.map(normalizeEmail).includes(normalized)) return { email: key, account };
      }
      return null;
    }
    function replaceEmailReferences(value, oldEmail, newEmail) {
      if (typeof value === "string") return value === oldEmail ? newEmail : value;
      if (Array.isArray(value)) return value.map((item) => replaceEmailReferences(item, oldEmail, newEmail));
      if (value && typeof value === "object") {
        const out = {};
        for (const [key, item] of Object.entries(value)) out[key] = replaceEmailReferences(item, oldEmail, newEmail);
        return out;
      }
      return value;
    }
    async function migrateAdminEmail(oldEmail, newEmail, account) {
      await clearRecoveryRecords(oldEmail);
      const skip = /* @__PURE__ */ new Set([STORE_NAMES.ADMIN_AUDIT, STORE_NAMES.SESSIONS, STORE_NAMES.ACCOUNTS]);
      const storeNames = [...new Set(Object.values(STORE_NAMES))];
      for (const storeName of storeNames) {
        if (skip.has(storeName)) continue;
        for (const key of await listKeys(storeName)) {
          const value = await getJSON(storeName, key);
          if (value === null || value === void 0) continue;
          const migrated = replaceEmailReferences(value, oldEmail, newEmail);
          const nextKey = key === oldEmail ? newEmail : key.split(oldEmail).join(newEmail);
          if (nextKey !== key || JSON.stringify(migrated) !== JSON.stringify(value)) {
            await setJSON(storeName, nextKey, migrated);
            if (nextKey !== key) await deleteKey(storeName, key);
          }
        }
      }
      for (const key of await listKeys(STORE_NAMES.SESSIONS)) {
        const value = await getJSON(STORE_NAMES.SESSIONS, key);
        if (value?.email === oldEmail || value?.email === newEmail) await deleteKey(STORE_NAMES.SESSIONS, key);
      }
      const migratedAccount = { ...account, email: newEmail, loginAliases: [...new Set([...account.loginAliases || [], oldEmail].map(normalizeEmail).filter(Boolean))], emailChangedAt: (/* @__PURE__ */ new Date()).toISOString() };
      await setJSON(STORE_NAMES.ACCOUNTS, newEmail, migratedAccount);
      await deleteKey(STORE_NAMES.ACCOUNTS, oldEmail);
      const audit = { kind: "audit", id: `email-change:${Date.now()}-${crypto.randomBytes(6).toString("hex")}`, actorEmail: newEmail, action: "changeAdminEmail", targetType: "account", targetId: newEmail, detail: `\u904B\u55B6\u30ED\u30B0\u30A4\u30F3\u30E1\u30FC\u30EB\u3092\u5909\u66F4\u3002\u65E7\u30A2\u30C9\u30EC\u30B9 ${oldEmail} \u306F\u30ED\u30B0\u30A4\u30F3\u5225\u540D\u3068\u3057\u3066\u4FDD\u6301\u3002\u65E2\u5B58\u7AEF\u672B\u3092\u4E00\u62EC\u5931\u52B9\u3002`, metadata: { oldEmail, newEmail, revokedAllSessions: true, migratedAt: (/* @__PURE__ */ new Date()).toISOString() }, createdAt: (/* @__PURE__ */ new Date()).toISOString() };
      await setJSON(STORE_NAMES.ADMIN_AUDIT, `audit:${audit.id}`, audit);
      return migratedAccount;
    }
    exports.handler = async (event) => {
      connectLambda2(event);
      if (event.httpMethod !== "POST") {
        return json(405, { error: "POST\u306E\u307F\u5BFE\u5FDC\u3057\u3066\u3044\u307E\u3059" });
      }
      try {
        return await handlePost(event);
      } catch (err) {
        console.error("auth function error:", err);
        return json(500, { error: `\u5185\u90E8\u30A8\u30E9\u30FC: ${err.message}` });
      }
    };
    async function handlePost(event) {
      let payload;
      try {
        payload = JSON.parse(event.body || "{}");
      } catch {
        return json(400, { error: "\u4E0D\u6B63\u306A\u30EA\u30AF\u30A8\u30B9\u30C8\u3067\u3059" });
      }
      const { action } = payload;
      const recoveryResponse = await handleRecoveryAction(event, payload);
      if (recoveryResponse) return recoveryResponse;
      if (action === "suggest") {
        let candidate;
        let tries = 0;
        do {
          candidate = randomLocalPart() + DOMAIN;
          tries++;
        } while (await getJSON(STORE_NAMES.ACCOUNTS, candidate) && tries < 10);
        return json(200, { email: candidate });
      }
      if (action === "checkEmail") {
        const email = normalizeEmail(payload.email);
        if (!email) return json(400, { error: "\u30A2\u30C9\u30EC\u30B9\u306E\u5F62\u5F0F\u304C\u4E0D\u6B63\u3067\u3059" });
        const existing = await findAccountByLogin(email);
        return json(200, { available: !existing });
      }
      if (action === "register") {
        const email = normalizeEmail(payload.email);
        const password = payload.password;
        const birthDate = String(payload.birthDate || "").trim();
        const age = getAgeFromBirthDate(birthDate);
        if (!email) return json(400, { error: "\u30A2\u30C9\u30EC\u30B9\u306E\u5F62\u5F0F\u304C\u4E0D\u6B63\u3067\u3059" });
        if (!isValidBirthDate(birthDate)) return json(400, { error: "\u6709\u52B9\u306A\u751F\u5E74\u6708\u65E5\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\uFF08\u672A\u6765\u306E\u65E5\u4ED8\u30FB120\u6B73\u3092\u8D85\u3048\u308B\u65E5\u4ED8\u306F\u4F7F\u3048\u307E\u305B\u3093\uFF09" });
        if (!password || password.length < 6) {
          return json(400, { error: "\u30D1\u30B9\u30EF\u30FC\u30C9\u306F6\u6587\u5B57\u4EE5\u4E0A\u306B\u3057\u3066\u304F\u3060\u3055\u3044" });
        }
        if (!payload.humanCheck) {
          return json(400, { error: "\u4EBA\u9593\u5224\u5B9A\u30C1\u30A7\u30C3\u30AF\u304C\u672A\u5B8C\u4E86\u3067\u3059" });
        }
        const existing = await findAccountByLogin(email);
        if (existing) return json(409, { error: "\u3053\u306E\u30A2\u30C9\u30EC\u30B9\u306F\u65E2\u306B\u4F7F\u7528\u3055\u308C\u3066\u3044\u307E\u3059" });
        const salt = crypto.randomBytes(16).toString("hex");
        const passwordHash = hashPassword(password, salt);
        const account = {
          email,
          displayName: payload.displayName || email.split("@")[0],
          birthDate,
          age,
          birthDateSubmittedAt: (/* @__PURE__ */ new Date()).toISOString(),
          salt,
          passwordHash,
          linked: {},
          isOfficial: false,
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        await setJSON(STORE_NAMES.ACCOUNTS, email, account);
        const token = makeToken();
        await setJSON(STORE_NAMES.SESSIONS, token, {
          email,
          sessionId: crypto.randomBytes(12).toString("hex"),
          deviceLabel: String(payload.device?.label || "\u4E0D\u660E\u306A\u30C7\u30D0\u30A4\u30B9").slice(0, 120),
          userAgent: String(payload.device?.userAgent || "").slice(0, 300),
          createdAt: (/* @__PURE__ */ new Date()).toISOString(),
          lastSeenAt: Date.now(),
          expiresAt: Date.now() + SESSION_TTL_MS,
          connectionAudit: connectionAudit(event)
        });
        return json(201, { email, token, age, hasBirthDate: true, displayName: account.displayName, avatarUrl: account.avatarDataUrl || null, avatarType: account.avatarType || null, avatarCrop: account.avatarCrop || null, isAdmin: account.isAdmin === true, isDeputyAdmin: account.isDeputyAdmin === true, isOfficial: account.isOfficial === true || account.isAdmin === true });
      }
      if (action === "login") {
        const email = normalizeEmail(payload.email);
        const password = payload.password;
        if (!email || !password) return json(400, { error: "\u30A2\u30C9\u30EC\u30B9\u3068\u30D1\u30B9\u30EF\u30FC\u30C9\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044" });
        const resolved = await findAccountByLogin(email);
        let canonicalEmail = resolved?.email;
        let account = resolved?.account;
        if (!account && email === ADMIN_EMAIL) {
          if (password !== ADMIN_INITIAL_PASSWORD) {
            return json(401, { error: "\u30A2\u30C9\u30EC\u30B9\u307E\u305F\u306F\u30D1\u30B9\u30EF\u30FC\u30C9\u304C\u9055\u3044\u307E\u3059" });
          }
          const salt = crypto.randomBytes(16).toString("hex");
          canonicalEmail = email;
          account = {
            email,
            displayName: "\u904B\u55B6",
            salt,
            passwordHash: hashPassword(ADMIN_INITIAL_PASSWORD, salt),
            linked: {},
            isAdmin: true,
            isOfficial: true,
            createdAt: (/* @__PURE__ */ new Date()).toISOString()
          };
          await setJSON(STORE_NAMES.ACCOUNTS, email, account);
        }
        if (!account) return json(401, { error: "\u30A2\u30C9\u30EC\u30B9\u307E\u305F\u306F\u30D1\u30B9\u30EF\u30FC\u30C9\u304C\u9055\u3044\u307E\u3059" });
        const check = hashPassword(password, account.salt);
        if (check !== account.passwordHash) {
          return json(401, { error: "\u30A2\u30C9\u30EC\u30B9\u307E\u305F\u306F\u30D1\u30B9\u30EF\u30FC\u30C9\u304C\u9055\u3044\u307E\u3059" });
        }
        const token = makeToken();
        await setJSON(STORE_NAMES.SESSIONS, token, {
          email: canonicalEmail || email,
          sessionId: crypto.randomBytes(12).toString("hex"),
          deviceLabel: String(payload.device?.label || "\u4E0D\u660E\u306A\u30C7\u30D0\u30A4\u30B9").slice(0, 120),
          userAgent: String(payload.device?.userAgent || "").slice(0, 300),
          createdAt: (/* @__PURE__ */ new Date()).toISOString(),
          lastSeenAt: Date.now(),
          expiresAt: Date.now() + SESSION_TTL_MS,
          connectionAudit: connectionAudit(event)
        });
        const age = getAgeFromBirthDate(account.birthDate);
        return json(200, { email: canonicalEmail || email, token, age, hasBirthDate: age !== null, displayName: account.displayName, avatarUrl: account.avatarDataUrl || null, avatarType: account.avatarType || null, avatarCrop: account.avatarCrop || null, isAdmin: account.isAdmin === true, isDeputyAdmin: account.isDeputyAdmin === true, isOfficial: account.isOfficial === true || account.isAdmin === true });
      }
      if (action === "getBirthDate" || action === "setBirthDate") {
        const token = String(payload.token || "");
        const session = token ? await getJSON(STORE_NAMES.SESSIONS, token) : null;
        if (!session || session.expiresAt < Date.now()) return json(401, { error: "\u30ED\u30B0\u30A4\u30F3\u304C\u5FC5\u8981\u3067\u3059" });
        const account = await getJSON(STORE_NAMES.ACCOUNTS, session.email);
        if (!account) return json(404, { error: "\u30A2\u30AB\u30A6\u30F3\u30C8\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        if (action === "getBirthDate") return json(200, { birthDate: isValidBirthDate(account.birthDate) ? account.birthDate : null, hasBirthDate: isValidBirthDate(account.birthDate), age: getAgeFromBirthDate(account.birthDate) });
        if (isValidBirthDate(account.birthDate)) return json(409, { error: "\u751F\u5E74\u6708\u65E5\u306F\u767B\u9332\u5F8C\u306B\u5229\u7528\u8005\u81EA\u8EAB\u3067\u306F\u5909\u66F4\u3067\u304D\u307E\u305B\u3093\u3002\u4FEE\u6B63\u304C\u5FC5\u8981\u306A\u5834\u5408\u306F\u904B\u55B6\u3078\u9023\u7D61\u3057\u3066\u304F\u3060\u3055\u3044\u3002" });
        const birthDate = String(payload.birthDate || "").trim();
        const age = getAgeFromBirthDate(birthDate);
        if (!isValidBirthDate(birthDate)) return json(400, { error: "\u6709\u52B9\u306A\u751F\u5E74\u6708\u65E5\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\uFF08\u672A\u6765\u306E\u65E5\u4ED8\u30FB120\u6B73\u3092\u8D85\u3048\u308B\u65E5\u4ED8\u306F\u4F7F\u3048\u307E\u305B\u3093\uFF09" });
        account.birthDate = birthDate;
        account.age = age;
        account.birthDateSubmittedAt = (/* @__PURE__ */ new Date()).toISOString();
        await setJSON(STORE_NAMES.ACCOUNTS, session.email, account);
        return json(200, { ok: true, age, hasBirthDate: true });
      }
      if (action === "updateProfile") {
        const session = await getSessionInfo(payload.token);
        if (!session) return json(401, { error: "\u30ED\u30B0\u30A4\u30F3\u304C\u5FC5\u8981\u3067\u3059" });
        const account = await getJSON(STORE_NAMES.ACCOUNTS, session.email);
        if (!account) return json(404, { error: "\u30A2\u30AB\u30A6\u30F3\u30C8\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        const avatar = payload.avatarDataUrl == null ? account.avatarDataUrl || null : String(payload.avatarDataUrl);
        const avatarType = payload.avatarType == null ? account.avatarType || null : String(payload.avatarType);
        const avatarCrop = payload.avatarCrop && typeof payload.avatarCrop === "object" ? { x: Number(payload.avatarCrop.x) || 50, y: Number(payload.avatarCrop.y) || 50, size: Math.max(10, Math.min(100, Number(payload.avatarCrop.size) || 80)), start: Math.max(0, Number(payload.avatarCrop.start) || 0), end: Math.max(0, Number(payload.avatarCrop.end) || 0) } : account.avatarCrop || null;
        if (avatar && (!/^data:(image\/(png|jpeg|jpg|webp|gif)|video\/(mp4|webm|ogg));base64,/i.test(avatar) || avatar.length > 8e6)) return json(400, { error: "\u30A2\u30A4\u30B3\u30F3\u753B\u50CF\u30FB\u52D5\u753B\u306F\u5BFE\u5FDC\u5F62\u5F0F\u30678MB\u4EE5\u4E0B\u306B\u3057\u3066\u304F\u3060\u3055\u3044" });
        account.displayName = String(payload.displayName || account.displayName || session.email.split("@")[0]).trim().slice(0, 80) || session.email.split("@")[0];
        account.avatarDataUrl = avatar || null;
        account.avatarType = avatar ? avatarType : null;
        account.avatarCrop = avatar ? avatarCrop : null;
        await setJSON(STORE_NAMES.ACCOUNTS, session.email, account);
        return json(200, { email: session.email, displayName: account.displayName, avatarUrl: account.avatarDataUrl, avatarType: account.avatarType, avatarCrop: account.avatarCrop, isAdmin: account.isAdmin === true, isDeputyAdmin: account.isDeputyAdmin === true, isOfficial: account.isOfficial === true || account.isAdmin === true });
      }
      if (action === "consumeLogoutNotice") {
        const token = String(payload.token || "");
        if (!token) return json(200, { notified: false });
        const fingerprint = crypto.createHash("sha256").update(token).digest("hex");
        const noticeKey = `notice:${fingerprint}`;
        const notice = await getJSON(STORE_NAMES.SESSION_LOGOUTS, noticeKey);
        if (!notice || notice.expiresAt && notice.expiresAt < Date.now()) {
          if (notice) await deleteKey(STORE_NAMES.SESSION_LOGOUTS, noticeKey);
          return json(200, { notified: false });
        }
        await deleteKey(STORE_NAMES.SESSION_LOGOUTS, noticeKey);
        return json(200, { notified: true, reason: notice.reason, message: notice.message });
      }
      if (action === "logout") {
        const token = payload.token;
        const session = token ? await getJSON(STORE_NAMES.SESSIONS, token) : null;
        if (!session || session.expiresAt < Date.now()) return json(200, { ok: true, alreadyLoggedOut: true });
        await deleteKey(STORE_NAMES.SESSIONS, token);
        return json(200, { ok: true });
      }
      if (action === "listSessions") {
        const token = payload.token;
        const current = token ? await getJSON(STORE_NAMES.SESSIONS, token) : null;
        if (!current || current.expiresAt < Date.now()) return json(401, { error: "\u30ED\u30B0\u30A4\u30F3\u304C\u5FC5\u8981\u3067\u3059" });
        const keys = await listKeys(STORE_NAMES.SESSIONS);
        const sessions = [];
        for (const key of keys) {
          const item = await getJSON(STORE_NAMES.SESSIONS, key);
          if (!item || item.email !== current.email || item.expiresAt < Date.now()) continue;
          sessions.push({ sessionId: item.sessionId || null, deviceLabel: item.deviceLabel || "\u4E0D\u660E\u306A\u30C7\u30D0\u30A4\u30B9", userAgent: item.userAgent || "", createdAt: item.createdAt || null, lastSeenAt: item.lastSeenAt || null, expiresAt: item.expiresAt, current: key === token });
        }
        sessions.sort((a, b) => new Date(b.lastSeenAt || 0) - new Date(a.lastSeenAt || 0));
        return json(200, { sessions });
      }
      if (action === "revokeSession") {
        const token = payload.token;
        const current = token ? await getJSON(STORE_NAMES.SESSIONS, token) : null;
        if (!current || current.expiresAt < Date.now()) return json(401, { error: "\u30ED\u30B0\u30A4\u30F3\u304C\u5FC5\u8981\u3067\u3059" });
        const keys = await listKeys(STORE_NAMES.SESSIONS);
        for (const key of keys) {
          const item = await getJSON(STORE_NAMES.SESSIONS, key);
          if (item && item.email === current.email && item.sessionId === payload.sessionId) {
            await deleteKey(STORE_NAMES.SESSIONS, key);
            return json(200, { ok: true, revokedCurrent: key === token });
          }
        }
        return json(404, { error: "\u30BB\u30C3\u30B7\u30E7\u30F3\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
      }
      if (action === "changePassword") {
        const token = payload.token;
        const session = token ? await getJSON(STORE_NAMES.SESSIONS, token) : null;
        if (!session || session.expiresAt < Date.now()) {
          return json(401, { error: "\u30ED\u30B0\u30A4\u30F3\u304C\u5FC5\u8981\u3067\u3059" });
        }
        const account = await getJSON(STORE_NAMES.ACCOUNTS, session.email);
        if (!account) return json(404, { error: "\u30A2\u30AB\u30A6\u30F3\u30C8\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        const currentCheck = hashPassword(payload.currentPassword || "", account.salt);
        if (currentCheck !== account.passwordHash) {
          return json(401, { error: "\u73FE\u5728\u306E\u30D1\u30B9\u30EF\u30FC\u30C9\u304C\u9055\u3044\u307E\u3059" });
        }
        const newPassword = payload.newPassword || "";
        if (newPassword.length < 6) {
          return json(400, { error: "\u65B0\u3057\u3044\u30D1\u30B9\u30EF\u30FC\u30C9\u306F6\u6587\u5B57\u4EE5\u4E0A\u306B\u3057\u3066\u304F\u3060\u3055\u3044" });
        }
        const newSalt = crypto.randomBytes(16).toString("hex");
        account.salt = newSalt;
        account.passwordHash = hashPassword(newPassword, newSalt);
        await setJSON(STORE_NAMES.ACCOUNTS, session.email, account);
        await clearRecoveryRecords(session.email);
        return json(200, { ok: true });
      }
      if (action === "changeAdminEmail") {
        const token = String(payload.token || ""), session = token ? await getJSON(STORE_NAMES.SESSIONS, token) : null;
        if (!session || session.expiresAt < Date.now()) return json(401, { error: "\u30ED\u30B0\u30A4\u30F3\u304C\u5FC5\u8981\u3067\u3059" });
        const account = await getJSON(STORE_NAMES.ACCOUNTS, session.email);
        if (!account?.isAdmin) return json(403, { error: "\u4E3B\u904B\u55B6\u30A2\u30AB\u30A6\u30F3\u30C8\u306E\u307F\u5909\u66F4\u3067\u304D\u307E\u3059" });
        if (hashPassword(payload.currentPassword || "", account.salt) !== account.passwordHash) return json(401, { error: "\u73FE\u5728\u306E\u30D1\u30B9\u30EF\u30FC\u30C9\u304C\u9055\u3044\u307E\u3059" });
        const newEmail = normalizeEmail(payload.newEmail);
        if (!newEmail) return json(400, { error: "\u65B0\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u306E\u5F62\u5F0F\u304C\u4E0D\u6B63\u3067\u3059" });
        if (newEmail === session.email) return json(400, { error: "\u73FE\u5728\u3068\u7570\u306A\u308B\u65B0\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u3092\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044" });
        if (await findAccountByLogin(newEmail)) return json(409, { error: "\u65B0\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u306F\u65E2\u306B\u4F7F\u7528\u3055\u308C\u3066\u3044\u307E\u3059" });
        await migrateAdminEmail(session.email, newEmail, account);
        return json(200, { ok: true, email: newEmail, loginAlias: session.email, reauthRequired: true, revokedAllSessions: true });
      }
      if (action === "changeEmail") {
        const token = payload.token;
        const session = token ? await getJSON(STORE_NAMES.SESSIONS, token) : null;
        if (!session || session.expiresAt < Date.now()) {
          return json(401, { error: "\u30ED\u30B0\u30A4\u30F3\u304C\u5FC5\u8981\u3067\u3059" });
        }
        const newEmail = normalizeEmail(payload.newEmail);
        if (!newEmail) return json(400, { error: "\u30A2\u30C9\u30EC\u30B9\u306E\u5F62\u5F0F\u304C\u4E0D\u6B63\u3067\u3059" });
        const existing = await getJSON(STORE_NAMES.ACCOUNTS, newEmail);
        if (existing) return json(409, { error: "\u3053\u306E\u30A2\u30C9\u30EC\u30B9\u306F\u65E2\u306B\u4F7F\u7528\u3055\u308C\u3066\u3044\u307E\u3059" });
        const account = await getJSON(STORE_NAMES.ACCOUNTS, session.email);
        if (!account) return json(404, { error: "\u30A2\u30AB\u30A6\u30F3\u30C8\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        if (account.isAdmin === true) return json(403, { error: "\u904B\u55B6\u30A2\u30AB\u30A6\u30F3\u30C8\u306F\u904B\u55B6\u30E1\u30FC\u30EB\u5909\u66F4\u753B\u9762\u304B\u3089\u5909\u66F4\u3057\u3066\u304F\u3060\u3055\u3044" });
        await clearRecoveryRecords(session.email);
        account.email = newEmail;
        await setJSON(STORE_NAMES.ACCOUNTS, newEmail, account);
        await deleteKey(STORE_NAMES.ACCOUNTS, session.email);
        session.email = newEmail;
        await setJSON(STORE_NAMES.SESSIONS, token, session);
        return json(200, { email: newEmail });
      }
      if (action === "deleteAccount") {
        const token = payload.token;
        const session = token ? await getJSON(STORE_NAMES.SESSIONS, token) : null;
        if (!session || session.expiresAt < Date.now()) return json(401, { error: "\u30ED\u30B0\u30A4\u30F3\u304C\u5FC5\u8981\u3067\u3059" });
        if (String(payload.confirm || "") !== "DELETE") return json(400, { error: "\u78BA\u8A8D\u6587\u5B57\u5217 DELETE \u304C\u5FC5\u8981\u3067\u3059" });
        const account = await getJSON(STORE_NAMES.ACCOUNTS, session.email);
        if (!account) return json(404, { error: "\u30A2\u30AB\u30A6\u30F3\u30C8\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        const check = hashPassword(payload.password || "", account.salt);
        if (check !== account.passwordHash) return json(401, { error: "\u30D1\u30B9\u30EF\u30FC\u30C9\u304C\u9055\u3044\u307E\u3059" });
        if (account.isAdmin === true) return json(403, { error: "\u904B\u55B6\u30A2\u30AB\u30A6\u30F3\u30C8\u306F\u901A\u5E38\u306E\u524A\u9664\u30DC\u30BF\u30F3\u304B\u3089\u524A\u9664\u3067\u304D\u307E\u305B\u3093" });
        await clearRecoveryRecords(session.email);
        for (const key of await listKeys(STORE_NAMES.SESSIONS)) {
          const item = await getJSON(STORE_NAMES.SESSIONS, key);
          if (item?.email === session.email) await deleteKey(STORE_NAMES.SESSIONS, key);
        }
        await deleteKey(STORE_NAMES.ACCOUNTS, session.email);
        await setJSON(STORE_NAMES.ADMIN_AUDIT, `account-delete:${Date.now()}-${crypto.randomBytes(6).toString("hex")}`, { kind: "audit", action: "accountDeleteSelf", targetType: "account", targetId: session.email, detail: "\u672C\u4EBA\u306B\u3088\u308B\u30A2\u30AB\u30A6\u30F3\u30C8\u524A\u9664", createdAt: (/* @__PURE__ */ new Date()).toISOString() });
        return json(200, { ok: true, deleted: true });
      }
      if (action === "verify") {
        const token = payload.token;
        const session = token ? await getJSON(STORE_NAMES.SESSIONS, token) : null;
        if (!session || session.expiresAt < Date.now()) {
          return json(401, { error: "\u30BB\u30C3\u30B7\u30E7\u30F3\u304C\u7121\u52B9\u3067\u3059" });
        }
        const account = await getJSON(STORE_NAMES.ACCOUNTS, session.email);
        if (!account) return json(401, { error: "\u30BB\u30C3\u30B7\u30E7\u30F3\u304C\u7121\u52B9\u3067\u3059" });
        return json(200, { email: session.email, displayName: account.displayName, avatarUrl: account.avatarDataUrl || null, avatarType: account.avatarType || null, avatarCrop: account.avatarCrop || null, isAdmin: account.isAdmin === true, isDeputyAdmin: account.isDeputyAdmin === true, isOfficial: account.isOfficial === true || account.isAdmin === true });
      }
      return json(400, { error: "\u4E0D\u660E\u306Aaction\u3067\u3059" });
    }
  }
});

// entries/auth-bh7gq.mjs
var import_auth = __toESM(require_auth(), 1);

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

// entries/auth-bh7gq.mjs
var handler = import_auth.default.handler || import_auth.default.default && import_auth.default.default.handler;
var __onRequest = wrap(handler, {});

export async function onRequest(context) {
  return __onRequest(context);
}
