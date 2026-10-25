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

// src/lib/reports.js
var require_reports = __commonJS({
  "src/lib/reports.js"(exports, module) {
    var crypto = __require("crypto");
    var { STORE_NAMES, getJSON, setJSON, listKeys } = require_store();
    function newId() {
      return crypto.randomBytes(10).toString("hex");
    }
    async function createReport({ reporterEmail, targetType, targetId, reason, detail, snapshot }) {
      const keys = await listKeys(STORE_NAMES.ADMIN_AUDIT, "report:");
      for (const key of keys) {
        const previous = await getJSON(STORE_NAMES.ADMIN_AUDIT, key);
        if (previous && previous.kind === "report" && previous.reporterEmail === reporterEmail && previous.targetType === targetType && previous.targetId === targetId && previous.status !== "dismissed") {
          return { duplicate: true, report: previous };
        }
      }
      const report = {
        kind: "report",
        id: newId(),
        reporterEmail,
        targetType,
        targetId: String(targetId || "").slice(0, 180),
        reason: String(reason || "\u305D\u306E\u4ED6").slice(0, 80),
        detail: String(detail || "").trim().slice(0, 1e3),
        snapshot: snapshot || null,
        status: "open",
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      await setJSON(STORE_NAMES.ADMIN_AUDIT, `report:${report.id}`, report);
      return { duplicate: false, report };
    }
    module.exports = { createReport };
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

// src/functions/mail.js
var require_mail = __commonJS({
  "src/functions/mail.js"(exports) {
    var crypto = __require("crypto");
    var { connectLambda: connectLambda2 } = (init_blobs(), __toCommonJS(blobs_exports));
    var { STORE_NAMES, getJSON, setJSON, listKeys } = require_store();
    var { requireSession, getAccountProfile } = require_session();
    var { createReport } = require_reports();
    var { sendEmailTemplate, emailConfigurationMissing, buildSiteUrl } = require_email_integration();
    function json(status, body) {
      return {
        statusCode: status,
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(body)
      };
    }
    function newId() {
      return crypto.randomBytes(8).toString("hex");
    }
    function normalizeEmail(input) {
      let v = String(input || "").trim().toLowerCase().replace(/@bix\.server$/i, "@bix.3erver");
      if (v && !v.includes("@") && /^[a-z0-9._+-]+$/.test(v)) v += "@bix.3erver";
      return v;
    }
    function isValidExternalEmail(email) {
      if (email.length > 254 || /[\s<>]/.test(email)) return false;
      return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(email);
    }
    function normalizeSubject(input) {
      return String(input || "").replace(/[\r\n\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 150) || "(\u4EF6\u540D\u306A\u3057)";
    }
    var MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
    var MAX_EXTERNAL_ATTACHMENT_BYTES = 4 * 1024 * 1024;
    function normalizeAttachment(input) {
      if (!input || !input.dataUrl) return null;
      const dataUrl = String(input.dataUrl);
      if (dataUrl.length > MAX_ATTACHMENT_BYTES * 1.4) throw new Error("\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB\u306F10MB\u7A0B\u5EA6\u307E\u3067\u3067\u3059");
      const name = String(input.name || "file").replace(/[\\/\u0000-\u001f\u007f]/g, "_").slice(0, 160);
      const rawType = String(input.type || "application/octet-stream").slice(0, 120);
      const type = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(rawType) ? rawType : "application/octet-stream";
      return { name, type, dataUrl };
    }
    function emailAttachment(attachment) {
      if (!attachment) return [];
      const match = /^data:([^,]*);base64,([a-z0-9+/]+={0,2})$/i.exec(String(attachment.dataUrl || ""));
      if (!match) throw new Error("\u5916\u90E8\u30E1\u30FC\u30EB\u6DFB\u4ED8\u306E\u5F62\u5F0F\u304C\u4E0D\u6B63\u3067\u3059");
      const content = match[2];
      const bytes = Buffer.from(content, "base64");
      if (bytes.length > MAX_EXTERNAL_ATTACHMENT_BYTES) throw new Error("Gmail\u306A\u3069\u5916\u90E8\u5B9B\u3066\u306E\u6DFB\u4ED8\u306F1\u30D5\u30A1\u30A4\u30EB4MiB\u307E\u3067\u3067\u3059");
      if (bytes.toString("base64") !== content) throw new Error("\u5916\u90E8\u30E1\u30FC\u30EB\u6DFB\u4ED8\u306EBase64\u30C7\u30FC\u30BF\u304C\u4E0D\u6B63\u3067\u3059");
      const detectedType = match[1].split(";")[0] || "application/octet-stream";
      return [{ content, filename: attachment.name, type: /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(attachment.type) ? attachment.type : detectedType }];
    }
    async function reserveExternalSend(senderEmail, recipientEmail) {
      const key = `mail-outbound:${crypto.createHash("sha256").update(senderEmail).digest("hex").slice(0, 32)}`;
      const now = Date.now(), windowMs = 24 * 60 * 60 * 1e3;
      const record = await getJSON(STORE_NAMES.ACCOUNT_RECOVERY, key) || { events: [] };
      const events = (Array.isArray(record.events) ? record.events : []).filter((item) => Number(item?.at) > now - windowMs);
      if (events.length >= 20) return { allowed: false, retryAt: events[0].at + windowMs };
      const sameRecipient = events.filter((item) => item.to === recipientEmail);
      if (sameRecipient.length >= 5) return { allowed: false, retryAt: sameRecipient[0].at + windowMs };
      events.push({ to: recipientEmail, at: now });
      await setJSON(STORE_NAMES.ACCOUNT_RECOVERY, key, { events });
      return { allowed: true };
    }
    function amAddr(v) {
      const raw = String(v && v.email || v || "");
      const m = /<([^>]+)>/.exec(raw);
      return (m ? m[1] : raw).trim().toLowerCase();
    }
    function amList(v) {
      return (Array.isArray(v) ? v : v ? [v] : []).map(amAddr).filter(Boolean);
    }
    async function amFetch(path, init) {
      const { AGENTMAIL_BASE, AGENTMAIL_KEY, AGENTMAIL_BOX } = amConfig();
      return fetch(`${AGENTMAIL_BASE}/inboxes/${encodeURIComponent(AGENTMAIL_BOX)}${path}`, { ...init, headers: { Authorization: "Bearer " + AGENTMAIL_KEY, "Content-Type": "application/json" }, signal: AbortSignal.timeout(8e3) });
    }
    function amConfig() {
      return { AGENTMAIL_BASE: "https://api.agentmail.to/v0", AGENTMAIL_KEY: ((typeof process !== "undefined" && process.env && process.env.AGENTMAIL_API_KEY) || ""), AGENTMAIL_BOX: ((typeof process !== "undefined" && process.env && process.env.AGENTMAIL_INBOX) || "") };
    }
    async function rememberAgentMailThread(thread, result) {
      if (!result || !result.threadId) return;
      thread.agentmail = { threadId: result.threadId, lastMessageId: result.messageId || "" };
      const key = "agentmail:thread:" + result.threadId;
      const cur = await getJSON(STORE_NAMES.ADMIN_SECRETS, key) || { ids: [] };
      if (!cur.ids.includes(thread.id)) cur.ids.push(thread.id);
      await setJSON(STORE_NAMES.ADMIN_SECRETS, key, cur);
    }
    async function processAgentMailMessage(msg) {
      const box = amConfig().AGENTMAIL_BOX;
      const fromAddr = amAddr(msg.from);
      if (!fromAddr || fromAddr === box) return "skip:self-or-empty-from";
      const detail = await amFetch("/messages/" + encodeURIComponent(msg.message_id)).then((r) => r.ok ? r.json() : {}).catch(() => ({}));
      const text = String(detail.extracted_text || detail.text || msg.preview || "").trim().slice(0, 100 * 1024) || "(\u672C\u6587\u306A\u3057)";
      const name = String(msg.from || "").replace(/<[^>]*>/, "").replace(/["']/g, "").trim() || fromAddr;
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const mapKey = "agentmail:thread:" + msg.thread_id;
      const mapping = await getJSON(STORE_NAMES.ADMIN_SECRETS, mapKey);
      let delivered = 0;
      if (mapping && Array.isArray(mapping.ids)) {
        for (const tid of mapping.ids) {
          const thread = await getJSON(STORE_NAMES.MAIL_THREADS, tid);
          if (!thread || String(thread.externalRecipient || "").toLowerCase() !== fromAddr) continue;
          thread.messages.push({ id: newId(), authorEmail: fromAddr, authorName: name, text, attachment: void 0, createdAt: now, viaAgentMail: true });
          thread.agentmail = { threadId: msg.thread_id, lastMessageId: msg.message_id };
          await setJSON(STORE_NAMES.MAIL_THREADS, tid, thread);
          delivered++;
        }
        if (delivered) return "routed:existing-thread x" + delivered;
      }
      const targets = [...new Set(amList(msg.cc).concat(amList(msg.to)).map((a) => (a.includes("@") ? a : /^[a-z0-9._+-]+$/.test(a) ? a + "@bix.3erver" : a).replace(/@bix\.server$/i, "@bix.3erver")).filter((a) => a.endsWith("@bix.3erver")))];
      const ids = [];
      for (const target of targets) {
        const account = await getJSON(STORE_NAMES.ACCOUNTS, target);
        if (!account) continue;
        const id = newId();
        await setJSON(STORE_NAMES.MAIL_THREADS, id, {
          id,
          subject: normalizeSubject(msg.subject),
          memberEmails: [target, fromAddr],
          externalRecipient: fromAddr,
          externalDelivery: { status: "sent", provider: "agentmail", updatedAt: now },
          agentmail: { threadId: msg.thread_id, lastMessageId: msg.message_id },
          readBy: {},
          messages: [{ id: newId(), authorEmail: fromAddr, authorName: name, text, createdAt: now, viaAgentMail: true }],
          createdAt: now
        });
        ids.push(id);
      }
      if (ids.length) await setJSON(STORE_NAMES.ADMIN_SECRETS, mapKey, { ids: (mapping && mapping.ids || []).concat(ids) });
      if (ids.length) return "routed:new-thread x" + ids.length;
      return targets.length ? "no-account:" + targets.join(",") : "no-bix-address-in-to/cc";
    }
    async function pollAgentMail() {
      const stateKey = "agentmail:state2";
      const state = await getJSON(STORE_NAMES.ADMIN_SECRETS, stateKey) || { done: [], at: 0 };
      if (Date.now() - Number(state.at || 0) < 15e3) return state.diag || [];
      state.at = Date.now();
      await setJSON(STORE_NAMES.ADMIN_SECRETS, stateKey, state);
      const diag = [];
      const res = await amFetch("/messages?limit=30&include_spam=true");
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        console.error("AgentMail list failed:", res.status, t.slice(0, 200));
        state.diag = ["\u53D7\u4FE1\u4E00\u89A7\u306E\u53D6\u5F97\u306B\u5931\u6557: HTTP " + res.status + " " + t.slice(0, 160)];
        await setJSON(STORE_NAMES.ADMIN_SECRETS, stateKey, state);
        return state.diag;
      }
      const data = await res.json().catch(() => ({}));
      const all = data.messages || [];
      diag.push("AgentMail\u53D7\u4FE1\u4E00\u89A7: " + all.length + "\u4EF6\u53D6\u5F97");
      const fresh = all.filter((m) => m && m.message_id && !state.done.includes(m.message_id)).reverse();
      for (const msg of fresh) {
        const info = "from=" + amAddr(msg.from) + " to=" + amList(msg.to).join(",") + " cc=" + amList(msg.cc).join(",") + " labels=" + (msg.labels || []).join("/");
        try {
          const outcome = await processAgentMailMessage(msg);
          diag.push(outcome + " | " + info);
          state.done.push(msg.message_id);
        } catch (err) {
          console.error("AgentMail inbound error:", err);
          diag.push("error:" + String(err && err.message || err).slice(0, 120) + " | " + info);
        }
      }
      if (fresh.length) state.diagAt = Date.now();
      state.diag = diag.concat((state.diag || []).filter((l) => !/^AgentMail\u53D7\u4FE1\u4E00\u89A7/.test(l) && !/^\u53D7\u4FE1\u4E00\u89A7/.test(l)).slice(0, 8)).slice(0, 10);
      state.done = state.done.slice(-300);
      await setJSON(STORE_NAMES.ADMIN_SECRETS, stateKey, state);
      return state.diag;
    }
    var AGENTMAIL_DEBUG = true;
    exports.handler = async (event) => {
      connectLambda2(event);
      try {
        return await handle(event);
      } catch (err) {
        console.error("mail function error:", err);
        return json(500, { error: `\u5185\u90E8\u30A8\u30E9\u30FC: ${err.message}` });
      }
    };
    async function handle(event) {
      const method = event.httpMethod;
      const qs = event.queryStringParameters || {};
      if (method !== "GET" && method !== "POST") return json(405, { error: "\u672A\u5BFE\u5FDC\u306E\u30E1\u30BD\u30C3\u30C9\u3067\u3059" });
      let payload = {};
      if (method === "POST") {
        try {
          payload = JSON.parse(event.body || "{}");
        } catch {
          return json(400, { error: "\u4E0D\u6B63\u306A\u30EA\u30AF\u30A8\u30B9\u30C8\u3067\u3059" });
        }
      } else {
        payload = qs;
      }
      const token = method === "GET" ? qs.token : payload.token;
      const email = await requireSession(token);
      if (!email) return json(401, { error: "\u30ED\u30B0\u30A4\u30F3\u304C\u5FC5\u8981\u3067\u3059" });
      if (method === "GET") {
        const __amDiag = await pollAgentMail().catch((err) => { console.error("AgentMail poll error:", err); return ["poll error: " + String(err && err.message || err).slice(0, 200)]; });
        if (qs.threadId) {
          const thread = await getJSON(STORE_NAMES.MAIL_THREADS, qs.threadId);
          if (!thread || !thread.memberEmails.includes(email)) return json(404, { error: "\u30B9\u30EC\u30C3\u30C9\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
          const profiles = {};
          for (const memberEmail of thread.memberEmails) profiles[memberEmail] = await getAccountProfile(memberEmail);
          return json(200, { thread: { ...thread, profiles, messages: thread.messages.map((message) => ({ ...message, authorProfile: profiles[message.authorEmail] || null })) } });
        }
        const keys = await listKeys(STORE_NAMES.MAIL_THREADS);
        const threads = [];
        const query = String(qs.q || "").trim().toLowerCase();
        const view = ["inbox", "sent", "all"].includes(qs.view) ? qs.view : "inbox";
        for (const key of keys) {
          const t = await getJSON(STORE_NAMES.MAIL_THREADS, key);
          if (t && t.memberEmails.includes(email) && !(t.broadcastFrom === email && t.messages.every((m) => m.authorEmail === email))) {
            const last = t.messages[t.messages.length - 1];
            const otherEmail = t.memberEmails.find((m) => m !== email) || email;
            const profile = await getAccountProfile(otherEmail);
            const hasIncoming = (t.messages || []).some((message) => message.authorEmail !== email);
            const hasOutgoing = (t.messages || []).some((message) => message.authorEmail === email);
            const sentByMe = hasOutgoing;
            const searchable = [t.subject, otherEmail, profile.displayName, ...(t.messages || []).map((m) => m.text)].join(" ").toLowerCase();
            if (query && !searchable.includes(query)) continue;
            if (view === "sent" && !hasOutgoing) continue;
            if (view === "inbox" && !hasIncoming) continue;
            const lastReadAt = t.readBy && t.readBy[email] ? new Date(t.readBy[email]) : null;
            const unread = !!last && (!lastReadAt || lastReadAt < new Date(last.createdAt));
            threads.push({
              id: t.id,
              subject: t.subject,
              otherEmail,
              otherProfile: profile,
              lastMessage: last ? { text: last.text, authorEmail: last.authorEmail, createdAt: last.createdAt } : null,
              unread,
              sentByMe,
              externalDelivery: t.externalDelivery || null,
              createdAt: t.createdAt
            });
          }
        }
        threads.sort((a, b) => {
          const at = a.lastMessage ? a.lastMessage.createdAt : a.createdAt;
          const bt = b.lastMessage ? b.lastMessage.createdAt : b.createdAt;
          return new Date(bt) - new Date(at);
        });
        if (AGENTMAIL_DEBUG && !qs.q && Array.isArray(__amDiag) && __amDiag.length) {
          threads.unshift({ id: "agentmail-diag", subject: "[\u8A3A\u65AD] AgentMail\u53D7\u4FE1\u30C1\u30A7\u30C3\u30AF\u7D50\u679C", otherEmail: "mixall@agentmail.to", otherProfile: { displayName: "AgentMail\u8A3A\u65AD" }, lastMessage: { text: __amDiag.join(" // "), authorEmail: "mixall@agentmail.to", createdAt: (/* @__PURE__ */ new Date()).toISOString() }, unread: false, sentByMe: true, externalDelivery: null, createdAt: (/* @__PURE__ */ new Date()).toISOString() });
        }
        return json(200, { threads });
      }
      const { action } = payload;
      if (action === "report") {
        const thread = await getJSON(STORE_NAMES.MAIL_THREADS, payload.threadId);
        if (!thread || !thread.memberEmails.includes(email)) return json(404, { error: "\u901A\u5831\u5BFE\u8C61\u306E\u30B9\u30EC\u30C3\u30C9\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        const message = (thread.messages || []).find((item) => item.id === payload.messageId);
        if (!message) return json(404, { error: "\u901A\u5831\u5BFE\u8C61\u306E\u30E1\u30FC\u30EB\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        const result = await createReport({ reporterEmail: email, targetType: "mailMessage", targetId: `${thread.id}:${message.id}`, reason: payload.reason, detail: payload.detail, snapshot: { threadId: thread.id, messageId: message.id, authorEmail: message.authorEmail, text: message.text, subject: thread.subject } });
        return json(201, { ok: true, duplicate: result.duplicate, reportId: result.report.id });
      }
      if (action === "send" && !payload.__multi) {
        const rawTo = String(payload.to || "").trim();
        const list = (v) => (Array.isArray(v) ? v : String(v || "").split(/[,;\s\u3001]+/)).map((x) => String(x).trim()).filter(Boolean);
        const ccList = list(payload.cc), bccList = list(payload.bcc);
        if (/^[^@\s]*@all\.bix\.mail$/i.test(rawTo)) {
          const op = await requireAdmin(token);
          if (!op) return json(403, { error: "@All.bix.mail \u3078\u306E\u4E00\u6589\u9001\u4FE1\u306F\u904B\u55B6\u30FB\u526F\u904B\u55B6\u306E\u307F\u4F7F\u3048\u307E\u3059" });
          const subject0 = normalizeSubject(payload.subject);
          const body0 = (payload.body || "").trim();
          let attachment0;
          try { attachment0 = normalizeAttachment(payload.attachment); } catch (error) { return json(400, { error: error.message }); }
          if (!body0 && !attachment0) return json(400, { error: "\u672C\u6587\u304B\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB\u306E\u3069\u3061\u3089\u304B\u3092\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044" });
          if (Buffer.byteLength(body0, "utf8") > 100 * 1024) return json(413, { error: "\u672C\u6587\u306F100KiB\u307E\u3067\u3067\u3059" });
          const senderName = (await getAccountProfile(email)).displayName || email;
          const nowIso = (/* @__PURE__ */ new Date()).toISOString();
          let count = 0;
          for (const key of await listKeys(STORE_NAMES.ACCOUNTS)) {
            const target = String(key).toLowerCase();
            if (!target.includes("@") || target === email) continue;
            const tid = newId();
            await setJSON(STORE_NAMES.MAIL_THREADS, tid, { id: tid, subject: subject0, memberEmails: [email, target], broadcastFrom: email, readBy: { [email]: nowIso }, messages: [{ id: newId(), authorEmail: email, authorName: senderName, text: body0, attachment: attachment0, createdAt: nowIso, mailHeaders: { to: ["@All.bix.mail"], cc: [] } }], createdAt: nowIso });
            count += 1;
          }
          const sid = newId();
          const sent = { id: sid, subject: "[\u4E00\u6589\u9001\u4FE1] " + subject0, memberEmails: [email], readBy: { [email]: nowIso }, broadcastSent: { count }, messages: [{ id: newId(), authorEmail: email, authorName: senderName, text: body0 + "\n\n\uFF08@All.bix.mail \u3067" + count + "\u4EBA\u306B\u9001\u4FE1\u3057\u307E\u3057\u305F\uFF09", attachment: attachment0, createdAt: nowIso, mailHeaders: { to: ["@All.bix.mail"], cc: [] } }], createdAt: nowIso };
          await setJSON(STORE_NAMES.MAIL_THREADS, sid, sent);
          return json(201, { thread: sent, count });
        }
        if (ccList.length || bccList.length) {
          const seenTo = new Set(); const toList = [rawTo, ...ccList, ...bccList].filter((v) => { const k = String(v).toLowerCase(); if (!v || seenTo.has(k)) return false; seenTo.add(k); return true; });
          if (toList.length > 20) return json(400, { error: "\u5B9B\u5148\u306F\u5408\u8A0820\u4EF6\u307E\u3067\u3067\u3059" });
          if (!rawTo) return json(400, { error: "\u5B9B\u5148\uFF08To\uFF09\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044" });
          const results = []; let first = null;
          for (const r of toList) {
            const res = await handle({ ...event, httpMethod: "POST", body: JSON.stringify({ ...payload, to: r, cc: void 0, bcc: void 0, __multi: true, meta: { to: [rawTo], cc: ccList } }) });
            let data = {}; try { data = JSON.parse(res.body || "{}"); } catch (_) {}
            const ok = res.statusCode >= 200 && res.statusCode < 300;
            if (ok && !first) first = data.thread;
            results.push({ to: r, ok, error: ok ? void 0 : data.error });
          }
          if (!first) return json(502, { error: results.map((x) => x.to + ": " + (x.error || "\u5931\u6557")).join(" / "), results });
          return json(201, { thread: first, results });
        }
      }
      if (action === "send") {
        const to = normalizeEmail(payload.to);
        if (!to) return json(400, { error: "\u5B9B\u5148\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044" });
        const toAccount = await getJSON(STORE_NAMES.ACCOUNTS, to);
        const external = !toAccount;
        if (external && to.endsWith("@bix.3erver")) return json(404, { error: `${to} \u306F\u5B58\u5728\u3057\u306A\u3044MixAll\u30A2\u30AB\u30A6\u30F3\u30C8\u3067\u3059` });
        if (external && !isValidExternalEmail(to)) return json(400, { error: "\u5B9B\u5148\u30A2\u30C9\u30EC\u30B9\u306E\u5F62\u5F0F\u304C\u6B63\u3057\u304F\u3042\u308A\u307E\u305B\u3093" });
        const subject = normalizeSubject(payload.subject);
        const body = (payload.body || "").trim();
        let attachment;
        try {
          attachment = normalizeAttachment(payload.attachment);
        } catch (error) {
          return json(400, { error: error.message });
        }
        if (!body && !attachment) return json(400, { error: "\u672C\u6587\u304B\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB\u306E\u3069\u3061\u3089\u304B\u3092\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044" });
        if (Buffer.byteLength(body, "utf8") > 100 * 1024) return json(413, { error: "\u672C\u6587\u306F100KiB\u307E\u3067\u3067\u3059" });
        if (external && await emailConfigurationMissing()) return json(503, { error: "Gmail\u306A\u3069\u5916\u90E8\u5B9B\u3066\u306E\u9001\u4FE1\u8A2D\u5B9A\u304C\u672A\u5B8C\u4E86\u3067\u3059\u3002\u904B\u55B6\u5074\u3067\u30E1\u30FC\u30EB\u30D7\u30ED\u30D0\u30A4\u30C0\u30FC\u3068\u8A8D\u8A3C\u6E08\u307F\u5DEE\u51FA\u4EBA\u3092\u8A2D\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002" + (globalThis.__brevoDiag ? "\uFF08\u539F\u56E0: " + globalThis.__brevoDiag + "\uFF09" : "") });
        let attachments = [];
        if (external) {
          try {
            attachments = emailAttachment(attachment);
          } catch (error) {
            return json(400, { error: error.message });
          }
          const quota = await reserveExternalSend(email, to);
          if (!quota.allowed) {
            const waitHours = Math.max(1, Math.ceil((quota.retryAt - Date.now()) / 36e5));
            return json(429, { error: `\u5916\u90E8\u5B9B\u3066\u30E1\u30FC\u30EB\u306F1\u65E520\u901A\u3001\u540C\u3058\u5B9B\u5148\u30785\u901A\u307E\u3067\u3067\u3059\u3002\u7D04${waitHours}\u6642\u9593\u5F8C\u306B\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002` });
          }
        }
        const id = newId();
        const createdAt = (/* @__PURE__ */ new Date()).toISOString();
        const thread = {
          id,
          subject,
          memberEmails: [email, to],
          ...external ? { externalRecipient: to, externalDelivery: { status: "sending", updatedAt: createdAt } } : {},
          readBy: { [email]: (/* @__PURE__ */ new Date()).toISOString() },
          messages: [
            {
              id: newId(),
              authorEmail: email,
              authorName: (await getAccountProfile(email)).displayName || email,
              text: body,
              attachment,
              createdAt,
              ...payload.meta && Array.isArray(payload.meta.to) ? { mailHeaders: { to: payload.meta.to.slice(0, 30).map((v) => String(v).slice(0, 200)), cc: (Array.isArray(payload.meta.cc) ? payload.meta.cc : []).slice(0, 30).map((v) => String(v).slice(0, 200)) } } : {}
            }
          ],
          createdAt
        };
        await setJSON(STORE_NAMES.MAIL_THREADS, id, thread);
        if (external) {
          const sender = await getAccountProfile(email);
          try {
            const __amRes = await sendEmailTemplate(event, { template: "mail-message", to, subject, parameters: { subject, senderName: String(sender.displayName || email).slice(0, 80), senderAccount: email, body: body || "\uFF08\u672C\u6587\u306F\u3042\u308A\u307E\u305B\u3093\u3002\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB\u3092\u3054\u78BA\u8A8D\u304F\u3060\u3055\u3044\u3002\uFF09", mailUrl: buildSiteUrl(event, "/Mail/Inbox/") }, attachments });
            thread.externalDelivery = { status: "sent", provider: "agentmail", updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
            await rememberAgentMailThread(thread, __amRes);
            thread.messages[0].externalDeliveryStatus = "sent";
            await setJSON(STORE_NAMES.MAIL_THREADS, id, thread);
          } catch (error) {
            thread.externalDelivery = { status: "failed", updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
            thread.messages[0].externalDeliveryStatus = "failed";
            await setJSON(STORE_NAMES.MAIL_THREADS, id, thread);
            if (error.code === "EMAIL_NOT_CONFIGURED") return json(503, { error: "\u30E1\u30FC\u30EB\u9001\u4FE1\u8A2D\u5B9A\u304C\u672A\u5B8C\u4E86\u3067\u3059\u3002\u30D7\u30ED\u30D0\u30A4\u30C0\u30FCAPI\u30AD\u30FC\u3068\u8A8D\u8A3C\u6E08\u307F\u5DEE\u51FA\u4EBA\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u9001\u4FE1\u5185\u5BB9\u306F\u9001\u4FE1\u6E08\u307F\u30D5\u30A9\u30EB\u30C0\u30FC\u306B\u672A\u9001\u4FE1\u3068\u3057\u3066\u4FDD\u5B58\u3057\u307E\u3057\u305F\u3002" });
            return json(502, { error: "[" + String(error && error.message || "").slice(0,300) + "] Gmail\u306A\u3069\u5916\u90E8\u5B9B\u3066\u306E\u9001\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002\u9001\u4FE1\u5143\u30C9\u30E1\u30A4\u30F3\u8A8D\u8A3C\u3068\u30D7\u30ED\u30D0\u30A4\u30C0\u30FC\u8A2D\u5B9A\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u9001\u4FE1\u5185\u5BB9\u306F\u9001\u4FE1\u6E08\u307F\u30D5\u30A9\u30EB\u30C0\u30FC\u306B\u672A\u9001\u4FE1\u3068\u3057\u3066\u4FDD\u5B58\u3057\u307E\u3057\u305F\u3002" });
          }
        }
        return json(201, { thread });
      }
      if (action === "reply") {
        const thread = await getJSON(STORE_NAMES.MAIL_THREADS, payload.threadId);
        if (!thread || !thread.memberEmails.includes(email)) return json(404, { error: "\u30B9\u30EC\u30C3\u30C9\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        const body = (payload.body || "").trim();
        let attachment;
        try {
          attachment = normalizeAttachment(payload.attachment);
        } catch (error) {
          return json(400, { error: error.message });
        }
        if (!body && !attachment) return json(400, { error: "\u672C\u6587\u304B\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB\u306E\u3069\u3061\u3089\u304B\u3092\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044" });
        if (Buffer.byteLength(body, "utf8") > 100 * 1024) return json(413, { error: "\u672C\u6587\u306F100KiB\u307E\u3067\u3067\u3059" });
        let externalAttachments = [];
        if (thread.externalRecipient && thread.externalRecipient !== email) {
          if (await emailConfigurationMissing()) return json(503, { error: "\u30E1\u30FC\u30EB\u9001\u4FE1\u8A2D\u5B9A\u304C\u672A\u5B8C\u4E86\u3067\u3059\u3002\u30D7\u30ED\u30D0\u30A4\u30C0\u30FCAPI\u30AD\u30FC\u3068\u8A8D\u8A3C\u6E08\u307F\u5DEE\u51FA\u4EBA\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002" + (globalThis.__brevoDiag ? "\uFF08\u539F\u56E0: " + globalThis.__brevoDiag + "\uFF09" : "") });
          try {
            externalAttachments = emailAttachment(attachment);
          } catch (error) {
            return json(400, { error: error.message });
          }
          const quota = await reserveExternalSend(email, thread.externalRecipient);
          if (!quota.allowed) {
            const waitHours = Math.max(1, Math.ceil((quota.retryAt - Date.now()) / 36e5));
            return json(429, { error: `\u5916\u90E8\u5B9B\u3066\u30E1\u30FC\u30EB\u306F1\u65E520\u901A\u3001\u540C\u3058\u5B9B\u5148\u30785\u901A\u307E\u3067\u3067\u3059\u3002\u7D04${waitHours}\u6642\u9593\u5F8C\u306B\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002` });
          }
        }
        const message = {
          id: newId(),
          authorEmail: email,
          authorName: (await getAccountProfile(email)).displayName || email,
          text: body,
          attachment,
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        const externalReply = Boolean(thread.externalRecipient && thread.externalRecipient !== email);
        if (externalReply) {
          message.externalDeliveryStatus = "sending";
          thread.externalDelivery = { status: "sending", updatedAt: message.createdAt };
        }
        thread.messages.push(message);
        thread.readBy = thread.readBy || {};
        thread.readBy[email] = (/* @__PURE__ */ new Date()).toISOString();
        await setJSON(STORE_NAMES.MAIL_THREADS, payload.threadId, thread);
        if (externalReply) {
          const sender = await getAccountProfile(email);
          try {
            const __amRes = await sendEmailTemplate(event, { template: "mail-message", to: thread.externalRecipient, subject: normalizeSubject(`Re: ${thread.subject}`), parameters: { replyToMessageId: thread.agentmail && thread.agentmail.lastMessageId || "", subject: normalizeSubject(`Re: ${thread.subject}`), senderName: String(sender.displayName || email).slice(0, 80), senderAccount: email, body: body || "\uFF08\u672C\u6587\u306F\u3042\u308A\u307E\u305B\u3093\u3002\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB\u3092\u3054\u78BA\u8A8D\u304F\u3060\u3055\u3044\u3002\uFF09", mailUrl: buildSiteUrl(event, "/Mail/Inbox/") }, attachments: externalAttachments });
            message.externalDeliveryStatus = "sent";
            thread.externalDelivery = { status: "sent", provider: "agentmail", updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
            await rememberAgentMailThread(thread, __amRes);
          } catch (error) {
            message.externalDeliveryStatus = "failed";
            thread.externalDelivery = { status: "failed", updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
            await setJSON(STORE_NAMES.MAIL_THREADS, payload.threadId, thread);
            if (error.code === "EMAIL_NOT_CONFIGURED") return json(503, { error: "\u30E1\u30FC\u30EB\u9001\u4FE1\u8A2D\u5B9A\u304C\u672A\u5B8C\u4E86\u3067\u3059\u3002\u30D7\u30ED\u30D0\u30A4\u30C0\u30FCAPI\u30AD\u30FC\u3068\u8A8D\u8A3C\u6E08\u307F\u5DEE\u51FA\u4EBA\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u8FD4\u4FE1\u306F\u672A\u9001\u4FE1\u3068\u3057\u3066\u4FDD\u5B58\u3057\u307E\u3057\u305F\u3002" });
            return json(502, { error: "[" + String(error && error.message || "").slice(0,300) + "] Gmail\u306A\u3069\u5916\u90E8\u5B9B\u3066\u306E\u8FD4\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002\u9001\u4FE1\u5143\u30C9\u30E1\u30A4\u30F3\u8A8D\u8A3C\u3068\u30D7\u30ED\u30D0\u30A4\u30C0\u30FC\u8A2D\u5B9A\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u8FD4\u4FE1\u306F\u672A\u9001\u4FE1\u3068\u3057\u3066\u4FDD\u5B58\u3057\u307E\u3057\u305F\u3002" });
          }
        }
        await setJSON(STORE_NAMES.MAIL_THREADS, payload.threadId, thread);
        return json(200, { thread });
      }
      if (action === "markRead") {
        const thread = await getJSON(STORE_NAMES.MAIL_THREADS, payload.threadId);
        if (!thread || !thread.memberEmails.includes(email)) return json(404, { error: "\u30B9\u30EC\u30C3\u30C9\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        thread.readBy = thread.readBy || {};
        thread.readBy[email] = (/* @__PURE__ */ new Date()).toISOString();
        await setJSON(STORE_NAMES.MAIL_THREADS, payload.threadId, thread);
        return json(200, { ok: true });
      }
      return json(400, { error: "\u4E0D\u660E\u306Aaction\u3067\u3059" });
    }
  }
});

// entries/mail-1pjzz.mjs
var import_mail = __toESM(require_mail(), 1);

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

// entries/mail-1pjzz.mjs
var handler = import_mail.default.handler || import_mail.default.default && import_mail.default.default.handler;
var __onRequest = wrap(handler, {});

export async function onRequest(context) {
  return __onRequest(context);
}
