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

// src/lib/background-jobs.js
var require_background_jobs = __commonJS({
  "src/lib/background-jobs.js"(exports, module) {
    var crypto = __require("crypto");
    var { STORE_NAMES, setJSON, deleteKey } = require_store();
    var BACKGROUND_PATH = "/api/ai-bot-background";
    async function dispatch(url, init) {
      try {
        return await fetch(url, init);
      } catch (error) {
        if (error && (error.name === "TimeoutError" || error.name === "AbortError")) return { status: 202 };
        throw error;
      }
    }
    function digest(value) {
      return crypto.createHash("sha256").update(String(value || "")).digest("hex");
    }
    function getSiteOrigin(event) {
      const configured = process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.DEPLOY_URL;
      if (configured) return new URL(configured).origin;
      const headers2 = Object.fromEntries(Object.entries(event?.headers || {}).map(([key, value]) => [key.toLowerCase(), value]));
      const host = headers2.host;
      if (!host) throw new Error("Background Function\u306E\u30B5\u30A4\u30C8URL\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093");
      const forwardedProto = String(headers2["x-forwarded-proto"] || "").split(",")[0].trim();
      const protocol = forwardedProto || (/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host) ? "http" : "https");
      return `${protocol}://${host}`;
    }
    async function enqueueBackgroundTask(event, type, payload) {
      const jobId = crypto.randomBytes(24).toString("hex");
      const secret = crypto.randomBytes(32).toString("hex");
      const now = Date.now();
      const job = {
        id: jobId,
        type: String(type),
        payload: payload && typeof payload === "object" ? payload : {},
        secretHash: digest(secret),
        status: "queued",
        attempts: 0,
        createdAt: new Date(now).toISOString(),
        expiresAt: now + 24 * 60 * 60 * 1e3
      };
      await setJSON(STORE_NAMES.AI_JOBS, jobId, job);
      try {
        const response = await dispatch(new URL(BACKGROUND_PATH, getSiteOrigin(event)), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId, secret }),
          signal: AbortSignal.timeout(100000)
        });
        if (response.status !== 202 && response.status !== 200) throw new Error(`Background Function\u304CHTTP ${response.status}\u3092\u8FD4\u3057\u307E\u3057\u305F`);
        return { jobId };
      } catch (error) {
        try {
          await deleteKey(STORE_NAMES.AI_JOBS, jobId);
        } catch (cleanupError) {
          console.error("failed to remove undispatched AI job:", cleanupError);
        }
        throw new Error(`Background Function\u3092\u8D77\u52D5\u3067\u304D\u307E\u305B\u3093: ${error.message}`);
      }
    }
    module.exports = { enqueueBackgroundTask };
  }
});

// src/functions/backup.js
var require_backup = __commonJS({
  "src/functions/backup.js"(exports) {
    var crypto = __require("crypto");
    var zlib = __require("zlib");
    var { connectLambda: connectLambda2 } = (init_blobs(), __toCommonJS(blobs_exports));
    var { STORE_NAMES, getJSON, setJSON, deleteKey, listKeys } = require_store();
    var { requireAdmin } = require_session();
    var { enqueueBackgroundTask } = require_background_jobs();
    var BACKUP_VERSION = 2;
    var MAX_BACKUP_BYTES = 45 * 1024 * 1024;
    var BACKUP_PAGE_SIZE = 12;
    var BACKUP_SINGLE_ENTRY_STORES = /* @__PURE__ */ new Set(["FILE_CHUNKS", "ATTACHMENTS"]);
    var BACKUP_INDEX_STORE = "netrify-backup-index";
    var BACKUP_EXPORT_PREFIX = "backup-export:";
    var BACKUP_INDEX_PAGE_SIZE = 2e3;
    var BACKUP_RESPONSE_TARGET_BYTES = 1500 * 1024;
    var BACKUP_FRAGMENT_BYTES = 1024 * 1024;
    var BACKUP_SESSION_MAX_AGE_MS = 6 * 60 * 60 * 1e3;
    var BACKUP_IMPORT_PROGRESS_PREFIX = "backup-import-progress:";
    var IMPORT_CLEAR_BATCH_SIZE = 400;
    var IMPORT_WRITE_BATCH_SIZE = 96;
    var IMPORT_CLEANUP_BATCH_SIZE = 200;
    var IMPORT_MAX_STEPS_PER_REQUEST = 40;
    var SNAPSHOT_CHUNK = 96;
    var SNAPSHOT_PARALLEL = 16;
    var IMPORT_PARALLEL = 16;
    var BACKGROUND_SLICE_MS = Math.min(100 * 1e3, Math.max(1e3, Number(process.env.BACKUP_BACKGROUND_SLICE_MS || 80 * 1e3)));
    var BACKUP_USER_JOB_PREFIX = "backup-user-job:";
    var BACKUP_STORES = Object.keys(STORE_NAMES).filter((name) => !["AI_JOBS", "MESSAGE_FILTER_CACHE"].includes(name));
    function pageSizeFor(name) {
      return BACKUP_SINGLE_ENTRY_STORES.has(name) ? 1 : BACKUP_PAGE_SIZE;
    }
    function json(status, body, extraHeaders = {}) {
      return { statusCode: status, headers: { "Content-Type": "application/json; charset=utf-8", ...extraHeaders }, body: JSON.stringify(body) };
    }
    function id() {
      return crypto.randomBytes(10).toString("hex");
    }
    function importKey(importId, suffix) {
      return `backup-import:${String(importId).replace(/[^a-zA-Z0-9_-]/g, "")}:${suffix}`;
    }
    function importProgressKey(importId) {
      return `${BACKUP_IMPORT_PROGRESS_PREFIX}${String(importId).replace(/[^a-zA-Z0-9_-]/g, "")}`;
    }
    function importPageKey(importId, name, page) {
      return importKey(importId, `store:${name}:${page}`);
    }
    function importReceiptKey(importId, name, page) {
      return importKey(importId, `received:${name}:${page}`);
    }
    function importAccessHash(token) {
      return crypto.createHash("sha256").update(String(token || "")).digest("hex");
    }
    function importAccountFallbackKey(importId, accountKey) {
      const hash = crypto.createHash("sha256").update(String(accountKey)).digest("hex");
      return importKey(importId, `account-fallback:${hash}`);
    }
    function exportKey(exportId, suffix) {
      return `${BACKUP_EXPORT_PREFIX}${String(exportId).replace(/[^a-zA-Z0-9_-]/g, "")}:${suffix}`;
    }
    function userJobPrefix(email) {
      return `${BACKUP_USER_JOB_PREFIX}${crypto.createHash("sha256").update(String(email || "").toLowerCase()).digest("hex")}:`;
    }
    function userJobKey(email, type, jobId) {
      return `${userJobPrefix(email)}${type}:${String(jobId).replace(/[^a-zA-Z0-9_-]/g, "")}`;
    }
    async function registerUserJob(email, type, jobId) {
      await setJSON(BACKUP_INDEX_STORE, userJobKey(email, type, jobId), { email: String(email || "").toLowerCase(), type, jobId, createdAt: (/* @__PURE__ */ new Date()).toISOString() });
    }
    async function removeUserJob(email, type, jobId) {
      await deleteKey(BACKUP_INDEX_STORE, userJobKey(email, type, jobId));
    }
    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }
    async function getJSONWithRetry(storeName, key, attempts = 6) {
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const value = await getJSON(storeName, key);
        if (value !== null && value !== void 0) return value;
        if (attempt + 1 < attempts) await sleep(Math.min(1600, 120 * 2 ** attempt));
      }
      return null;
    }
    async function authorizeImportContinuation(importId, accessToken) {
      const normalizedId = String(importId || "");
      if (!/^[a-f0-9]{48}$/.test(normalizedId) || !/^[a-f0-9]{64}$/.test(String(accessToken || ""))) return null;
      const state = await getJSON(BACKUP_INDEX_STORE, importProgressKey(normalizedId));
      const meta = state ? null : await getJSON(BACKUP_INDEX_STORE, importKey(normalizedId, "meta"));
      const record = state || meta;
      if (!record || !/^[a-f0-9]{64}$/.test(String(record.accessHash || ""))) return null;
      const startedAt = Date.parse(record.startedAt || record.createdAtServer || "");
      if (!Number.isFinite(startedAt) || Date.now() - startedAt > BACKUP_SESSION_MAX_AGE_MS) return null;
      const expected = Buffer.from(record.accessHash, "hex");
      const actual = Buffer.from(importAccessHash(accessToken), "hex");
      if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
      return { email: String(record.actorEmail || "") };
    }
    async function mapLimit(items, limit, callback) {
      const results = new Array(items.length);
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
          const index = next++;
          results[index] = await callback(items[index], index);
        }
      }));
      return results;
    }
    async function maintainRestoreSiteLock(actorEmail) {
      const current = await getJSON(STORE_NAMES.SITE_STATE, "global") || {};
      await setJSON(STORE_NAMES.SITE_STATE, "global", { ...current, locked: true, lockedAt: current.lockedAt || (/* @__PURE__ */ new Date()).toISOString(), lockedBy: actorEmail, message: "\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u5FA9\u5143\u5F8C\u306E\u78BA\u8A8D\u4E2D\u3067\u3059\u3002\u904B\u55B6\u304C\u30ED\u30C3\u30AF\u3092\u89E3\u9664\u3059\u308B\u307E\u3067\u30B5\u30A4\u30C8\u306F\u4FDD\u8B77\u3055\u308C\u3066\u3044\u307E\u3059\u3002" });
    }
    function createBackupInfo() {
      return {
        format: "netrify-data-backup",
        version: BACKUP_VERSION,
        passwordData: "passwordHash\u3068salt\u3092\u542B\u3080\u3002\u5E73\u6587\u30D1\u30B9\u30EF\u30FC\u30C9\u306F\u30B7\u30B9\u30C6\u30E0\u306B\u4FDD\u5B58\u3055\u308C\u3066\u3044\u306A\u3044\u305F\u3081\u51FA\u529B\u3055\u308C\u306A\u3044\u3002",
        security: "\u3053\u306E\u30D5\u30A1\u30A4\u30EB\u306B\u306F\u30ED\u30B0\u30A4\u30F3\u30BB\u30C3\u30B7\u30E7\u30F3\u3001API\u30AD\u30FC\u7B49\u306E\u79D8\u5BC6\u60C5\u5831\u3082\u542B\u307E\u308C\u308B\u305F\u3081\u3001\u904B\u55B6\u7BA1\u7406\u8005\u3060\u3051\u304C\u5B89\u5168\u306A\u5834\u6240\u3067\u4FDD\u7BA1\u3059\u308B\u3053\u3068\u3002"
      };
    }
    async function scheduleBackupCleanup(event, exportId) {
      const cleanId = String(exportId || "");
      if (!/^[a-f0-9]{20}$/.test(cleanId)) throw new Error("\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7ID\u304C\u4E0D\u6B63\u3067\u3059");
      const stateKey = `backup-cleanup:${cleanId}:state`;
      const state = await getJSON(BACKUP_INDEX_STORE, stateKey) || { exportId: cleanId, lastKey: "", createdAt: (/* @__PURE__ */ new Date()).toISOString() };
      await setJSON(BACKUP_INDEX_STORE, stateKey, state);
      await enqueueBackgroundTask(event, "backup-cleanup", { cleanupExportId: cleanId });
      return { status: "queued" };
    }
    async function processBackupCleanup(payload) {
      const exportId = String(payload?.cleanupExportId || "");
      if (!/^[a-f0-9]{20}$/.test(exportId)) throw new Error("\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7ID\u304C\u4E0D\u6B63\u3067\u3059");
      const stateKey = `backup-cleanup:${exportId}:state`;
      const state = await getJSON(BACKUP_INDEX_STORE, stateKey) || { exportId, lastKey: "" };
      const keys = (await listKeys(BACKUP_INDEX_STORE, exportKey(exportId, ""))).filter((key) => key > state.lastKey).sort().slice(0, 32);
      if (!keys.length) {
        await deleteKey(BACKUP_INDEX_STORE, stateKey);
        return {};
      }
      await mapLimit(keys, IMPORT_PARALLEL, (key) => deleteKey(BACKUP_INDEX_STORE, key));
      state.lastKey = keys[keys.length - 1];
      state.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      await setJSON(BACKUP_INDEX_STORE, stateKey, state);
      return { continue: true };
    }
    async function cleanupOldBackupExports(event) {
      const keys = await listKeys(BACKUP_INDEX_STORE, BACKUP_EXPORT_PREFIX);
      const exportIds = new Set(keys.map((key) => key.slice(BACKUP_EXPORT_PREFIX.length).split(":")[0]).filter(Boolean));
      const now = Date.now();
      for (const exportId of exportIds) {
        const meta = await getJSON(BACKUP_INDEX_STORE, exportKey(exportId, "meta"));
        const job = await getExportJob(exportId);
        const createdAt = Date.parse(job?.createdAt || meta?.createdAt || "");
        if (!Number.isFinite(createdAt) || now - createdAt > BACKUP_SESSION_MAX_AGE_MS) {
          try {
            await scheduleBackupCleanup(event, exportId);
          } catch (error) {
            console.warn("failed to queue expired backup cleanup:", error);
            continue;
          }
          if (job?.actorEmail) await removeUserJob(job.actorEmail, "export", exportId);
        }
      }
    }
    function validateBackup(backup, allowLarge = false) {
      if (!backup || backup.format !== "netrify-data-backup" || ![1, BACKUP_VERSION].includes(backup.version) || !backup.stores) throw new Error("\u5BFE\u5FDC\u3057\u3066\u3044\u306A\u3044\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u5F62\u5F0F\u3067\u3059");
      const serialized = JSON.stringify(backup);
      if (!allowLarge && Buffer.byteLength(serialized, "utf8") > MAX_BACKUP_BYTES) throw new Error("\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u304C45MB\u3092\u8D85\u3048\u3066\u3044\u307E\u3059");
      for (const name of Object.keys(backup.stores)) {
        if (!BACKUP_STORES.includes(name)) throw new Error(`\u672A\u5BFE\u5FDC\u306E\u30B9\u30C8\u30A2\u3067\u3059: ${name}`);
        if (!Array.isArray(backup.stores[name])) throw new Error(`${name}\u306E\u5F62\u5F0F\u304C\u4E0D\u6B63\u3067\u3059`);
      }
    }
    async function restoreBackup(backup, actorEmail, allowLarge = false) {
      validateBackup(backup, allowLarge);
      const restored = {};
      for (const name of BACKUP_STORES) {
        const entries = backup.stores[name];
        if (!entries) continue;
        const storeName = STORE_NAMES[name];
        const existingKeys = await listKeys(storeName);
        const existingAccounts = {};
        if (name === "ACCOUNTS") for (const key of existingKeys) existingAccounts[key] = await getJSON(storeName, key);
        for (const key of existingKeys) await deleteKey(storeName, key);
        restored[name] = 0;
        for (const entry of entries) {
          if (!entry || typeof entry.key !== "string" || entry.value === null || entry.value === void 0) continue;
          let value = entry.value;
          if (name === "ACCOUNTS") {
            value = { ...value };
            if (!value.passwordHash || !value.salt) {
              const current = existingAccounts[entry.key];
              if (current?.passwordHash && current?.salt) {
                value.passwordHash = current.passwordHash;
                value.salt = current.salt;
                delete value.passwordResetRequired;
              } else value.passwordResetRequired = true;
            } else delete value.passwordResetRequired;
          }
          await setJSON(storeName, entry.key, value);
          restored[name]++;
        }
      }
      const audit = { kind: "audit", id: id(), actorEmail, action: "restoreBackup", targetType: "backup", targetId: backup.createdAt, detail: "\u5168\u30B9\u30C8\u30A2\u30FB\u30D1\u30B9\u30EF\u30FC\u30C9\u30CF\u30C3\u30B7\u30E5\u3092\u542B\u3080\u904B\u55B6\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u3092\u5FA9\u5143\u3002\u5E73\u6587\u30D1\u30B9\u30EF\u30FC\u30C9\u306F\u4FDD\u5B58\u5BFE\u8C61\u5916", createdAt: (/* @__PURE__ */ new Date()).toISOString() };
      await setJSON(STORE_NAMES.ADMIN_AUDIT, `audit:${audit.id}`, audit);
      return restored;
    }
    async function initializeImportProgress(importId, actorEmail) {
      const stateKey = importProgressKey(importId);
      const existing = await getJSON(BACKUP_INDEX_STORE, stateKey);
      if (existing) return existing;
      const meta = await getJSON(BACKUP_INDEX_STORE, importKey(importId, "meta"));
      if (!meta) throw new Error("\u5FA9\u5143\u30BB\u30C3\u30B7\u30E7\u30F3\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002\u30D5\u30A1\u30A4\u30EB\u3092\u9078\u3073\u76F4\u3057\u3066\u304F\u3060\u3055\u3044");
      const createdAt = Date.parse(meta.createdAtServer || "");
      if (!Number.isFinite(createdAt) || Date.now() - createdAt > BACKUP_SESSION_MAX_AGE_MS) throw new Error("\u5FA9\u5143\u30BB\u30C3\u30B7\u30E7\u30F3\u306E\u6709\u52B9\u671F\u9650\u304C\u5207\u308C\u307E\u3057\u305F\u3002\u30D5\u30A1\u30A4\u30EB\u3092\u9078\u3073\u76F4\u3057\u3066\u304F\u3060\u3055\u3044");
      const expectedPages = [];
      for (const [name, store] of Object.entries(meta.stores || {})) {
        for (let page = 0; page < Number(store.pages || 0); page += 1) expectedPages.push({ name, page });
      }
      const received = await mapLimit(
        expectedPages,
        8,
        async ({ name, page }) => await getJSONWithRetry(BACKUP_INDEX_STORE, importReceiptKey(importId, name, page)) === true
      );
      if (received.some((ok) => !ok)) throw new Error("\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u306E\u4E00\u90E8\u30DA\u30FC\u30B8\u304C\u5C4A\u3044\u3066\u3044\u307E\u305B\u3093\u3002\u6700\u521D\u304B\u3089\u8AAD\u307F\u8FBC\u307F\u76F4\u3057\u3066\u304F\u3060\u3055\u3044");
      const state = {
        importId,
        actorEmail,
        phase: "clear",
        status: "queued",
        storeIndex: 0,
        lastKey: "",
        page: 0,
        entry: 0,
        clearCount: 0,
        cleanedCount: 0,
        storeRestored: 0,
        stores: meta.stores || {},
        createdAt: meta.createdAt,
        accessHash: meta.accessHash,
        auditId: id(),
        restored: {},
        startedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      await setJSON(BACKUP_INDEX_STORE, stateKey, state);
      return state;
    }
    function importProgressResponse(state) {
      const storeName = BACKUP_STORES[state.storeIndex] || "";
      const storeMeta = state.stores?.[storeName] || {};
      const totalStores = Object.keys(state.stores || {}).length;
      const totalEntries = Object.values(state.stores || {}).reduce((sum, store) => sum + Number(store.count || 0), 0);
      const writtenEntries = Object.values(state.restored || {}).reduce((sum, count) => sum + Number(count || 0), 0);
      return {
        ok: true,
        done: state.phase === "done",
        status: state.status || (state.phase === "done" ? "done" : "running"),
        lastError: state.lastError || "",
        updatedAt: state.updatedAt || state.startedAt || "",
        ...state.phase === "done" ? { restored: state.restored } : {},
        progress: {
          phase: state.phase,
          store: storeName,
          storeIndex: Math.min(state.storeIndex + 1, totalStores),
          storeTotal: totalStores,
          storeCount: Number(storeMeta.count || 0),
          storeRestored: Number(state.restored?.[storeName] || 0),
          clearCount: Number(state.clearCount || 0),
          cleanedCount: Number(state.cleanedCount || 0),
          writtenEntries,
          totalEntries
        }
      };
    }
    async function advanceImportCommit(importId, actorEmail) {
      const stateKey = importProgressKey(importId);
      const state = await initializeImportProgress(importId, actorEmail);
      if (state.phase === "done") return importProgressResponse(state);
      for (let step = 0; step < IMPORT_MAX_STEPS_PER_REQUEST; step += 1) {
        if (state.phase === "clear") {
          const name = BACKUP_STORES[state.storeIndex];
          if (!name) {
            state.phase = "audit";
            continue;
          }
          if (!Object.prototype.hasOwnProperty.call(state.stores, name)) {
            state.storeIndex += 1;
            state.lastKey = "";
            state.clearCount = 0;
            continue;
          }
          const storeName = STORE_NAMES[name];
          const keys = (await listKeys(storeName)).filter((key) => key > state.lastKey && !(name === "SITE_STATE" && key === "global")).sort().slice(0, IMPORT_CLEAR_BATCH_SIZE);
          if (!keys.length) {
            state.phase = "write";
            state.page = 0;
            state.entry = 0;
            state.lastKey = "";
            state.clearCount = 0;
            state.storeRestored = 0;
            state.restored[name] = 0;
            continue;
          }
          if (name === "ACCOUNTS") {
            for (const key of keys) {
              const previous = await getJSON(storeName, key);
              if (previous) await setJSON(BACKUP_INDEX_STORE, importAccountFallbackKey(importId, key), previous);
            }
          }
          await mapLimit(keys, IMPORT_PARALLEL, (key) => deleteKey(storeName, key));
          state.lastKey = keys[keys.length - 1];
          state.clearCount += keys.length;
          break;
        }
        if (state.phase === "write") {
          const name = BACKUP_STORES[state.storeIndex];
          if (!name) {
            state.phase = "audit";
            continue;
          }
          if (!Object.prototype.hasOwnProperty.call(state.stores, name)) {
            state.storeIndex += 1;
            state.phase = "clear";
            state.lastKey = "";
            state.page = 0;
            state.entry = 0;
            continue;
          }
          const pageCount = Number(state.stores[name]?.pages || 0);
          if (state.page >= pageCount) {
            state.storeIndex += 1;
            state.phase = "clear";
            state.lastKey = "";
            state.page = 0;
            state.entry = 0;
            state.storeRestored = 0;
            continue;
          }
          const entries = await getJSONWithRetry(BACKUP_INDEX_STORE, importPageKey(importId, name, state.page));
          if (!Array.isArray(entries)) throw new Error(`${name}\u306E${state.page + 1}\u30DA\u30FC\u30B8\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002\u8AAD\u307F\u8FBC\u307F\u3092\u3084\u308A\u76F4\u3057\u3066\u304F\u3060\u3055\u3044`);
          if (state.entry >= entries.length) {
            state.page += 1;
            state.entry = 0;
            continue;
          }
          const batch = entries.slice(state.entry, state.entry + IMPORT_WRITE_BATCH_SIZE);
          let written = 0;
          await mapLimit(batch, IMPORT_PARALLEL, async (entry) => {
            if (!entry || typeof entry.key !== "string" || entry.value === null || entry.value === void 0) return;
            let value = entry.value;
            if (name === "SITE_STATE" && entry.key === "global") value = { ...value, locked: true, lockedAt: (/* @__PURE__ */ new Date()).toISOString(), lockedBy: actorEmail || state.actorEmail, message: "\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u5FA9\u5143\u5F8C\u306E\u78BA\u8A8D\u4E2D\u3067\u3059\u3002\u904B\u55B6\u304C\u30ED\u30C3\u30AF\u3092\u89E3\u9664\u3059\u308B\u307E\u3067\u30B5\u30A4\u30C8\u306F\u4FDD\u8B77\u3055\u308C\u3066\u3044\u307E\u3059\u3002" };
            if (name === "ACCOUNTS") {
              value = { ...value };
              if (!value.passwordHash || !value.salt) {
                const previous = await getJSON(BACKUP_INDEX_STORE, importAccountFallbackKey(importId, entry.key));
                if (previous?.passwordHash && previous?.salt) {
                  value.passwordHash = previous.passwordHash;
                  value.salt = previous.salt;
                  delete value.passwordResetRequired;
                } else value.passwordResetRequired = true;
              } else delete value.passwordResetRequired;
            }
            await setJSON(STORE_NAMES[name], entry.key, value);
            written += 1;
          });
          state.entry += batch.length;
          state.restored[name] = Number(state.restored[name] || 0) + written;
          state.storeRestored = Number(state.storeRestored || 0) + written;
          if (state.entry >= entries.length) {
            state.page += 1;
            state.entry = 0;
          }
          break;
        }
        if (state.phase === "audit") {
          const audit = {
            kind: "audit",
            id: state.auditId,
            actorEmail: state.actorEmail || actorEmail,
            action: "restoreBackup",
            targetType: "backup",
            targetId: state.createdAt,
            detail: "\u5168\u30B9\u30C8\u30A2\u30FB\u30D1\u30B9\u30EF\u30FC\u30C9\u30CF\u30C3\u30B7\u30E5\u3092\u542B\u3080\u904B\u55B6\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u3092\u5FA9\u5143\u3002\u5E73\u6587\u30D1\u30B9\u30EF\u30FC\u30C9\u306F\u4FDD\u5B58\u5BFE\u8C61\u5916",
            createdAt: (/* @__PURE__ */ new Date()).toISOString()
          };
          await setJSON(STORE_NAMES.ADMIN_AUDIT, `audit:${audit.id}`, audit);
          state.phase = "cleanup";
          state.lastKey = "";
          break;
        }
        if (state.phase === "cleanup") {
          const prefix = importKey(importId, "");
          const keys = (await listKeys(BACKUP_INDEX_STORE, prefix)).filter((key) => key > state.lastKey).sort().slice(0, IMPORT_CLEANUP_BATCH_SIZE);
          if (!keys.length) {
            state.phase = "done";
            state.completedAt = (/* @__PURE__ */ new Date()).toISOString();
            break;
          }
          await mapLimit(keys, IMPORT_PARALLEL, (key) => deleteKey(BACKUP_INDEX_STORE, key));
          state.lastKey = keys[keys.length - 1];
          state.cleanedCount += keys.length;
          break;
        }
        if (state.phase === "done") break;
        throw new Error("\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u5FA9\u5143\u72B6\u614B\u304C\u4E0D\u6B63\u3067\u3059\u3002\u6700\u521D\u304B\u3089\u8AAD\u307F\u8FBC\u307F\u76F4\u3057\u3066\u304F\u3060\u3055\u3044");
      }
      state.status = state.phase === "done" ? "done" : "running";
      state.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      await setJSON(BACKUP_INDEX_STORE, stateKey, state);
      return importProgressResponse(state);
    }
    async function saveExportJob(job) {
      job.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      await setJSON(BACKUP_INDEX_STORE, exportKey(job.exportId, "job"), job);
      return job;
    }
    async function getExportJob(exportId) {
      return getJSON(BACKUP_INDEX_STORE, exportKey(exportId, "job"));
    }
    function zipU16(value) {
      return Buffer.from([value & 255, value >>> 8 & 255]);
    }
    function zipU32(value) {
      return Buffer.from([value & 255, value >>> 8 & 255, value >>> 16 & 255, value >>> 24 & 255]);
    }
    function zipCrc32(bytes) {
      let crc = 4294967295;
      for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) crc = crc >>> 1 ^ (crc & 1 ? 3988292384 : 0);
      }
      return (crc ^ 4294967295) >>> 0;
    }
    function zipTimestamp(date = /* @__PURE__ */ new Date()) {
      return {
        time: date.getHours() << 11 | date.getMinutes() << 5 | Math.floor(date.getSeconds() / 2),
        date: Math.max(1980, date.getFullYear()) - 1980 << 9 | date.getMonth() + 1 << 5 | date.getDate()
      };
    }
    var SAFE_ARCHIVE_PART_BYTES = 3.5 * 1024 * 1024 * 1024;
    async function appendArchiveBytes(job, bytes) {
      const chunkBytes = 768 * 1024;
      if (!Array.isArray(job.archiveParts)) job.archiveParts = [];
      for (let offset = 0; offset < bytes.length; offset += chunkBytes) {
        const part = bytes.subarray(offset, Math.min(bytes.length, offset + chunkBytes));
        const partNo = Number(job.archivePartNumber || 0);
        const chunkNo = Number(job.archivePartChunkCount || 0);
        await setJSON(BACKUP_INDEX_STORE, exportKey(job.exportId, `archive-part:${partNo}:chunk:${chunkNo}`), { data: part.toString("base64"), bytes: part.length });
        job.archivePartChunkCount = chunkNo + 1;
        job.archivePartBytes = Number(job.archivePartBytes || 0) + part.length;
      }
    }
    async function startArchivePart(job) {
      const partNo = Number(job.archivePartNumber || 0);
      job.archivePartChunkCount = 0;
      job.archivePartBytes = 0;
      job.archivePartOffset = 0;
      job.archivePartCentralCount = 0;
      job.archivePartCentralBytes = 0;
      job.archivePartCentralOffset = 0;
      const manifest = { format: "netrify-multipart-zip-backup", version: 2, dataFormat: "netrify-data-backup", dataVersion: BACKUP_VERSION, backupId: job.exportId, partNumber: partNo + 1, partCount: null, passwordData: createBackupInfo().passwordData, security: createBackupInfo().security, createdAt: job.createdAt, stores: Object.fromEntries(Object.entries(job.stores || {}).map(([name, info]) => [name, { count: Number(info.count || 0) }])) };
      await appendArchiveEntry(job, `backup/manifest.json`, Buffer.from(JSON.stringify(manifest), "utf8"), true);
      await appendArchiveEntry(job, `manifest.json`, Buffer.from(JSON.stringify(manifest), "utf8"), true);
    }
    async function finishArchivePart(job) {
      const count = Number(job.archivePartCentralCount || 0);
      if (count >= 65535 || Number(job.archivePartOffset || 0) > 4294967295 || Number(job.archivePartCentralBytes || 0) > 4294967295) throw new Error("ZIP\u30D1\u30FC\u30C8\u304C\u6A19\u6E96ZIP\u306E\u4E0A\u9650\u3092\u8D85\u3048\u307E\u3057\u305F");
      const centralStart = Number(job.archivePartOffset || 0);
      let cursor = Number(job.archivePartCentralOffset || 0), written = 0;
      while (cursor < count) {
        const end = Math.min(count, cursor + 256);
        const batch = [];
        for (let index = cursor; index < end; index += 1) {
          const item = await getJSONWithRetry(BACKUP_INDEX_STORE, exportKey(job.exportId, `central:${job.archivePartNumber}:${index}`));
          if (!item?.data) throw new Error(`ZIP\u30D1\u30FC\u30C8\u306E\u7D22\u5F15 ${index} \u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093`);
          batch.push(Buffer.from(item.data, "base64"));
        }
        const bytes = Buffer.concat(batch);
        await appendArchiveBytes(job, bytes);
        written += bytes.length;
        cursor = end;
        job.archivePartCentralOffset = cursor;
      }
      if (centralStart > 4294967295 || written > 4294967295) throw new Error("ZIP\u30D1\u30FC\u30C8\u306ECentral Directory\u304C\u6A19\u6E96ZIP\u306E\u4E0A\u9650\u3092\u8D85\u3048\u307E\u3057\u305F");
      const endRecord = Buffer.concat([Buffer.from([80, 75, 5, 6]), zipU16(0), zipU16(0), zipU16(count), zipU16(count), zipU32(written), zipU32(centralStart), zipU16(0)]);
      await appendArchiveBytes(job, endRecord);
      if (!Array.isArray(job.archiveParts)) job.archiveParts = [];
      job.archiveParts.push({ partNumber: Number(job.archivePartNumber || 0) + 1, chunks: Number(job.archivePartChunkCount || 0), bytes: Number(job.archivePartBytes || 0) });
      job.archivePartNumber = Number(job.archivePartNumber || 0) + 1;
    }
    async function appendArchiveEntry(job, fileName, rawBytes, force = false) {
      const name = Buffer.from(fileName, "utf8");
      const raw = Buffer.isBuffer(rawBytes) ? rawBytes : Buffer.from(rawBytes);
      const compressed = zlib.deflateRawSync(raw);
      if (name.length > 65535 || compressed.length > 4294967295 || raw.length > 4294967295) throw new Error("ZIP\u5185\u306E\u30D5\u30A1\u30A4\u30EB\u30B5\u30A4\u30BA\u304C\u6A19\u6E96ZIP\u306E\u4E0A\u9650\u3092\u8D85\u3048\u307E\u3057\u305F");
      const crc = zipCrc32(raw), { time, date } = zipTimestamp(new Date(job.createdAt));
      const local = Buffer.concat([Buffer.from([80, 75, 3, 4]), zipU16(20), zipU16(2048), zipU16(8), zipU16(time), zipU16(date), zipU32(crc), zipU32(compressed.length), zipU32(raw.length), zipU16(name.length), zipU16(0), name, compressed]);
      const central = Buffer.concat([Buffer.from([80, 75, 1, 2]), zipU16(20), zipU16(20), zipU16(2048), zipU16(8), zipU16(time), zipU16(date), zipU32(crc), zipU32(compressed.length), zipU32(raw.length), zipU16(name.length), zipU16(0), zipU16(0), zipU16(0), zipU16(0), zipU32(0), zipU32(job.archivePartOffset || 0), name]);
      const projected = Number(job.archivePartOffset || 0) + local.length + Number(job.archivePartCentralBytes || 0) + central.length + 22;
      if (!force && Number(job.archivePartCentralCount || 0) > 0 && projected > SAFE_ARCHIVE_PART_BYTES) {
        await finishArchivePart(job);
        await startArchivePart(job);
        return appendArchiveEntry(job, fileName, rawBytes, true);
      }
      if (projected > SAFE_ARCHIVE_PART_BYTES) throw new Error("ZIP\u30D1\u30FC\u30C8\u5185\u306E\u5358\u4E00\u30C7\u30FC\u30BF\u304C\u5B89\u5168\u4E0A\u9650\u3092\u8D85\u3048\u307E\u3057\u305F");
      await appendArchiveBytes(job, local);
      await setJSON(BACKUP_INDEX_STORE, exportKey(job.exportId, `central:${job.archivePartNumber}:${job.archivePartCentralCount}`), { data: central.toString("base64") });
      job.archivePartOffset = Number(job.archivePartOffset || 0) + local.length;
      job.archivePartCentralCount = Number(job.archivePartCentralCount || 0) + 1;
      job.archivePartCentralBytes = Number(job.archivePartCentralBytes || 0) + central.length;
    }
    async function beginArchive(job) {
      job.phase = "archive";
      job.archiveStoreIndex = 0;
      job.archiveEntryOffset = 0;
      job.archivePartIndex = 0;
      job.archivePartNumber = 0;
      job.archiveParts = [];
      job.archiveManifestAdded = true;
      await startArchivePart(job);
      await saveExportJob(job);
    }
    async function archiveSnapshotBatch(job, name) {
      const info = job.stores[name] || { count: 0 };
      const count = Number(info.count || 0), start = Number(job.archiveEntryOffset || 0);
      const targetBytes = 18e5, maxEntries = 100;
      let offset = start, bytes = 2;
      const entries = [];
      const ahead = Math.max(0, Math.min(maxEntries, count - start));
      const fetched = await mapLimit(Array.from({ length: ahead }, (_, i) => start + i), 16, (o) => getJSONWithRetry(BACKUP_INDEX_STORE, exportKey(job.exportId, `data:${name}:${o}`)));
      while (offset < start + ahead && entries.length < maxEntries) {
        const item = fetched[offset - start];
        if (item?.found) {
          const entry = { key: item.key, value: item.value };
          const entryBytes = Buffer.byteLength(JSON.stringify(entry), "utf8");
          if (entries.length && bytes + entryBytes > targetBytes) break;
          entries.push(entry);
          bytes += entryBytes;
        }
        offset += 1;
      }
      if (entries.length) {
        const file = `blob/${name}/part-${String(job.archivePartIndex || 0).padStart(6, "0")}.json`;
        await appendArchiveEntry(job, file, Buffer.from(JSON.stringify({ entries }), "utf8"));
        job.archivePartIndex = Number(job.archivePartIndex || 0) + 1;
      }
      job.archiveEntryOffset = offset;
    }
    async function prepareExportIndexes(job) {
      while (Number(job.preparedStoreIndex || 0) < BACKUP_STORES.length) {
        const storeIndex = Number(job.preparedStoreIndex || 0);
        const name = BACKUP_STORES[storeIndex];
        const keys = await listKeys(STORE_NAMES[name]);
        const pageSize = pageSizeFor(name);
        const info = { count: keys.length, pageSize, pages: Math.ceil(keys.length / pageSize), keyHash: crypto.createHash("sha256").update(keys.slice().sort().join("\n")).digest("hex") };
        job.stores[name] = info;
        for (let page = 0; page < Math.ceil(keys.length / BACKUP_INDEX_PAGE_SIZE); page += 1) {
          const selected = keys.slice(page * BACKUP_INDEX_PAGE_SIZE, (page + 1) * BACKUP_INDEX_PAGE_SIZE);
          await setJSON(BACKUP_INDEX_STORE, exportKey(job.exportId, `index:${name}:${page}`), selected);
        }
        job.preparedStoreIndex = storeIndex + 1;
        job.progress = { phase: "index", store: name, storeIndex: job.preparedStoreIndex, storeTotal: BACKUP_STORES.length, entries: 0, total: BACKUP_STORES.reduce((sum, key) => sum + Number(job.stores[key]?.count || 0), 0) };
        await saveExportJob(job);
      }
      job.phase = "snapshot";
      job.storeIndex = Number(job.storeIndex || 0);
      job.offset = Number(job.offset || 0);
      await setJSON(BACKUP_INDEX_STORE, exportKey(job.exportId, "meta"), { exportId: job.exportId, createdAt: job.createdAt, stores: job.stores });
      await saveExportJob(job);
    }
    async function processBackupExport(payload) {
      const exportId = String(payload?.exportId || "");
      if (!/^[a-f0-9]{20}$/.test(exportId)) throw new Error("\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7ID\u304C\u4E0D\u6B63\u3067\u3059");
      const job = await getExportJob(exportId);
      if (!job) throw new Error("\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u30B8\u30E7\u30D6\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093");
      if (job.status === "ready" || job.status === "cancelled") return {};
      if (job.status === "failed") throw new Error(job.lastError || "\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u30B8\u30E7\u30D6\u306F\u5931\u6557\u72B6\u614B\u3067\u3059");
      if (Number(job.expiresAt || 0) < Date.now()) throw new Error("\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u30B8\u30E7\u30D6\u306E\u6709\u52B9\u671F\u9650\u304C\u5207\u308C\u307E\u3057\u305F");
      job.status = "running";
      job.attempts = Number(job.attempts || 0) + 1;
      job.lastError = "";
      await saveExportJob(job);
      if (job.phase === "index") await prepareExportIndexes(job);
      const started = Date.now();
      let currentIndexPage = -1;
      let cachedKeys = [];
      let processed = 0;
      while (Date.now() - started < BACKGROUND_SLICE_MS) {
        if (job.phase === "archive") {
          if (!job.archiveManifestAdded) {
            await beginArchive(job);
            continue;
          }
          const name2 = BACKUP_STORES[Number(job.archiveStoreIndex || 0)];
          if (!name2) {
            await finishArchivePart(job);
            job.phase = "ready";
            job.status = "ready";
            job.completedAt = (/* @__PURE__ */ new Date()).toISOString();
            job.progress = { phase: "ready", entries: job.progress?.total || 0, total: job.progress?.total || 0, archiveParts: job.archiveParts, archiveBytes: job.archiveParts.reduce((n, p) => n + p.bytes, 0) };
            await saveExportJob(job);
            const meta = await getJSON(BACKUP_INDEX_STORE, exportKey(exportId, "meta"));
            if (meta) {
              meta.status = "ready";
              meta.completedAt = job.completedAt;
              meta.archiveParts = job.archiveParts;
              await setJSON(BACKUP_INDEX_STORE, exportKey(exportId, "meta"), meta);
            }
            return {};
          }
          const info2 = job.stores?.[name2] || { count: 0 };
          if (Number(job.archiveEntryOffset || 0) >= Number(info2.count || 0)) {
            job.archiveStoreIndex = Number(job.archiveStoreIndex || 0) + 1;
            job.archiveEntryOffset = 0;
            job.archivePartIndex = 0;
            await saveExportJob(job);
            continue;
          }
          await archiveSnapshotBatch(job, name2);
          job.progress = { ...job.progress, phase: "archive", store: name2, storeIndex: Number(job.archiveStoreIndex || 0) + 1, storeTotal: BACKUP_STORES.length, archiveFiles: Number(job.centralCount || 0), archiveBytes: Number(job.archiveTotalBytes || 0) };
          await saveExportJob(job);
          continue;
        }
        if (job.phase !== "snapshot") throw new Error(`\u672A\u5BFE\u5FDC\u306E\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u6BB5\u968E\u3067\u3059: ${job.phase}`);
        const name = BACKUP_STORES[Number(job.storeIndex || 0)];
        if (!name) {
          await beginArchive(job);
          continue;
        }
        const info = job.stores?.[name] || { count: 0 };
        if (Number(job.offset || 0) >= Number(info.count || 0)) {
          job.storeIndex = Number(job.storeIndex || 0) + 1;
          job.offset = 0;
          currentIndexPage = -1;
          await saveExportJob(job);
          continue;
        }
        const offset = Number(job.offset || 0);
        const indexPage = Math.floor(offset / BACKUP_INDEX_PAGE_SIZE);
        if (indexPage !== currentIndexPage) {
          cachedKeys = await getJSON(BACKUP_INDEX_STORE, exportKey(exportId, `index:${name}:${indexPage}`));
          if (!Array.isArray(cachedKeys)) throw new Error(`${name}\u306E\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u7D22\u5F15\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093`);
          currentIndexPage = indexPage;
        }
        // 並列化: 同じ索引ページ内の最大96件をまとめて読み書きする(運営端末・サーバー共に余裕がある前提)
        const span = Math.max(1, Math.min(SNAPSHOT_CHUNK, Number(info.count || 0) - offset, BACKUP_INDEX_PAGE_SIZE - (offset % BACKUP_INDEX_PAGE_SIZE)));
        const offs = Array.from({ length: span }, (_, i) => offset + i);
        const pageKeys = cachedKeys;
        await mapLimit(offs, SNAPSHOT_PARALLEL, async (o) => {
          const key = pageKeys[o % BACKUP_INDEX_PAGE_SIZE];
          if (typeof key === "string") {
            const value = await getJSON(STORE_NAMES[name], key);
            await setJSON(BACKUP_INDEX_STORE, exportKey(exportId, `data:${name}:${o}`), { key, found: value !== null && value !== void 0, ...value === null || value === void 0 ? {} : { value } });
          } else {
            await setJSON(BACKUP_INDEX_STORE, exportKey(exportId, `data:${name}:${o}`), { found: false });
          }
        });
        job.offset = offset + span;
        processed += span;
        job.progress = { phase: "snapshot", store: name, storeIndex: Number(job.storeIndex || 0) + 1, storeTotal: BACKUP_STORES.length, storeCount: Number(info.count || 0), storeDone: job.offset, entries: Number(job.progress?.entries || 0) + span, total: BACKUP_STORES.reduce((sum, storeName) => sum + Number(job.stores?.[storeName]?.count || 0), 0) };
        await saveExportJob(job);
      }
      job.status = "queued";
      await saveExportJob(job);
      return { continue: true };
    }
    async function processBackupImport(payload) {
      const importId = String(payload?.importId || "");
      if (!/^[a-f0-9]{48}$/.test(importId)) throw new Error("\u5FA9\u5143ID\u304C\u4E0D\u6B63\u3067\u3059");
      const meta = await getJSON(BACKUP_INDEX_STORE, importKey(importId, "meta"));
      if (!meta) throw new Error("\u5FA9\u5143\u30BB\u30C3\u30B7\u30E7\u30F3\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093");
      const state = await initializeImportProgress(importId, meta.actorEmail || "");
      if (state.phase === "done") return {};
      state.status = "running";
      state.lastError = "";
      state.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      await setJSON(BACKUP_INDEX_STORE, importProgressKey(importId), state);
      const started = Date.now();
      let latest = importProgressResponse(state);
      while (Date.now() - started < BACKGROUND_SLICE_MS) {
        latest = await advanceImportCommit(importId, meta.actorEmail || "");
        if (latest.done) {
          await maintainRestoreSiteLock(meta.actorEmail || "");
          return {};
        }
        await maintainRestoreSiteLock(meta.actorEmail || "");
      }
      const saved = await getJSON(BACKUP_INDEX_STORE, importProgressKey(importId));
      if (saved) {
        saved.status = "queued";
        saved.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        await setJSON(BACKUP_INDEX_STORE, importProgressKey(importId), saved);
      }
      return { continue: true };
    }
    async function markBackupBackgroundFailure(payload, error, terminal) {
      const text = String(error?.message || error || "Background\u51E6\u7406\u306B\u5931\u6557\u3057\u307E\u3057\u305F").slice(0, 400);
      if (payload?.exportId) {
        const job = await getExportJob(String(payload.exportId));
        if (job) {
          job.status = terminal ? "failed" : "retrying";
          job.lastError = text;
          job.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
          await saveExportJob(job);
        }
      }
      if (payload?.importId) {
        const key = importProgressKey(String(payload.importId));
        const state = await getJSON(BACKUP_INDEX_STORE, key);
        if (state) {
          state.status = terminal ? "failed" : "retrying";
          state.lastError = text;
          state.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
          await setJSON(BACKUP_INDEX_STORE, key, state);
        }
      }
      if (payload?.cleanupExportId) {
        const key = `backup-cleanup:${String(payload.cleanupExportId)}:state`;
        const state = await getJSON(BACKUP_INDEX_STORE, key) || { exportId: String(payload.cleanupExportId) };
        state.status = terminal ? "failed" : "retrying";
        state.lastError = text;
        state.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        await setJSON(BACKUP_INDEX_STORE, key, state);
      }
    }
    async function startBackupExport(event, admin) {
      await cleanupOldBackupExports(event);
      const exportId = id();
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const job = { exportId, actorEmail: admin.email, status: "queued", phase: "index", preparedStoreIndex: 0, storeIndex: 0, offset: 0, stores: {}, progress: { phase: "index", storeIndex: 0, storeTotal: BACKUP_STORES.length, entries: 0, total: 0 }, createdAt: now, updatedAt: now, expiresAt: Date.now() + BACKUP_SESSION_MAX_AGE_MS, attempts: 0 };
      await saveExportJob(job);
      await registerUserJob(admin.email, "export", exportId);
      try {
        await enqueueBackgroundTask(event, "backup-export", { exportId });
      } catch (error) {
        await markBackupBackgroundFailure({ exportId }, error, true);
        throw error;
      }
      return { exportId, status: "queued" };
    }
    async function resumeBackupExport(event, exportId, admin) {
      const job = await getExportJob(String(exportId || ""));
      if (!job || String(job.actorEmail || "").toLowerCase() !== String(admin.email || "").toLowerCase()) throw new Error("\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u30B8\u30E7\u30D6\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093");
      if (job.status === "ready") return { exportId: job.exportId, status: "ready" };
      if (Number(job.expiresAt || 0) < Date.now()) throw new Error("\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u30B8\u30E7\u30D6\u306E\u6709\u52B9\u671F\u9650\u304C\u5207\u308C\u307E\u3057\u305F\u3002\u65B0\u3057\u3044\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u3092\u958B\u59CB\u3057\u3066\u304F\u3060\u3055\u3044");
      const lastUpdate = Date.parse(job.updatedAt || job.createdAt || "");
      if (["queued", "running", "retrying"].includes(job.status) && Number.isFinite(lastUpdate) && Date.now() - lastUpdate < 10 * 60 * 1e3) throw new Error("\u3053\u306E\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u306F\u73FE\u5728\u51E6\u7406\u4E2D\u3067\u3059\u3002\u3057\u3070\u3089\u304F\u3057\u3066\u304B\u3089\u72B6\u6CC1\u3092\u66F4\u65B0\u3057\u3066\u304F\u3060\u3055\u3044");
      job.status = "queued";
      job.lastError = "";
      await saveExportJob(job);
      try {
        await enqueueBackgroundTask(event, "backup-export", { exportId: job.exportId });
      } catch (error) {
        await markBackupBackgroundFailure({ exportId: job.exportId }, error, true);
        throw error;
      }
      return { exportId: job.exportId, status: "queued" };
    }
    async function startBackupImport(event, importId, admin) {
      const meta = await getJSON(BACKUP_INDEX_STORE, importKey(importId, "meta"));
      if (!meta || String(meta.actorEmail || "").toLowerCase() !== String(admin.email || "").toLowerCase()) throw new Error("\u5FA9\u5143\u30BB\u30C3\u30B7\u30E7\u30F3\u306E\u6240\u6709\u8005\u3092\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093");
      const state = await initializeImportProgress(importId, admin.email);
      if (state.phase === "done") return importProgressResponse(state);
      const lastUpdate = Date.parse(state.updatedAt || state.startedAt || "");
      if (["queued", "running"].includes(state.status) && Number.isFinite(lastUpdate) && Date.now() - lastUpdate < 10 * 60 * 1e3) return importProgressResponse(state);
      await maintainRestoreSiteLock(admin.email);
      state.status = "queued";
      state.lastError = "";
      state.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      await setJSON(BACKUP_INDEX_STORE, importProgressKey(importId), state);
      try {
        await enqueueBackgroundTask(event, "backup-import", { importId });
      } catch (error) {
        await markBackupBackgroundFailure({ importId }, error, true);
        throw error;
      }
      await registerUserJob(admin.email, "import", importId);
      return importProgressResponse(state);
    }
    async function listBackupJobs(email) {
      const keys = await listKeys(BACKUP_INDEX_STORE, userJobPrefix(email));
      const jobs = [];
      for (const key of keys) {
        const ref = await getJSON(BACKUP_INDEX_STORE, key);
        if (!ref) continue;
        if (ref.type === "export") {
          const job = await getExportJob(ref.jobId);
          if (job && Date.now() <= Number(job.expiresAt || 0)) {
            const age = Date.now() - Date.parse(job.updatedAt || job.createdAt || "");
            const canResume = job.status === "failed" || job.status === "retrying" || ["queued", "running"].includes(job.status) && age > 10 * 60 * 1e3;
            jobs.push({ type: "export", id: job.exportId, status: job.status, phase: job.phase, progress: job.progress, canResume, createdAt: job.createdAt, updatedAt: job.updatedAt, lastError: job.lastError || "" });
          } else await deleteKey(BACKUP_INDEX_STORE, key);
        } else if (ref.type === "import") {
          const state = await getJSON(BACKUP_INDEX_STORE, importProgressKey(ref.jobId));
          const meta = await getJSON(BACKUP_INDEX_STORE, importKey(ref.jobId, "meta"));
          if (!meta && state?.phase !== "done") {
            await deleteKey(BACKUP_INDEX_STORE, key);
            continue;
          }
          if (meta && Date.now() - Date.parse(meta.createdAtServer || "") > BACKUP_SESSION_MAX_AGE_MS && state?.phase !== "done") {
            await deleteKey(BACKUP_INDEX_STORE, key);
            continue;
          }
          const status = state?.status || (state?.phase === "done" ? "done" : "uploading");
          jobs.push({ type: "import", id: ref.jobId, status, progress: state ? importProgressResponse(state).progress : { phase: "uploading", receivedPages: Number(meta?.receivedPages || 0), totalPages: Object.values(meta?.stores || {}).reduce((sum, store) => sum + Number(store.pages || 0), 0) }, createdAt: meta?.createdAtServer || state?.startedAt, updatedAt: state?.updatedAt || meta?.createdAtServer, lastError: state?.lastError || "" });
        }
      }
      return jobs.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))).slice(0, 30);
    }
    async function resumeStaleImportJobs(event, admin, jobs) {
      const now = Date.now();
      const stale = jobs.filter((job) => {
        if (job.type !== "import" || !["queued", "running", "retrying"].includes(job.status)) return false;
        const updated = Date.parse(job.updatedAt || job.createdAt || "");
        return Number.isFinite(updated) && now - updated >= 10 * 60 * 1e3;
      });
      for (const job of stale) {
        try {
          await startBackupImport(event, job.id, admin);
        } catch (error) {
          console.warn("failed to auto-resume stale backup import:", job.id, error);
        }
      }
      return stale.length;
    }
    exports.processBackgroundTask = async (payload) => payload?.cleanupExportId ? processBackupCleanup(payload) : payload?.exportId ? processBackupExport(payload) : processBackupImport(payload);
    exports.markBackgroundFailure = markBackupBackgroundFailure;
    exports.handler = async (event) => {
      connectLambda2(event);
      if (event.httpMethod !== "POST") return json(405, { error: "POST\u306E\u307F\u5BFE\u5FDC\u3057\u3066\u3044\u307E\u3059" });
      let payload;
      try {
        payload = JSON.parse(event.body || "{}");
      } catch {
        return json(400, { error: "\u4E0D\u6B63\u306AJSON\u3067\u3059" });
      }
      try {
        const action = String(payload.action || "");
        let admin;
        if (action === "importChunk" || action === "importCommit") {
          admin = await authorizeImportContinuation(payload.importId, payload.importToken);
          if (!admin) return json(403, { error: "\u5FA9\u5143\u30BB\u30C3\u30B7\u30E7\u30F3\u306E\u8A8D\u8A3C\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002\u904B\u55B6\u30A2\u30AB\u30A6\u30F3\u30C8\u304B\u3089\u8AAD\u307F\u8FBC\u307F\u76F4\u3057\u3066\u304F\u3060\u3055\u3044" });
        } else {
          admin = await requireAdmin(payload.token);
          if (!admin) return json(403, { error: "\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u64CD\u4F5C\u306F\u904B\u55B6\u306E\u307F\u5229\u7528\u3067\u304D\u307E\u3059" });
        }
        if (payload.action === "startExport") return json(200, await startBackupExport(event, admin));
        if (payload.action === "resumeExport") return json(200, await resumeBackupExport(event, payload.exportId, admin));
        if (payload.action === "exportStatus") {
          const exportId = String(payload.exportId || "");
          const job = await getExportJob(exportId);
          if (!job || String(job.actorEmail || "").toLowerCase() !== String(admin.email || "").toLowerCase()) return json(404, { error: "\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u30B8\u30E7\u30D6\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
          return json(200, { ok: true, job: { exportId: job.exportId, status: job.status, phase: job.phase, progress: job.progress, createdAt: job.createdAt, updatedAt: job.updatedAt, lastError: job.lastError || "" } });
        }
        if (payload.action === "archiveManifest") {
          const exportId = String(payload.exportId || "");
          const job = await getExportJob(exportId);
          if (!job || String(job.actorEmail || "").toLowerCase() !== String(admin.email || "").toLowerCase()) return json(404, { error: "\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u30B8\u30E7\u30D6\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
          if (job.status !== "ready" || !Number.isInteger(Number(job.archiveChunkCount))) return json(409, { error: "ZIP\u30A2\u30FC\u30AB\u30A4\u30D6\u306E\u6E96\u5099\u304C\u5B8C\u4E86\u3057\u3066\u3044\u307E\u305B\u3093" });
          const parts = Array.isArray(job.archiveParts) && job.archiveParts.length ? job.archiveParts : [{ partNumber: 1, chunks: Number(job.archiveChunkCount || 0), bytes: Number(job.archiveTotalBytes || 0), legacy: true }];
          return json(200, { exportId, format: parts.length > 1 ? "multipart-application/zip" : "application/zip", parts, createdAt: job.createdAt });
        }
        if (payload.action === "archiveChunk") {
          const exportId = String(payload.exportId || "");
          const job = await getExportJob(exportId);
          if (!job || String(job.actorEmail || "").toLowerCase() !== String(admin.email || "").toLowerCase()) return json(404, { error: "\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u30B8\u30E7\u30D6\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
          if (job.status !== "ready") return json(409, { error: "\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u306E\u6E96\u5099\u304C\u5B8C\u4E86\u3057\u3066\u3044\u307E\u305B\u3093" });
          const part = Math.max(0, Number(payload.part) || 0), offset = Math.max(0, Number(payload.offset) || 0), limit = Math.min(2, Math.max(1, Number(payload.limit) || 2));
          const info = job.archiveParts?.[part] || (part === 0 && !Array.isArray(job.archiveParts) ? { chunks: Number(job.archiveChunkCount || 0), bytes: Number(job.archiveTotalBytes || 0), legacy: true } : null);
          if (!info) return json(404, { error: "ZIP\u30D1\u30FC\u30C8\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
          if (offset >= Number(info.chunks)) return json(200, { part, offset, nextOffset: offset, done: true, data: "" });
          const parts = [];
          for (let index = offset; index < Math.min(Number(info.chunks), offset + limit); index += 1) {
            const item = await getJSONWithRetry(BACKUP_INDEX_STORE, info.legacy ? exportKey(exportId, `archive-chunk:${index}`) : exportKey(exportId, `archive-part:${part}:chunk:${index}`));
            if (!item?.data) return json(404, { error: `ZIP\u30D1\u30FC\u30C8 ${part + 1} \u306E\u30C1\u30E3\u30F3\u30AF ${index} \u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093` });
            parts.push(Buffer.from(item.data, "base64"));
          }
          const nextOffset = offset + parts.length;
          return json(200, { part, offset, nextOffset, done: nextOffset >= Number(info.chunks), data: Buffer.concat(parts).toString("base64") });
        }
        if (payload.action === "exportManifest") {
          const exportId = String(payload.exportId || "");
          const job = await getExportJob(exportId);
          if (!job || String(job.actorEmail || "").toLowerCase() !== String(admin.email || "").toLowerCase()) return json(404, { error: "\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u30B8\u30E7\u30D6\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
          if (job.status !== "ready") return json(409, { error: "\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u306E\u6E96\u5099\u304C\u5B8C\u4E86\u3057\u3066\u3044\u307E\u305B\u3093" });
          const meta = await getJSON(BACKUP_INDEX_STORE, exportKey(exportId, "meta"));
          if (!meta) return json(404, { error: "\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u7D22\u5F15\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
          return json(200, { manifest: { ...createBackupInfo(), format: "netrify-data-backup-manifest", createdAt: job.createdAt, exportId, stores: meta.stores } });
        }
        if (payload.action === "jobs") {
          const jobs = await listBackupJobs(admin.email);
          await resumeStaleImportJobs(event, admin, jobs);
          return json(200, { jobs: await listBackupJobs(admin.email) });
        }
        if (payload.action === "importStatus") {
          const importId = String(payload.importId || "");
          const meta = await getJSON(BACKUP_INDEX_STORE, importKey(importId, "meta"));
          const state = await getJSON(BACKUP_INDEX_STORE, importProgressKey(importId));
          const actorEmail = meta?.actorEmail || state?.actorEmail || "";
          if (!meta && state?.phase !== "done" || String(actorEmail).toLowerCase() !== String(admin.email || "").toLowerCase()) return json(404, { error: "\u5FA9\u5143\u30B8\u30E7\u30D6\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
          if (state) return json(200, importProgressResponse(state));
          const received = await listKeys(BACKUP_INDEX_STORE, importKey(importId, "received:"));
          return json(200, { ok: true, done: false, status: "uploading", progress: { phase: "uploading", receivedPages: received.length, totalPages: Object.values(meta.stores || {}).reduce((sum, store) => sum + Number(store.pages || 0), 0) } });
        }
        if (payload.action === "startImportCommit") {
          const importId = String(payload.importId || "");
          return json(200, await startBackupImport(event, importId, admin));
        }
        if (payload.action === "manifest" || payload.action === "chunk" || payload.action === "export") return json(409, { error: "\u540C\u671F\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u306F\u7121\u52B9\u3067\u3059\u3002\u904B\u55B6\u753B\u9762\u304B\u3089Background\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u3092\u958B\u59CB\u3057\u3066\u304F\u3060\u3055\u3044\u3002" });
        if (payload.action === "cancelExport") {
          const exportId = String(payload.exportId || "");
          const job = await getExportJob(exportId);
          if (job && String(job.actorEmail || "").toLowerCase() !== String(admin.email || "").toLowerCase()) return json(404, { error: "\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u30B8\u30E7\u30D6\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
          await scheduleBackupCleanup(event, exportId);
          if (job?.actorEmail) await removeUserJob(admin.email, "export", exportId);
          return json(202, { ok: true, status: "cleanup queued" });
        }
        if (payload.action === "importBegin") {
          const backup = payload.backup || {};
          if (backup.format !== "netrify-data-backup" || ![1, BACKUP_VERSION].includes(backup.version) || !backup.stores) return json(400, { error: "\u5BFE\u5FDC\u3057\u3066\u3044\u306A\u3044\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u5F62\u5F0F\u3067\u3059" });
          const importId = crypto.randomBytes(24).toString("hex");
          const importToken = crypto.randomBytes(32).toString("hex");
          const stores = {};
          for (const name of Object.keys(backup.stores)) {
            if (!BACKUP_STORES.includes(name)) return json(400, { error: `\u672A\u5BFE\u5FDC\u306E\u30B9\u30C8\u30A2\u3067\u3059: ${name}` });
            const pages = Number(backup.stores[name].pages || 0);
            const count = Number(backup.stores[name].count || 0);
            if (!Number.isSafeInteger(pages) || pages < 0 || !Number.isSafeInteger(count) || count < 0 || count > 0 && pages === 0) return json(400, { error: `${name}\u306E\u30DA\u30FC\u30B8\u60C5\u5831\u304C\u4E0D\u6B63\u3067\u3059` });
            stores[name] = { pages, count };
          }
          await setJSON(BACKUP_INDEX_STORE, importKey(importId, "meta"), { importId, actorEmail: admin.email, accessHash: importAccessHash(importToken), format: backup.format, version: backup.version, passwordData: backup.passwordData, security: backup.security, createdAt: backup.createdAt || (/* @__PURE__ */ new Date()).toISOString(), stores, receivedPages: 0, createdAtServer: (/* @__PURE__ */ new Date()).toISOString() });
          await registerUserJob(admin.email, "import", importId);
          return json(200, { importId, importToken });
        }
        if (payload.action === "importReceivedPages") {
          const importId = String(payload.importId || "");
          const meta = await getJSON(BACKUP_INDEX_STORE, importKey(importId, "meta"));
          if (!meta) return json(404, { error: "\u5FA9\u5143\u30BB\u30C3\u30B7\u30E7\u30F3\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
          const name = String(payload.store || "");
          if (!BACKUP_STORES.includes(name)) return json(400, { error: "\u5FA9\u5143\u30B9\u30C8\u30A2\u304C\u4E0D\u6B63\u3067\u3059" });
          const keys = await listKeys(BACKUP_INDEX_STORE, importKey(importId, `received:${name}:`));
          const receivedPages = keys.map((key) => Number(String(key).split(":").pop())).filter(Number.isSafeInteger).sort((a, b) => a - b);
          return json(200, { ok: true, importId, store: name, receivedPages });
        }
        if (payload.action === "importChunkFragment") {
          const importId = String(payload.importId || "");
          const meta = await getJSON(BACKUP_INDEX_STORE, importKey(importId, "meta"));
          if (!meta) return json(404, { error: "\u5FA9\u5143\u30BB\u30C3\u30B7\u30E7\u30F3\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
          const name = String(payload.store || ""), page = Number(payload.page);
          const fragmentIndex = Number(payload.fragmentIndex), totalFragments = Number(payload.totalFragments), totalBytes = Number(payload.totalBytes);
          if (!BACKUP_STORES.includes(name) || !Number.isSafeInteger(page) || page < 0 || page >= Number(meta.stores?.[name]?.pages || 0) || !Number.isSafeInteger(fragmentIndex) || fragmentIndex < 0 || !Number.isSafeInteger(totalFragments) || totalFragments < 1 || fragmentIndex >= totalFragments || !Number.isSafeInteger(totalBytes) || totalBytes < 1 || totalBytes > 64 * 1024 * 1024 || typeof payload.data !== "string") return json(400, { error: "\u5FA9\u5143\u30D5\u30E9\u30B0\u30E1\u30F3\u30C8\u306E\u5F62\u5F0F\u304C\u4E0D\u6B63\u3067\u3059" });
          const fragmentKey = importKey(importId, `fragment:${name}:${page}:${fragmentIndex}`);
          await setJSON(BACKUP_INDEX_STORE, fragmentKey, { totalFragments, totalBytes, sha256: String(payload.sha256 || ""), data: payload.data });
          const fragments = [];
          for (let index = 0; index < totalFragments; index += 1) {
            const item = await getJSONWithRetry(BACKUP_INDEX_STORE, importKey(importId, `fragment:${name}:${page}:${index}`));
            if (!item) return json(200, { ok: true, importId, store: name, page, fragmentIndex, received: false });
            fragments.push(item);
          }
          const raw = Buffer.concat(fragments.map((item) => Buffer.from(item.data, "base64")));
          const expected = fragments[0];
          if (raw.length !== expected.totalBytes || fragments.some((item) => item.totalFragments !== expected.totalFragments || item.totalBytes !== expected.totalBytes || item.sha256 !== expected.sha256)) return json(400, { error: "\u5FA9\u5143\u30D5\u30E9\u30B0\u30E1\u30F3\u30C8\u306E\u30E1\u30BF\u30C7\u30FC\u30BF\u304C\u4E00\u81F4\u3057\u307E\u305B\u3093" });
          if (expected.sha256 && crypto.createHash("sha256").update(raw).digest("hex") !== expected.sha256) return json(400, { error: "\u5FA9\u5143\u30D5\u30E9\u30B0\u30E1\u30F3\u30C8\u306E\u30C1\u30A7\u30C3\u30AF\u30B5\u30E0\u304C\u4E00\u81F4\u3057\u307E\u305B\u3093" });
          let entries;
          try {
            entries = JSON.parse(raw.toString("utf8"));
          } catch {
            return json(400, { error: "\u5FA9\u5143\u30D5\u30E9\u30B0\u30E1\u30F3\u30C8\u306EJSON\u304C\u4E0D\u6B63\u3067\u3059" });
          }
          if (!Array.isArray(entries)) return json(400, { error: "\u5FA9\u5143\u30D5\u30E9\u30B0\u30E1\u30F3\u30C8\u306Eentries\u304C\u914D\u5217\u3067\u306F\u3042\u308A\u307E\u305B\u3093" });
          await setJSON(BACKUP_INDEX_STORE, importPageKey(importId, name, page), entries);
          await setJSON(BACKUP_INDEX_STORE, importReceiptKey(importId, name, page), true);
          meta.receivedPages = Number(meta.receivedPages || 0) + 1;
          await setJSON(BACKUP_INDEX_STORE, importKey(importId, "meta"), meta);
          return json(200, { ok: true, importId, store: name, page, fragmentIndex, received: true });
        }
        if (payload.action === "importChunk") {
          const importId = String(payload.importId || "");
          const meta = await getJSON(BACKUP_INDEX_STORE, importKey(importId, "meta"));
          if (!meta) return json(404, { error: "\u5FA9\u5143\u30BB\u30C3\u30B7\u30E7\u30F3\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
          const name = String(payload.store || "");
          const page = Number(payload.page);
          if (!BACKUP_STORES.includes(name) || !Array.isArray(payload.entries)) return json(400, { error: "\u5FA9\u5143\u30C1\u30E3\u30F3\u30AF\u306E\u5F62\u5F0F\u304C\u4E0D\u6B63\u3067\u3059" });
          if (!Number.isSafeInteger(page) || page < 0 || page >= Number(meta.stores?.[name]?.pages || 0)) return json(400, { error: "\u5FA9\u5143\u30C1\u30E3\u30F3\u30AF\u306E\u30DA\u30FC\u30B8\u756A\u53F7\u304C\u4E0D\u6B63\u3067\u3059" });
          if (payload.entries.length > 100 || Buffer.byteLength(JSON.stringify(payload.entries), "utf8") > 4 * 1024 * 1024) return json(413, { error: "1\u56DE\u306E\u5FA9\u5143\u30C1\u30E3\u30F3\u30AF\u304C\u5927\u304D\u3059\u304E\u307E\u3059" });
          const pageKey = importPageKey(importId, name, page);
          await setJSON(BACKUP_INDEX_STORE, pageKey, payload.entries);
          const savedPage = await getJSONWithRetry(BACKUP_INDEX_STORE, pageKey);
          if (!Array.isArray(savedPage)) return json(503, { error: "\u5FA9\u5143\u30DA\u30FC\u30B8\u306E\u4E00\u6642\u4FDD\u5B58\u3092\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u5C11\u3057\u5F85\u3063\u3066\u304B\u3089\u540C\u3058\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u3092\u518D\u5B9F\u884C\u3057\u3066\u304F\u3060\u3055\u3044" });
          const receiptKey = importReceiptKey(importId, name, page);
          const hadReceipt = await getJSON(BACKUP_INDEX_STORE, receiptKey) === true;
          await setJSON(BACKUP_INDEX_STORE, receiptKey, true);
          if (!hadReceipt) {
            meta.receivedPages = Number(meta.receivedPages || 0) + 1;
            await setJSON(BACKUP_INDEX_STORE, importKey(importId, "meta"), meta);
          }
          return json(200, { ok: true, importId, store: name, page });
        }
        if (payload.action === "importCommit") {
          return json(409, { error: "\u540C\u671F\u5FA9\u5143\u306F\u7121\u52B9\u3067\u3059\u3002startImportCommit\u3067Background\u5FA9\u5143\u3092\u958B\u59CB\u3057\u3066\u304F\u3060\u3055\u3044\u3002" });
        }
        if (payload.action === "import") return json(409, { error: "\u540C\u671F\u5FA9\u5143\u306F\u7121\u52B9\u3067\u3059\u3002\u904B\u55B6\u753B\u9762\u304B\u3089Background\u5FA9\u5143\u3092\u958B\u59CB\u3057\u3066\u304F\u3060\u3055\u3044\u3002" });
        if (payload.action === "lock") {
          const now = (/* @__PURE__ */ new Date()).toISOString();
          await setJSON(STORE_NAMES.SITE_STATE, "global", { locked: true, lockedAt: now, lockedBy: admin.email, message: "\u30C7\u30FC\u30BF\u4FDD\u8B77\u306E\u305F\u3081\u3001\u3053\u306E\u30B5\u30A4\u30C8\u306F\u30ED\u30C3\u30AF\u3055\u308C\u3066\u3044\u307E\u3059\u3002" });
          await setJSON(STORE_NAMES.ADMIN_AUDIT, `audit:${id()}`, { kind: "audit", id: id(), actorEmail: admin.email, action: "exportBackupAndLock", targetType: "backup", targetId: String(payload.createdAt || now), detail: "\u5206\u5272\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u51FA\u529B\u5F8C\u306B\u30B5\u30A4\u30C8\u3092\u4FDD\u8B77\u30ED\u30C3\u30AF", createdAt: now });
          if (payload.exportId) {
            try {
              const exportId = String(payload.exportId);
              const job = await getExportJob(exportId);
              if (job && String(job.actorEmail || "").toLowerCase() === String(admin.email || "").toLowerCase()) {
                await scheduleBackupCleanup(event, exportId);
                await removeUserJob(admin.email, "export", exportId);
              }
            } catch (error) {
              console.warn("failed to clean backup export index:", error);
            }
          }
          return json(200, { ok: true, locked: true });
        }
        if (payload.action === "unlock") {
          await setJSON(STORE_NAMES.SITE_STATE, "global", { locked: false, unlockedAt: (/* @__PURE__ */ new Date()).toISOString(), unlockedBy: admin.email });
          await setJSON(STORE_NAMES.ADMIN_AUDIT, `audit:${id()}`, { kind: "audit", id: id(), actorEmail: admin.email, action: "unlockSite", targetType: "site", targetId: "global", detail: "\u904B\u55B6\u306B\u3088\u308B\u30B5\u30A4\u30C8\u4FDD\u8B77\u30ED\u30C3\u30AF\u89E3\u9664", createdAt: (/* @__PURE__ */ new Date()).toISOString() });
          return json(200, { ok: true, locked: false });
        }
        if (payload.action === "import") {
          const restored = await restoreBackup(payload.backup, admin.email);
          return json(200, { ok: true, restored });
        }
        return json(400, { error: "action\u306Fmanifest\u3001chunk\u3001export\u3001unlock\u3001import\u306E\u3044\u305A\u308C\u304B\u3067\u3059" });
      } catch (error) {
        console.error("backup function error:", error);
        return json(400, { error: error.message || "\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u51E6\u7406\u306B\u5931\u6557\u3057\u307E\u3057\u305F" });
      }
    };
  }
});

// entries/backup-cfxja.mjs
var import_backup = __toESM(require_backup(), 1);

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

// entries/backup-cfxja.mjs
var handler = import_backup.default.handler || import_backup.default.default && import_backup.default.default.handler;
var __onRequest = wrap(handler, {});

export async function onRequest(context) {
  return __onRequest(context);
}
