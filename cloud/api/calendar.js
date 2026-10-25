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

// src/functions/calendar.js
var require_calendar = __commonJS({
  "src/functions/calendar.js"(exports) {
    var crypto = __require("crypto");
    var { connectLambda: connectLambda2 } = (init_blobs(), __toCommonJS(blobs_exports));
    var { STORE_NAMES, getJSON, setJSON, deleteKey, listKeys } = require_store();
    var { requireSession } = require_session();
    function json(status, body) {
      return { statusCode: status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, body: JSON.stringify(body) };
    }
    function id() {
      return crypto.randomBytes(10).toString("hex");
    }
    async function allCalendars() {
      const rows = [];
      for (const key of await listKeys(STORE_NAMES.CALENDARS, "calendar:")) {
        const item = await getJSON(STORE_NAMES.CALENDARS, key);
        if (item) rows.push(item);
      }
      return rows;
    }
    exports.handler = async (event) => {
      connectLambda2(event);
      if (event.httpMethod !== "POST" && event.httpMethod !== "GET") return json(405, { error: "GET/POST\u306E\u307F\u5BFE\u5FDC\u3057\u3066\u3044\u307E\u3059" });
      let p = {};
      try {
        p = event.httpMethod === "GET" ? event.queryStringParameters || {} : JSON.parse(event.body || "{}");
      } catch {
        return json(400, { error: "\u4E0D\u6B63\u306AJSON\u3067\u3059" });
      }
      const email = await requireSession(p.token);
      if (!email) return json(401, { error: "\u30ED\u30B0\u30A4\u30F3\u304C\u5FC5\u8981\u3067\u3059" });
      const action = p.action || "list";
      try {
        if (action === "list") {
          const calendars = (await allCalendars()).filter((c) => c.ownerEmail === email || (c.sharedWith || []).includes(email) || c.public === true);
          return json(200, { calendars: calendars.sort((a, b) => String(a.title).localeCompare(String(b.title))) });
        }
        if (action === "create") {
          const title = String(p.title || "\u65B0\u3057\u3044\u4E88\u5B9A\u8868").trim().slice(0, 100);
          if (!title) return json(400, { error: "\u4E88\u5B9A\u8868\u540D\u304C\u5FC5\u8981\u3067\u3059" });
          const calendar2 = { id: id(), title, description: String(p.description || "").slice(0, 500), ownerEmail: email, sharedWith: [], public: p.public !== false, events: [], createdAt: (/* @__PURE__ */ new Date()).toISOString(), updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
          await setJSON(STORE_NAMES.CALENDARS, `calendar:${calendar2.id}`, calendar2);
          return json(201, { calendar: calendar2 });
        }
        const calendar = await getJSON(STORE_NAMES.CALENDARS, `calendar:${p.calendarId}`);
        if (!calendar) return json(404, { error: "\u4E88\u5B9A\u8868\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        const canEdit = calendar.ownerEmail === email || (calendar.sharedWith || []).includes(email);
        if (action === "get") {
          if (!canEdit && !calendar.public) return json(403, { error: "\u3053\u306E\u4E88\u5B9A\u8868\u306F\u975E\u516C\u958B\u3067\u3059" });
          return json(200, { calendar });
        }
        if (action === "share") {
          if (calendar.ownerEmail !== email) return json(403, { error: "\u4F5C\u6210\u8005\u306E\u307F\u5171\u6709\u8A2D\u5B9A\u3092\u5909\u66F4\u3067\u304D\u307E\u3059" });
          const target = String(p.email || "").trim().toLowerCase();
          if (target && !calendar.sharedWith.includes(target)) calendar.sharedWith.push(target);
          await setJSON(STORE_NAMES.CALENDARS, `calendar:${calendar.id}`, calendar);
          return json(200, { calendar });
        }
        if (action === "event") {
          if (!canEdit) return json(403, { error: "\u4E88\u5B9A\u3092\u5909\u66F4\u3059\u308B\u6A29\u9650\u304C\u3042\u308A\u307E\u305B\u3093" });
          const event2 = { id: p.eventId || id(), title: String(p.title || "\u4E88\u5B9A").slice(0, 160), description: String(p.description || "").slice(0, 1e3), start: String(p.start || ""), end: String(p.end || ""), allDay: Boolean(p.allDay), updatedBy: email, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
          if (!event2.start) return json(400, { error: "\u958B\u59CB\u65E5\u6642\u304C\u5FC5\u8981\u3067\u3059" });
          calendar.events = Array.isArray(calendar.events) ? calendar.events : [];
          const index = calendar.events.findIndex((x) => x.id === event2.id);
          if (index >= 0) calendar.events[index] = event2;
          else calendar.events.push(event2);
          calendar.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
          await setJSON(STORE_NAMES.CALENDARS, `calendar:${calendar.id}`, calendar);
          return json(200, { calendar, event: event2 });
        }
        if (action === "deleteEvent") {
          if (!canEdit) return json(403, { error: "\u4E88\u5B9A\u3092\u524A\u9664\u3059\u308B\u6A29\u9650\u304C\u3042\u308A\u307E\u305B\u3093" });
          calendar.events = (calendar.events || []).filter((x) => x.id !== p.eventId);
          await setJSON(STORE_NAMES.CALENDARS, `calendar:${calendar.id}`, calendar);
          return json(200, { calendar });
        }
        if (action === "delete") {
          if (calendar.ownerEmail !== email) return json(403, { error: "\u4F5C\u6210\u8005\u306E\u307F\u524A\u9664\u3067\u304D\u307E\u3059" });
          await deleteKey(STORE_NAMES.CALENDARS, `calendar:${calendar.id}`);
          return json(200, { ok: true });
        }
        return json(400, { error: "\u4E0D\u660E\u306Aaction\u3067\u3059" });
      } catch (e) {
        console.error("calendar error", e);
        return json(500, { error: `\u5185\u90E8\u30A8\u30E9\u30FC: ${e.message}` });
      }
    };
  }
});

// entries/calendar-rzdxv.mjs
var import_calendar = __toESM(require_calendar(), 1);

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

// entries/calendar-rzdxv.mjs
var handler = import_calendar.default.handler || import_calendar.default.default && import_calendar.default.default.handler;
var __onRequest = wrap(handler, {});

export async function onRequest(context) {
  return __onRequest(context);
}
