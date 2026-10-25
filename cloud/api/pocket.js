import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);
import { SUPABASE2_URL, SUPABASE2_KEY, SUPABASE3_URL, SUPABASE3_KEY, SUPABASE4_URL, SUPABASE4_KEY, SUPABASE5_URL, SUPABASE5_KEY } from '../_lib/config2.js';
import { pushNotificationRecord as __pushNotificationRecord } from '../_lib/push.js';
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

// src/lib/notifications.js
var require_notifications = __commonJS({
  "src/lib/notifications.js"(exports, module) {
    var { STORE_NAMES, getJSON, setJSON, listKeys } = require_store();
    var crypto = __require("crypto");
    function notificationId() {
      return crypto.randomBytes(10).toString("hex");
    }
    function settingsKey(email, scope) {
      return `${String(email).toLowerCase()}:${String(scope)}`;
    }
    function defaultSettings() {
      return { reply: true, all: false, mention: true };
    }
    async function getNotificationSettings(email, scope) {
      const value = await getJSON(STORE_NAMES.NOTIFICATION_SETTINGS, settingsKey(email, scope));
      return { ...defaultSettings(), ...value && typeof value === "object" ? value : {} };
    }
    async function saveNotificationSettings(email, scope, input) {
      const settings = { reply: Boolean(input?.reply), all: Boolean(input?.all), mention: Boolean(input?.mention) };
      await setJSON(STORE_NAMES.NOTIFICATION_SETTINGS, settingsKey(email, scope), settings);
      return settings;
    }
    async function addNotification(recipientEmail, data) {
      const email = String(recipientEmail || "").toLowerCase();
      if (!email) return null;
      const record = { id: notificationId(), recipientEmail: email, read: false, createdAt: (/* @__PURE__ */ new Date()).toISOString(), ...data };
      await setJSON(STORE_NAMES.NOTIFICATIONS, `${email}:${record.id}`, record);
      try { await __pushNotificationRecord(email, record); } catch (_) {}
      return record;
    }
    async function listNotifications(email, limit = 100) {
      const prefix = `${String(email).toLowerCase()}:`;
      const keys = await listKeys(STORE_NAMES.NOTIFICATIONS);
      const values = [];
      for (const key of keys) if (key.startsWith(prefix)) {
        const item = await getJSON(STORE_NAMES.NOTIFICATIONS, key);
        if (item) values.push(item);
      }
      return values.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit);
    }
    module.exports = { getNotificationSettings, saveNotificationSettings, addNotification, listNotifications };
    async function notifyRecipients(recipients, scope, event) {
      const unique = Array.from(new Set(recipients.filter(Boolean).map((value) => String(value).toLowerCase())));
      for (const recipient of unique) {
        if (recipient === String(event.actorEmail || "").toLowerCase()) continue;
        const settings = await getNotificationSettings(recipient, scope);
        const mentioned = Array.isArray(event.mentionedEmails) && event.mentionedEmails.includes(recipient);
        const shouldNotify = event.isReply && String(event.replyToEmail || "").toLowerCase() === recipient && settings.reply || event.isMessage && settings.all || mentioned && settings.mention;
        if (shouldNotify) await addNotification(recipient, event);
      }
    }
    module.exports.notifyRecipients = notifyRecipients;
    module.exports.settingsKey = settingsKey;
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

// src/lib/gemini-memory.js
var require_gemini_memory = __commonJS({
  "src/lib/gemini-memory.js"(exports, module) {
    var crypto = __require("crypto");
    var { STORE_NAMES, getJSON, setJSON } = require_store();
    var MAX_ENTRIES = 80;
    var MAX_TEXT = 6e3;
    function memoryKey(service, scopeId, botId) {
      const raw = `${String(service)}|${String(scopeId)}|${String(botId)}`;
      return `memory:${crypto.createHash("sha256").update(raw).digest("hex")}`;
    }
    async function getGeminiMemory(service, scopeId, botId) {
      const key = memoryKey(service, scopeId, botId);
      const memory = await getJSON(STORE_NAMES.GEMINI_MEMORIES, key);
      if (!memory || !Array.isArray(memory.entries)) return { key, service, scopeId: String(scopeId), botId: String(botId), entries: [] };
      return { ...memory, key, entries: memory.entries.slice(-MAX_ENTRIES) };
    }
    function formatGeminiMemory(memory) {
      if (!memory?.entries?.length) return "\u307E\u3060\u4FDD\u5B58\u3055\u308C\u305F\u9577\u671F\u8A18\u61B6\u306F\u3042\u308A\u307E\u305B\u3093\u3002";
      return memory.entries.map((entry) => `[${entry.role === "model" ? "Gemini" : "\u30E6\u30FC\u30B6\u30FC"}] ${String(entry.text || "").slice(0, MAX_TEXT)}`).join("\n").slice(-3e4);
    }
    async function appendGeminiMemory(service, scopeId, botId, entries) {
      const memory = await getGeminiMemory(service, scopeId, botId);
      const additions = (Array.isArray(entries) ? entries : []).map((entry) => ({
        role: entry.role === "model" ? "model" : "user",
        text: String(entry.text || "").trim().slice(0, MAX_TEXT),
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      })).filter((entry) => entry.text);
      if (!additions.length) return memory;
      const updated = {
        format: "mixall-gemini-memory",
        version: 1,
        service: String(service),
        scopeId: String(scopeId),
        botId: String(botId),
        entries: [...memory.entries, ...additions].slice(-MAX_ENTRIES),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      await setJSON(STORE_NAMES.GEMINI_MEMORIES, memory.key, updated);
      return { ...updated, key: memory.key };
    }
    module.exports = { getGeminiMemory, formatGeminiMemory, appendGeminiMemory };
  }
});

// src/lib/official.js
var require_official = __commonJS({
  "src/lib/official.js"(exports, module) {
    var crypto = __require("crypto");
    var { STORE_NAMES, getJSON, setJSON, listKeys } = require_store();
    var { callGemini } = require_gemini();
    function newId() {
      return crypto.randomBytes(10).toString("hex");
    }
    function cleanName(value) {
      return String(value || "").trim().replace(/^@/, "").replace(/[^\w\-.ぁ-んァ-ヶ一-龯]/g, "").slice(0, 40);
    }
    function mentionRegExp(name) {
      return new RegExp(`@${String(name).replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}(?=$|\\s|[\u3001,:\uFF1A])`, "i");
    }
    function listOf(value) {
      return Array.isArray(value) ? value.map((item) => String(item).trim().toLowerCase()).filter(Boolean).slice(0, 30) : [];
    }
    function timeInRange(value, start, end) {
      if (!/^\d{2}:\d{2}$/.test(String(start || "")) || !/^\d{2}:\d{2}$/.test(String(end || ""))) return true;
      const current = String(value).slice(0, 5);
      if (!/^\d{2}:\d{2}$/.test(current)) return true;
      return start <= end ? current >= start && current <= end : current >= start || current <= end;
    }
    function conditionsMatch(conditions, event) {
      const c = conditions && typeof conditions === "object" ? conditions : {};
      const text = String(event.text || "");
      const lower = text.toLowerCase();
      const email = String(event.authorEmail || "").toLowerCase();
      const fromEmails = listOf(c.fromEmails);
      if (fromEmails.length && !fromEmails.includes(email)) return false;
      if (c.fromIncludes && !email.includes(String(c.fromIncludes).toLowerCase())) return false;
      for (const item of listOf(c.textIncludes)) if (!lower.includes(item)) return false;
      for (const item of listOf(c.textExcludes)) if (lower.includes(item)) return false;
      const history = String(event.history || "").toLowerCase();
      for (const item of listOf(c.historyIncludes)) if (!history.includes(item)) return false;
      for (const item of listOf(c.historyExcludes)) if (history.includes(item)) return false;
      const historyCount = Number(event.historyMessageCount ?? (event.history ? String(event.history).split("\n").filter(Boolean).length : 0));
      if (Number.isFinite(Number(c.historyMessageCountMin)) && historyCount < Number(c.historyMessageCountMin)) return false;
      if (Number.isFinite(Number(c.historyMessageCountMax)) && historyCount > Number(c.historyMessageCountMax)) return false;
      if (c.textRegex) {
        const pattern = String(c.textRegex).slice(0, 160);
        try {
          if (!new RegExp(pattern, "i").test(text)) return false;
        } catch {
          return false;
        }
      }
      const rooms = listOf(c.roomIds);
      if (rooms.length && !rooms.includes(String(event.roomId || "").toLowerCase())) return false;
      const threads = listOf(c.threadIds);
      if (threads.length && !threads.includes(String(event.threadId || "").toLowerCase())) return false;
      if (typeof c.hasAttachment === "boolean" && Boolean(event.hasAttachment) !== c.hasAttachment) return false;
      if (typeof c.isReply === "boolean" && Boolean(event.isReply) !== c.isReply) return false;
      const status = c.ghostStatus && typeof c.ghostStatus === "object" ? c.ghostStatus : {};
      const currentStatus = event.ghostStatus && typeof event.ghostStatus === "object" ? event.ghostStatus : {};
      for (const key of ["contentType", "title", "visibility"]) if (status[key] !== void 0 && String(currentStatus[key] ?? "") !== String(status[key])) return false;
      for (const key of ["hasMedia", "hasTitle", "isVideo", "isShort"]) if (typeof status[key] === "boolean" && Boolean(currentStatus[key]) !== status[key]) return false;
      if (Array.isArray(c.daysOfWeek) && c.daysOfWeek.length) {
        const day = new Date(event.now || Date.now()).getUTCDay();
        if (!c.daysOfWeek.map(Number).includes(day)) return false;
      }
      if (c.timeRangeUtc && !timeInRange(new Date(event.now || Date.now()).toISOString().slice(11, 16), c.timeRangeUtc.start, c.timeRangeUtc.end)) return false;
      return true;
    }
    function publicOfficial(account) {
      return { id: account.id, name: account.name, handle: account.handle, displayName: account.displayName, icon: account.icon || "\u516C\u5F0F", enabled: account.enabled !== false, channels: account.channels || [], ruleCount: Array.isArray(account.rules) ? account.rules.length : 0, createdAt: account.createdAt };
    }
    async function listOfficialAccounts() {
      const rows = [];
      for (const key of await listKeys(STORE_NAMES.OFFICIAL_ACCOUNTS)) {
        const account = await getJSON(STORE_NAMES.OFFICIAL_ACCOUNTS, key);
        if (account && account.id) rows.push(account);
      }
      return rows.sort((a, b) => String(a.displayName).localeCompare(String(b.displayName), "ja"));
    }
    async function hasOfficialAutomations(channel) {
      const accounts = await listOfficialAccounts();
      return accounts.some((account) => account.enabled !== false && (account.channels || []).includes(channel) && (account.rules || []).some((rule) => rule && rule.enabled !== false));
    }
    function ruleMatches(rule, event) {
      if (!rule || rule.enabled === false || rule.channel !== event.channel) return false;
      if (!conditionsMatch(rule.conditions, event)) return false;
      const trigger = rule.trigger || "mention";
      if (trigger === "every") return true;
      if (trigger === "keyword") return rule.keyword && event.text.toLowerCase().includes(String(rule.keyword).toLowerCase());
      return mentionRegExp(event.handle || "").test(event.text);
    }
    async function createGhostPost(account, text, event) {
      const id = event.jobId && Number.isInteger(event.ruleIndex) ? crypto.createHash("sha256").update(`official-ghost:${event.jobId}:${account.id}:${event.ruleIndex}`).digest("hex").slice(0, 20) : newId();
      const post = { id, authorEmail: `official:${account.id}`, authorName: account.displayName, isBot: true, officialAccountId: account.id, title: null, description: text, text, media: [], contentType: "text", tags: [], stickerId: null, likes: [], comments: [], replyTo: event.sourceId || null, ...event.jobId ? { backgroundJobId: event.jobId } : {}, createdAt: (/* @__PURE__ */ new Date()).toISOString() };
      await setJSON(STORE_NAMES.GHOST_POSTS, post.id, post);
      return post;
    }
    async function runOfficialRules(event) {
      const accounts = await listOfficialAccounts();
      const results = [];
      for (const account of accounts) {
        if (account.enabled === false || !(account.channels || []).includes(event.channel)) continue;
        for (const [ruleIndex, rule] of (account.rules || []).entries()) {
          if (!ruleMatches(rule, { ...event, handle: account.handle })) continue;
          let text = String(rule.text || "").slice(0, 5e3);
          if (rule.action === "ai") {
            const prompt = event.text.replace(mentionRegExp(account.handle), "").trim() || "\u6328\u62F6\u3092\u3057\u3066\u304F\u3060\u3055\u3044\u3002";
            const result2 = await callGemini({ model: rule.model || "gemini-2.0-flash", timeoutMs: 2e4, body: { systemInstruction: { parts: [{ text: rule.instruction || `\u3042\u306A\u305F\u306F\u516C\u5F0F\u30A2\u30AB\u30A6\u30F3\u30C8\u300C${account.displayName}\u300D\u3067\u3059\u3002\u65E5\u672C\u8A9E\u3067\u5B89\u5168\u306B\u56DE\u7B54\u3057\u3066\u304F\u3060\u3055\u3044\u3002` }] }, contents: [{ parts: [{ text: `\u4F1A\u8A71\u5C65\u6B74:
${String(event.history || "").slice(-12e3)}

${prompt}` }] }], generationConfig: { maxOutputTokens: 1200, temperature: 0.7 } } });
            text = result2.ok ? (result2.data.candidates?.[0]?.content?.parts || []).map((part) => part.text || "").join("").trim() : result2.error || "AI\u304B\u3089\u8FD4\u4FE1\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002";
          }
          if (!text) continue;
          const result = { account, rule, text };
          result.ruleIndex = ruleIndex;
          if (rule.action === "ghostPost") result.post = await createGhostPost(account, text, { ...event, ruleIndex });
          results.push(result);
          if (rule.stopAfterMatch !== false) break;
        }
      }
      return results;
    }
    module.exports = { newId, cleanName, publicOfficial, listOfficialAccounts, hasOfficialAutomations, runOfficialRules, conditionsMatch };
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
      if (["uch-ai", "pocket-bots", "ghost-post-bots", "mail-official-bots"].includes(String(type))) throw new Error("EdgeOneではその場で処理します");
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

// src/lib/search.js
var require_search = __commonJS({
  "src/lib/search.js"(exports, module) {
    function parseSearchQuery(input) {
      const raw = String(input || "").trim();
      const filters = { author: [], tag: [], type: [], room: [], terms: [] };
      const parts = raw.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
      for (const part of parts) {
        const value = part.replace(/^"|"$/g, "");
        const match = value.match(/^([\wぁ-んァ-ヶ一-龯]+):(.+)$/);
        if (!match) {
          if (value) filters.terms.push(value.toLowerCase());
          continue;
        }
        const key = match[1].toLowerCase();
        const item = match[2].replace(/^@/, "").toLowerCase();
        if (!item) continue;
        if (key === "\u6295\u7A3F\u8005" || key === "author" || key === "from" || key === "user") filters.author.push(item);
        else if (key === "\u30BF\u30B0" || key === "tag" || key === "hashtag") filters.tag.push(item.replace(/^#/, ""));
        else if (key === "\u7A2E\u985E" || key === "type") filters.type.push(item);
        else if (key === "room" || key === "\u30EB\u30FC\u30E0") filters.room.push(item);
        else filters.terms.push(value.toLowerCase());
      }
      return { raw, ...filters };
    }
    function matchesSearchQuery(query, item) {
      const author = String(item.authorHandle || item.authorEmail || item.authorName || "").toLowerCase().replace(/^@/, "");
      const tags = (Array.isArray(item.tags) ? item.tags : []).map((tag) => String(tag).toLowerCase().replace(/^#/, ""));
      const haystack = String(item.searchable || "").toLowerCase();
      return query.author.every((value) => author.includes(value)) && query.tag.every((value) => tags.includes(value) || haystack.includes(`#${value}`) || haystack.includes(value)) && query.type.every((value) => String(item.type || "").toLowerCase() === value) && query.terms.every((value) => haystack.includes(value));
    }
    module.exports = { parseSearchQuery, matchesSearchQuery };
  }
});

// src/lib/media-dedupe.js
var require_media_dedupe = __commonJS({
  "src/lib/media-dedupe.js"(exports, module) {
    var crypto = __require("crypto");
    var { getJSON, setJSON, deleteKey, STORE_NAMES } = require_store();
    var XGD_API_KEY = ((typeof process !== "undefined" && process.env && process.env.XGD_API_KEY) || "");
    var MAX_PUBLIC_IMAGE_BYTES = 12 * 1024 * 1024;
    function publicBase(event) {
      const headers2 = event.headers || {};
      const host = headers2["x-forwarded-host"] || headers2.host || "";
      const proto = headers2["x-forwarded-proto"] || "https";
      if (process.env.MIXALL_SITE_URL) { try { return new URL(process.env.MIXALL_SITE_URL).origin; } catch (_) {} }
      return /^[a-z0-9.-]+(?::\d+)?$/i.test(host) && !/\.qcloudteo\.com(:\d+)?$/i.test(host) ? `${proto}://${host}` : "https://mixalls.edgeone.dev";
    }
    function imageType(type) {
      return /^image\/[a-z0-9.+-]+$/i.test(String(type || ""));
    }
    async function readFileBytes(fileId, manifest) {
      const cryptoHash = crypto.createHash("sha256");
      const chunks = [];
      for (let index = 0; index < Number(manifest.totalChunks || 0); index += 1) {
        const item = await getJSON(STORE_NAMES.FILE_CHUNKS, `${fileId}:chunk:${index}`);
        if (!item || typeof item.data !== "string") throw new Error("\u753B\u50CF\u30C1\u30E3\u30F3\u30AF\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093");
        const bytes = Buffer.from(item.data, "base64");
        cryptoHash.update(bytes);
        chunks.push(bytes);
      }
      const buffer = Buffer.concat(chunks);
      if (buffer.length > MAX_PUBLIC_IMAGE_BYTES) throw new Error("\u516C\u958B\u753B\u50CF\u306F12MB\u307E\u3067\u3067\u3059");
      return { hash: cryptoHash.digest("hex"), buffer };
    }
    async function xgdKeyCandidates() {
      const list = [];
      try {
        const saved = await getJSON(STORE_NAMES.ADMIN_SECRETS, "xgd:apiKey");
        const k = String(saved && saved.apiKey || "").trim();
        if (/^[0-9a-f]{32}$/i.test(k)) list.push(k);
      } catch (_) {
      }
      if (XGD_API_KEY && !list.includes(XGD_API_KEY)) list.push(XGD_API_KEY);
      return list;
    }
    async function requestXgd(target) {
      let lastError = null;
      for (const key of await xgdKeyCandidates()) {
        try {
          const url = new URL("https://xgd.io/V1/shorten");
          url.searchParams.set("url", target);
          url.searchParams.set("key", key);
          url.searchParams.set("analytics", "true");
          url.searchParams.set("filterbots", "true");
          const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(6e3) });
          const result = await response.json().catch(() => ({}));
          if (response.ok && Number(result.status) === 200 && result.shorturl) return result.shorturl;
          lastError = new Error(result.message || "x.gd\u77ED\u7E2EURL\u3092\u767A\u884C\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F");
        } catch (e) {
          lastError = e;
        }
      }
      throw lastError || new Error("x.gd\u77ED\u7E2EURL\u3092\u767A\u884C\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F");
    }
    async function removeUploadedFile(fileId, manifest) {
      for (let index = 0; index < Number(manifest.totalChunks || 0); index += 1) {
        await deleteKey(STORE_NAMES.FILE_CHUNKS, `${fileId}:chunk:${index}`);
      }
      await deleteKey(STORE_NAMES.FILE_MANIFESTS, `${fileId}:manifest`);
    }
    async function dedupeImageAttachment(event, attachment, ownerEmail) {
      if (!attachment || !attachment.fileId || !imageType(attachment.type) || attachment.isStamp) return attachment;
      const fileId = String(attachment.fileId).trim();
      const manifest = await getJSON(STORE_NAMES.FILE_MANIFESTS, `${fileId}:manifest`);
      if (!manifest?.finalized) throw new Error("\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB\u306E\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9\u304C\u5B8C\u4E86\u3057\u3066\u3044\u307E\u305B\u3093");
      if (manifest.ownerEmail !== ownerEmail) throw new Error("\u3053\u306E\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB\u3092\u6295\u7A3F\u3059\u308B\u6A29\u9650\u304C\u3042\u308A\u307E\u305B\u3093");
      const { hash, buffer } = await readFileBytes(fileId, manifest);
      const key = `dedupe-media:${hash}`;
      const existing = await getJSON(STORE_NAMES.TOOL_DATA, key);
      if (existing?.shortUrl && existing?.mediaUrl && !/qcloudteo\.com/i.test(existing.mediaUrl)) {
        if (existing.fileId !== fileId) await removeUploadedFile(fileId, manifest);
        return { ...attachment, fileId: void 0, mediaHash: hash, mediaUrl: existing.mediaUrl, shortUrl: existing.shortUrl, sizeBytes: existing.sizeBytes || buffer.length };
      }
      const mediaUrl = `${publicBase(event)}/api/media?hash=${hash}`;
      const shortUrl = await requestXgd(mediaUrl);
      const record = { hash, fileId, mediaUrl, shortUrl, type: String(attachment.type || manifest.mimeType || "image/octet-stream"), name: String(attachment.name || manifest.fileName || "image"), sizeBytes: buffer.length, createdAt: (/* @__PURE__ */ new Date()).toISOString() };
      await setJSON(STORE_NAMES.TOOL_DATA, key, record);
      return { ...attachment, fileId: void 0, mediaHash: hash, mediaUrl, shortUrl, sizeBytes: buffer.length };
    }
    module.exports = { dedupeImageAttachment, readFileBytes, imageType };
  }
});

// src/lib/ai-gateway.js
var require_ai_gateway = __commonJS({
  "src/lib/ai-gateway.js"(exports, module) {
    var { getJSON } = require_store();
    function gatewayReady() {
      return Boolean(String(process.env.OPENAI_BASE_URL || "").trim() && String(process.env.OPENAI_API_KEY || "").trim());
    }
    function operatorContext(room, profiles = {}) {
      const rows = (Array.isArray(room?.memberEmails) ? room.memberEmails : []).map((email) => {
        const profile = profiles[email] || {};
        const roles = [];
        if (email === room.hostEmail) roles.push("\u3053\u306E\u30EB\u30FC\u30E0\u306E\u4E3B\u904B\u55B6");
        if (Array.isArray(room.subHosts) && room.subHosts.includes(email)) roles.push("\u3053\u306E\u30EB\u30FC\u30E0\u306E\u526F\u904B\u55B6");
        if (profile.isAdmin) roles.push("\u30B5\u30A4\u30C8\u4E3B\u904B\u55B6");
        else if (profile.isDeputyAdmin) roles.push("\u30B5\u30A4\u30C8\u526F\u904B\u55B6");
        else if (profile.isOperator) roles.push("\u30B5\u30A4\u30C8\u904B\u55B6");
        return `${profile.displayName || email} (${email})${roles.length ? `: ${roles.join("\u30FB")}` : ": \u4E00\u822C\u30E1\u30F3\u30D0\u30FC"}`;
      });
      return rows.length ? rows.join("\n") : "\u904B\u55B6\u533A\u5206\u3092\u78BA\u8A8D\u3067\u304D\u308B\u30E1\u30F3\u30D0\u30FC\u60C5\u5831\u306F\u3042\u308A\u307E\u305B\u3093\u3002";
    }
    async function callAiGateway({ model = "gpt-5-mini", system = "", user = "", timeoutMs = 25e3 }) {
      if (!gatewayReady()) return { ok: false, status: 503, error: "AI API(OPENAI_BASE_URL / OPENAI_API_KEY)\u304C\u672A\u8A2D\u5B9A\u3067\u3059" };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(`${String(process.env.OPENAI_BASE_URL).replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
          signal: controller.signal,
          body: JSON.stringify({
            model,
            messages: [{ role: "system", content: String(system).slice(0, 12e3) }, { role: "user", content: String(user).slice(0, 18e3) }],
            temperature: 0.35,
            max_completion_tokens: 1400
          })
        });
        const data = await response.json().catch(() => ({}));
        const text = data.choices?.[0]?.message?.content;
        if (!response.ok || typeof text !== "string") return { ok: false, status: response.status || 503, error: data.error?.message || "AI Gateway\u306E\u5FDC\u7B54\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F" };
        return { ok: true, status: response.status, text: text.trim(), model: data.model || model, usage: data.usage || null };
      } catch (error) {
        return { ok: false, status: 503, error: error.name === "AbortError" ? "AI Gateway\u304C\u30BF\u30A4\u30E0\u30A2\u30A6\u30C8\u3057\u307E\u3057\u305F" : "AI Gateway\u3078\u63A5\u7D9A\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F" };
      } finally {
        clearTimeout(timer);
      }
    }
    module.exports = { gatewayReady, callAiGateway, operatorContext };
  }
});

// src/functions/pocket.js
var require_pocket = __commonJS({
  "src/functions/pocket.js"(exports) {
    var crypto = __require("crypto");
    var { connectLambda: connectLambda2 } = (init_blobs(), __toCommonJS(blobs_exports));
    var { STORE_NAMES, getJSON, setJSON, listKeys } = require_store();
    var { requireSession, requireAdmin, getAccountProfile } = require_session();
    var { createReport } = require_reports();
    var { notifyRecipients } = require_notifications();
    var { callGemini } = require_gemini();
    var { getGeminiMemory, formatGeminiMemory, appendGeminiMemory } = require_gemini_memory();
    var { runOfficialRules, hasOfficialAutomations } = require_official();
    var { enqueueBackgroundTask } = require_background_jobs();
    var { parseSearchQuery } = require_search();
    var { dedupeImageAttachment } = require_media_dedupe();
    var { callAiGateway, operatorContext } = require_ai_gateway();
    function json(status, body) {
      return {
        statusCode: status,
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(body)
      };
    }
    var MAX_LEGACY_MEDIA_BYTES = 10 * 1024 * 1024;
    async function normalizePocketMedia(items, email, limit) {
      const normalized = [];
      for (const item of (Array.isArray(items) ? items : []).slice(0, limit)) {
        if (item?.fileId) {
          const fileId = String(item.fileId).trim();
          const manifest = await getJSON(STORE_NAMES.FILE_MANIFESTS, `${fileId}:manifest`);
          if (!manifest?.finalized) return { error: "\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB\u306E\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9\u304C\u5B8C\u4E86\u3057\u3066\u3044\u307E\u305B\u3093", status: 400 };
          if (manifest.ownerEmail !== email) return { error: "\u3053\u306E\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB\u3092\u4FDD\u5B58\u3059\u308B\u6A29\u9650\u304C\u3042\u308A\u307E\u305B\u3093", status: 403 };
          normalized.push({ fileId, name: String(item.name || manifest.fileName || "file").slice(0, 160), type: String(item.type || manifest.mimeType || "application/octet-stream").slice(0, 120), sizeBytes: Number(manifest.totalBytes) || 0 });
        } else if (item?.dataUrl && String(item.dataUrl).length < MAX_LEGACY_MEDIA_BYTES) {
          normalized.push({ name: String(item.name || "file").slice(0, 160), type: String(item.type || "application/octet-stream").slice(0, 120), dataUrl: String(item.dataUrl) });
        }
      }
      return { items: normalized };
    }
    var DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";
    function normalizeGeminiModel(model) {
      const value = String(model || "").trim();
      return !value || value === "gemini-flash-latest" || value === "gemini-2.0-flash" || value === "models/gemini-2.0-flash" ? DEFAULT_GEMINI_MODEL : value;
    }
    async function callMixAllAi({ system = "", history = [], timeoutMs = 25e3 }) {
      const key = String(process.env.MAKERS_MODELS_KEY || process.env.MIXALL_AI_API_KEY || "").trim();
      if (!key) return { ok: false, error: "MixAll AI\u306EAPI\u30AD\u30FC(MAKERS_MODELS_KEY)\u304C\u672A\u8A2D\u5B9A\u3067\u3059" };
      const base = String(process.env.MIXALL_AI_BASE_URL || "https://ai-gateway.edgeone.link/v1").replace(/\/$/, "");
      const model = String(process.env.MIXALL_AI_MODEL || "@makers/deepseek-v4-flash");
      const messages = [{ role: "system", content: String(system).slice(0, 12e3) }, ...history.map((item) => ({ role: item.role === "model" ? "assistant" : "user", content: (item.parts || []).map((part) => part.text || "").join("").slice(0, 18e3) }))];
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(`${base}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, signal: controller.signal, body: JSON.stringify({ model, messages, stream: false, temperature: 0.7, max_tokens: 1400 }) });
        const data = await response.json().catch(() => ({}));
        const text = String(data?.choices?.[0]?.message?.content || "").trim();
        if (!response.ok || !text) return { ok: false, error: `MixAll AI\u304B\u3089\u8FD4\u7B54\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F(${response.status} ${String(data?.error?.message || data?.error || "").slice(0, 120)})` };
        return { ok: true, text };
      } catch (error) {
        return { ok: false, error: error.name === "AbortError" ? "MixAll AI\u306E\u5FDC\u7B54\u304C\u6642\u9593\u5185\u306B\u8FD4\u308A\u307E\u305B\u3093\u3067\u3057\u305F" : `MixAll AI\u3078\u306E\u63A5\u7D9A\u306B\u5931\u6557\u3057\u307E\u3057\u305F: ${error.message}` };
      } finally {
        clearTimeout(timer);
      }
    }
    async function generatePocketAiReply(bot, prompt, context = "", locationContext = "") {
      if (bot.botType === "mixall" || bot.model === "mixall-ai") {
        const mixall = await callMixAllAi({
          system: String(bot.instruction || "MixAll AI\u3068\u3057\u3066\u65E5\u672C\u8A9E\u3067\u7C21\u6F54\u304B\u3064\u5B89\u5168\u306B\u56DE\u7B54\u3057\u3066\u304F\u3060\u3055\u3044\u3002").slice(0, 3e3),
          history: [{ role: "user", parts: [{ text: `${String(locationContext).slice(0, 3e3)}\n\n\u4F1A\u8A71\u5C65\u6B74:\n${String(context).slice(-12e3)}\n\n\u4ECA\u56DE\u306E\u30E1\u30C3\u30BB\u30FC\u30B8:\n${String(prompt).slice(0, 6e3)}` }] }],
          timeoutMs: 2e4
        });
        return mixall.ok ? mixall.text : mixall.error || "MixAll AI\u3092\u5229\u7528\u3067\u304D\u307E\u305B\u3093\u3002";
      }
      if (bot.botType === "mixbot") {
        const result2 = await callAiGateway({
          model: String(bot.model || "gpt-5-mini"),
          system: String(bot.instruction || "MixBot\u3068\u3057\u3066\u65E5\u672C\u8A9E\u3067\u7C21\u6F54\u304B\u3064\u5B89\u5168\u306B\u56DE\u7B54\u3057\u3066\u304F\u3060\u3055\u3044\u3002").slice(0, 3e3),
          user: `${String(locationContext).slice(0, 3e3)}

\u4F1A\u8A71\u5C65\u6B74:
${String(context).slice(-12e3)}

\u4ECA\u56DE\u306E\u30E1\u30C3\u30BB\u30FC\u30B8:
${String(prompt).slice(0, 6e3)}`,
          timeoutMs: 2e4
        });
        return result2.ok ? result2.text : result2.error || "MixBot\u3092\u5229\u7528\u3067\u304D\u307E\u305B\u3093\u3002";
      }
      const model = normalizeGeminiModel(bot.model);
      const result = await callGemini({ model, timeoutMs: 2e4, body: { systemInstruction: { parts: [{ text: String(bot.instruction || "\u65E5\u672C\u8A9E\u3067\u7C21\u6F54\u304B\u3064\u5B89\u5168\u306B\u56DE\u7B54\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u500B\u4EBA\u60C5\u5831\u3084\u5371\u967A\u306A\u884C\u70BA\u3092\u52A9\u9577\u3057\u306A\u3044\u3067\u304F\u3060\u3055\u3044\u3002\u9001\u4FE1\u8005\u540D\u3068\u8FD4\u4FE1\u5148\u3092\u8E0F\u307E\u3048\u3066\u56DE\u7B54\u3057\u3066\u304F\u3060\u3055\u3044\u3002").slice(0, 2e3) }] }, contents: [{ parts: [{ text: `\u73FE\u5728\u306E\u5834\u6240\uFF08\u3053\u306E\u60C5\u5831\u306F\u73FE\u5728\u306E\u4F1A\u8A71\u306E\u6240\u5C5E\u5148\u3092\u793A\u3057\u307E\u3059\uFF09:
${String(locationContext || "\u30B5\u30FC\u30D3\u30B9: Pocket").slice(0, 500)}

\u4F1A\u8A71\u5C65\u6B74:
${String(context || "").slice(-12e3)}

\u4ECA\u56DE\u306E\u30E1\u30C3\u30BB\u30FC\u30B8:
${String(prompt || "").slice(0, 6e3)}` }] }], generationConfig: { maxOutputTokens: 1200, temperature: 0.7 } } });
      if (!result.ok) return result.error || "Gemini API\u3078\u306E\u63A5\u7D9A\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002";
      return result.data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim() || "Gemini\u304B\u3089\u8FD4\u4FE1\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002";
    }
    async function processPocketBotTask(payload, jobId) {
      const room = await getRoom(String(payload?.roomId || ""));
      if (!room) return;
      const message = room.messages.find((item) => item.id === String(payload?.messageId || "") && !item.deleted);
      if (!message) return;
      const email = message.authorEmail;
      const text = String(message.text || "");
      const botProfiles = {};
      for (const memberEmail of room.memberEmails) botProfiles[memberEmail] = await getAccountProfile(memberEmail);
      const visibleOperatorContext = operatorContext(room, botProfiles);
      for (const bot of room.bots.filter((item) => item.enabled !== false)) {
        if (room.messages.some((item) => item.backgroundJobId === jobId && item.botId === bot.id)) continue;
        const __mEsc = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const __mIds = [bot.uchId, bot.sourceThreadId && bot.sourceBotId ? "b" + crypto.createHash("sha256").update(`${bot.sourceThreadId}|${bot.sourceBotId}`).digest("hex").slice(0, 10) : "", bot.sourceBotId].filter(Boolean);
        const mention = new RegExp(`@(?:${[bot.name, ...__mIds].filter(Boolean).map(__mEsc).join("|")})(?![A-Za-z0-9_])`, "i");
        const match = mention.exec(text.replace(/\uFF20/g, "@"));
        let replyMessage = bot.replyMessage || `${bot.name} \u304B\u3089\u306E\u8FD4\u4FE1\u3067\u3059\u3002`;
        let triggerType = bot.triggerType || bot.sourceTriggerType || "canned";
        let aiSettings = bot;
        if (bot.sourceThreadId && bot.sourceBotId) {
          const sourceBots = await getJSON(STORE_NAMES.UCH_BOTS, bot.sourceThreadId) || [];
          const source = sourceBots.find((item) => item.id === bot.sourceBotId || item.uchId === bot.sourceBotId || "b" + crypto.createHash("sha256").update(`${bot.sourceThreadId}|${item.id}`).digest("hex").slice(0, 10) === bot.sourceBotId);
          if (source) {
            triggerType = source.triggerType || triggerType;
            replyMessage = source.replyMessage || source.cannedMessage || source.message || replyMessage;
            aiSettings = { ...bot, model: source.model || bot.model, instruction: source.instruction || bot.instruction };
          }
        }
        const botKind = ["ai", "mixbot", "mixall"].includes(aiSettings.botType) || aiSettings.model === "mixall-ai" || aiSettings.sourceTriggerType === "ai" || triggerType === "ai" ? "ai" : "canned";
        const trigger = ["mention", "every"].includes(aiSettings.triggerType) ? aiSettings.triggerType : "mention";
        if (trigger !== "every" && !match) continue;
        if (botKind === "ai") {
          const prompt = trigger === "every" ? text : text.slice(match.index + match[0].length).trim();
          if (!prompt) replyMessage = `@${bot.name} \u306E\u5F8C\u306B\u8CEA\u554F\u3092\u66F8\u3044\u3066\u304F\u3060\u3055\u3044\u3002`;
          else {
            const replyContext = message.replyTo ? room.messages.find((item) => item.id === message.replyTo) : null;
            const history = `\u3053\u306E\u30C1\u30E3\u30C3\u30C8\u3067\u78BA\u8A8D\u3067\u304D\u308B\u904B\u55B6\u533A\u5206:
${visibleOperatorContext}

${room.messages.slice(-24).map((item) => `[${item.authorName || item.authorEmail}] ${item.text || "(\u6DFB\u4ED8)"}${item.id === message.replyTo ? " \u2190\u3053\u306E\u30E1\u30C3\u30BB\u30FC\u30B8\u3078\u306E\u8FD4\u4FE1\u5148" : ""}`).join("\n")}`;
            const memory = await getGeminiMemory("pocket", room.id, bot.id);
            const memoryContext = `\u9577\u671F\u8A18\u61B6\uFF08\u3053\u306EPocket\u90E8\u5C4B\u306EGemini\u5C02\u7528\u3002\u4F1A\u8A71\u306E\u4E8B\u5B9F\u3068\u3057\u3066\u6271\u3063\u3066\u304F\u3060\u3055\u3044\uFF09:
${formatGeminiMemory(memory)}

`;
            replyMessage = await generatePocketAiReply(aiSettings, `${memoryContext}\u9001\u4FE1\u8005: ${message.authorName || email} (${email})
\u8FD4\u4FE1\u5148: ${replyContext ? `${replyContext.authorName}: ${replyContext.text || "(\u6DFB\u4ED8)"}` : "\u306A\u3057"}
\u672C\u6587: ${prompt}
\u9001\u4FE1\u672C\u6587\u306E\u8A08\u6E2C: \u6587\u5B57\u6570=${[...text].length}\u3001UTF-8\u30D0\u30A4\u30C8\u6570=${Buffer.byteLength(text, "utf8")}`, history, `\u30B5\u30FC\u30D3\u30B9: Pocket
\u90E8\u5C4B\u540D: ${room.title || "\u540D\u79F0\u672A\u8A2D\u5B9A"}
\u90E8\u5C4BID: ${room.id}`);
            if (replyMessage && !replyMessage.startsWith("Gemini API")) {
              try {
                await appendGeminiMemory("pocket", room.id, bot.id, [{ role: "user", text: prompt }, { role: "model", text: replyMessage }]);
              } catch (memoryError) {
                console.error("Pocket Gemini memory save failed:", memoryError);
              }
            }
          }
        }
        room.messages.push({ id: newId(), authorEmail: `bot:${bot.id}`, authorName: bot.name, text: replyMessage, attachment: null, botId: bot.id, isBot: true, replyTo: message.id, backgroundJobId: jobId, readBy: [], createdAt: (/* @__PURE__ */ new Date()).toISOString() });
      }
      const replyTarget = message.replyTo ? room.messages.find((item) => item.id === message.replyTo) : null;
      const officialReplies = await runOfficialRules({ channel: "pocket", text, authorEmail: email, sourceId: message.id, roomId: room.id, hasAttachment: Boolean(message.attachment), isReply: Boolean(replyTarget), now: Date.now(), historyMessageCount: room.messages.length, history: room.messages.slice(-24).map((item) => `[${item.authorName || item.authorEmail}] ${item.text || "(\u6DFB\u4ED8)"}`).join("\n"), jobId });
      for (const reply of officialReplies) {
        const ruleIndex = Number.isInteger(reply.ruleIndex) ? reply.ruleIndex : 0;
        if (room.messages.some((item) => item.backgroundJobId === jobId && item.officialAccountId === reply.account.id && item.backgroundRuleIndex === ruleIndex)) continue;
        const id = crypto.createHash("sha256").update(`pocket-official:${jobId}:${reply.account.id}:${ruleIndex}`).digest("hex").slice(0, 16);
        room.messages.push({ id, authorEmail: `official:${reply.account.id}`, authorName: reply.account.displayName, text: reply.text, attachment: null, isBot: true, isOfficial: true, officialAccountId: reply.account.id, backgroundRuleIndex: ruleIndex, replyTo: message.id, backgroundJobId: jobId, readBy: [], createdAt: (/* @__PURE__ */ new Date()).toISOString() });
      }
      const generatedReplies = room.messages.filter((item) => item.backgroundJobId === jobId);
      const latest = await getRoom(room.id);
      if (!latest || latest.messages.find((item) => item.id === message.id)?.deleted) return;
      for (const reply of generatedReplies) {
        const duplicate = latest.messages.some((item) => item.id === reply.id || item.backgroundJobId === jobId && item.botId === reply.botId && item.officialAccountId === reply.officialAccountId && item.backgroundRuleIndex === reply.backgroundRuleIndex);
        if (!duplicate) latest.messages.push(reply);
      }
      await setJSON(STORE_NAMES.POCKET_ROOMS, latest.id, latest);
    }
    exports.processBackgroundTask = processPocketBotTask;
    function newId() {
      return crypto.randomBytes(8).toString("hex");
    }
    function normalizeEmail(input) {
      return String(input || "").trim().toLowerCase();
    }
    async function getRoom(roomId) {
      const room = await getJSON(STORE_NAMES.POCKET_ROOMS, roomId);
      if (!room) return null;
      room.memberEmails = Array.isArray(room.memberEmails) ? room.memberEmails : [];
      room.subHosts = Array.isArray(room.subHosts) ? room.subHosts : [];
      room.customRoles = Array.isArray(room.customRoles) ? room.customRoles : [];
      room.nicknames = room.nicknames && typeof room.nicknames === "object" ? room.nicknames : {};
      room.bots = Array.isArray(room.bots) ? room.bots : [];
      room.threads = Array.isArray(room.threads) ? room.threads : [];
      room.messages = Array.isArray(room.messages) ? room.messages : [];
      room.typing = room.typing && typeof room.typing === "object" ? room.typing : {};
      room.messages.forEach((message) => {
        message.readBy = Array.isArray(message.readBy) ? message.readBy : [message.authorEmail].filter(Boolean);
      });
      return room;
    }
    async function getMinefieldSettings(email) {
      const saved = await getJSON(STORE_NAMES.MESSAGE_FILTER_SETTINGS, `user:${email}`) || {};
      return { email, enabled: false, instruction: "", version: 1, ...saved };
    }
    async function transformForViewer(message, viewerEmail, room, profiles, settings, isAdmin) {
      const raw = String(message.text || "");
      const base = { ...message, text: raw, textChars: [...raw].length, textBytes: Buffer.byteLength(raw, "utf8") };
      if (!raw || !settings.enabled || message.authorEmail === viewerEmail || isAdmin) return base;
      const cacheKey = `${room.id}:${message.id}:${viewerEmail}:${Number(settings.version) || 1}`;
      const cached = await getJSON(STORE_NAMES.MESSAGE_FILTER_CACHE, cacheKey);
      if (cached?.displayText !== void 0) return { ...base, text: String(cached.displayText), transformed: true, originalAvailable: true };
      const result = await callAiGateway({
        model: "gemini-2.5-flash",
        system: `\u3042\u306A\u305F\u306FMixAll\u306E\u500B\u4EBA\u8868\u793A\u30D5\u30A3\u30EB\u30BF\u30FC\u3067\u3059\u3002\u53D7\u4FE1\u8005\u672C\u4EBA\u306E\u8A2D\u5B9A\u306B\u5F93\u3044\u3001\u53D7\u4FE1\u8005\u306E\u753B\u9762\u306B\u8868\u793A\u3059\u308B\u6587\u7AE0\u3078\u5909\u63DB\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u8A2D\u5B9A\u306B\u8A72\u5F53\u3057\u306A\u3044\u5834\u5408\u306F\u539F\u6587\u3092\u305D\u306E\u307E\u307E\u8FD4\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u8AAC\u660E\u3084\u5F15\u7528\u7B26\u306F\u4ED8\u3051\u305A\u672C\u6587\u3060\u3051\u3092\u8FD4\u3057\u3066\u304F\u3060\u3055\u3044\u3002URL\u3001\u30E1\u30F3\u30B7\u30E7\u30F3\u3001\u56FA\u6709\u540D\u8A5E\u3001\u30B3\u30FC\u30C9\u3001\u6570\u5024\u306F\u4E0D\u8981\u306B\u6539\u5909\u3057\u306A\u3044\u3067\u304F\u3060\u3055\u3044\u3002
\u500B\u4EBA\u8A2D\u5B9A:
${String(settings.instruction || "").slice(0, 3e3)}

\u3053\u306E\u30C1\u30E3\u30C3\u30C8\u3067\u78BA\u8A8D\u3067\u304D\u308B\u904B\u55B6\u533A\u5206:
${operatorContext(room, profiles)}`,
        user: `\u8868\u793A\u5BFE\u8C61\u30E1\u30C3\u30BB\u30FC\u30B8:
${raw.slice(0, 12e3)}

\u9001\u4FE1\u8005: ${message.authorName || message.authorEmail}
\u8A08\u6E2C: \u6587\u5B57\u6570=${[...raw].length}\u3001UTF-8\u30D0\u30A4\u30C8\u6570=${Buffer.byteLength(raw, "utf8")}`
      });
      const displayText = result.ok && result.text ? result.text.slice(0, 12e3) : raw;
      if (result.ok) await setJSON(STORE_NAMES.MESSAGE_FILTER_CACHE, cacheKey, { displayText, createdAt: (/* @__PURE__ */ new Date()).toISOString(), model: result.model });
      return { ...base, text: displayText, transformed: result.ok && displayText !== raw, originalAvailable: result.ok && displayText !== raw };
    }
    async function transformMessagesForViewer(messages, viewerEmail, room, profiles, settings, isAdmin) {
      const result = [];
      for (const message of messages) result.push(await transformForViewer(message, viewerEmail, room, profiles, settings, isAdmin));
      return result;
    }
    function permissionsFor(room, email, isAdmin = false) {
      const isHost = room.hostEmail === email;
      const isSubHost = room.subHosts.includes(email);
      const perms = {
        kick: isHost || isSubHost,
        manageRoles: isHost || isSubHost,
        manageBots: isHost || isSubHost,
        canWrite: true
        // デフォルトは自由に発言可能
      };
      for (const role of room.customRoles) {
        if (!role.members.includes(email)) continue;
        if (role.permissions.kick) perms.kick = true;
        if (role.permissions.manageRoles) perms.manageRoles = true;
        if (role.permissions.manageBots) perms.manageBots = true;
        if (role.permissions.restrictWrite) perms.canWrite = false;
      }
      if (isHost || isAdmin) {
        perms.canWrite = true;
        perms.kick = true;
        perms.manageRoles = true;
        perms.manageBots = true;
      }
      return { isHost, isSubHost, isAdmin, canViewDeleted: isAdmin, ...perms };
    }
    function roomSummaryFor(room, viewerEmail) {
      const nickname = room.nicknames[viewerEmail];
      const mainMsgs = room.messages.filter((message) => !message.threadId);
      const lastMsg = mainMsgs.length ? mainMsgs[mainMsgs.length - 1] : null;
      return {
        id: room.id,
        type: room.type,
        title: room.title,
        myNickname: nickname || null,
        memberCount: room.memberEmails.length,
        memberEmails: room.memberEmails,
        lastMessage: lastMsg ? { text: lastMsg.text, authorName: lastMsg.authorName, createdAt: lastMsg.createdAt } : null,
        unreadCount: room.messages.filter((message) => !message.threadId && message.authorEmail !== viewerEmail && !(message.readBy || []).includes(viewerEmail)).length,
        pinned: Array.isArray(room.pinnedBy) && room.pinnedBy.includes(viewerEmail),
        createdAt: room.createdAt
      };
    }
    exports.handler = async (event) => {
      connectLambda2(event);
      try {
        return await handle(event);
      } catch (err) {
        console.error("pocket function error:", err);
        return json(500, { error: `\u5185\u90E8\u30A8\u30E9\u30FC: ${err.message}` });
      }
    };
    async function handle(event) {
      const method = event.httpMethod;
      const qs = event.queryStringParameters || {};
      if (method !== "GET" && method !== "POST") {
        return json(405, { error: "\u672A\u5BFE\u5FDC\u306E\u30E1\u30BD\u30C3\u30C9\u3067\u3059" });
      }
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
      const isAdmin = Boolean(await requireAdmin(token));
      const isOfficial = Boolean((await getAccountProfile(email))?.isOfficial);
      if (method === "GET") {
        if (qs.roomId) {
          const room = await getRoom(qs.roomId);
          if (!room || !room.memberEmails.includes(email)) {
            return json(404, { error: "\u30EB\u30FC\u30E0\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
          }
          const perms = permissionsFor(room, email, isAdmin);
          const visibleMessages = room.messages.filter((m) => !m.deleted || isAdmin);
          const limit = Math.max(20, Math.min(100, Number(qs.limit) || 60));
          const mainMessages = visibleMessages.filter((m) => !m.threadId);
          const beforeIndex = qs.before ? mainMessages.findIndex((message) => message.id === qs.before) : mainMessages.length;
          const end = beforeIndex >= 0 ? beforeIndex : mainMessages.length;
          const start = Math.max(0, end - limit);
          const pickedIds = new Set(mainMessages.slice(start, end).map((m) => m.id));
          if (!qs.before) {
            const parentIds = new Set((room.threads || []).map((t) => t.parentMessageId));
            for (const m of visibleMessages) if (m.threadId || parentIds.has(m.id)) pickedIds.add(m.id);
          }
          const pageMessages = visibleMessages.filter((m) => pickedIds.has(m.id));
          const profiles = {};
          for (const memberEmail of room.memberEmails) profiles[memberEmail] = await getAccountProfile(memberEmail);
          for (const message of pageMessages) {
            if (!profiles[message.authorEmail]) profiles[message.authorEmail] = await getAccountProfile(message.authorEmail);
          }
          const settings = await getMinefieldSettings(email);
          const displayMessages = await transformMessagesForViewer(pageMessages, email, room, profiles, settings, isAdmin);
          const messages = displayMessages.map((m) => ({
            ...m,
            authorName: room.nicknames[m.authorEmail] || m.authorName,
            authorProfile: profiles[m.authorEmail]
          }));
          return json(200, {
            room: {
              id: room.id,
              type: room.type,
              title: room.title,
              memberEmails: room.memberEmails,
              hostEmail: room.hostEmail,
              subHosts: room.subHosts,
              customRoles: room.customRoles,
              nicknames: room.nicknames,
              bots: room.bots,
              threads: room.threads,
              profiles,
              messages,
              hasMoreMessages: start > 0,
              typing: Object.fromEntries(Object.entries(room.typing).filter(([, at]) => Number(at) > Date.now() - 7e3))
            },
            myPermissions: perms
          });
        }
        const keys = await listKeys(STORE_NAMES.POCKET_ROOMS);
        const rooms = [];
        for (const key of keys) {
          const r = await getRoom(key);
          if (r && r.memberEmails.includes(email)) {
            rooms.push(roomSummaryFor(r, email));
          }
        }
        rooms.sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          const at = a.lastMessage ? a.lastMessage.createdAt : a.createdAt;
          const bt = b.lastMessage ? b.lastMessage.createdAt : b.createdAt;
          return new Date(bt) - new Date(at);
        });
        return json(200, { rooms });
      }
      const { action } = payload;
      if (action === "getMinefieldSettings") {
        return json(200, { settings: await getMinefieldSettings(email) });
      }
      if (action === "saveMinefieldSettings") {
        const instruction = String(payload.instruction || "").trim().slice(0, 4e3);
        const current = await getMinefieldSettings(email);
        const settings = { email, enabled: payload.enabled === true, instruction, version: Number(current.version || 1) + 1, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
        await setJSON(STORE_NAMES.MESSAGE_FILTER_SETTINGS, `user:${email}`, settings);
        return json(200, { settings });
      }
      if (action === "getOriginalMessage") {
        const room = await getRoom(payload.roomId);
        if (!room || !room.memberEmails.includes(email)) return json(404, { error: "\u30EB\u30FC\u30E0\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        const message = room.messages.find((item) => item.id === String(payload.messageId));
        if (!message || message.deleted) return json(404, { error: "\u30E1\u30C3\u30BB\u30FC\u30B8\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        const text = String(message.text || "");
        return json(200, { messageId: message.id, text, textChars: [...text].length, textBytes: Buffer.byteLength(text, "utf8") });
      }
      if (action === "urlPreview") {
        let target;
        try {
          target = new URL(String(payload.url || ""));
        } catch (_) {
          return json(400, { error: "URL\u304C\u4E0D\u6B63\u3067\u3059" });
        }
        if (!/^https?:$/.test(target.protocol) || /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.)/i.test(target.hostname)) return json(400, { error: "\u3053\u306EURL\u306F\u30D7\u30EC\u30D3\u30E5\u30FC\u3067\u304D\u307E\u305B\u3093" });
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5e3);
        try {
          const response = await fetch(target.href, { headers: { "User-Agent": "MixAll-LinkPreview/1.0" }, signal: controller.signal });
          const html = (await response.text()).slice(0, 5e5);
          const meta = (key) => {
            const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${key}["']`, "i");
            const m = html.match(re);
            return String(m?.[1] || m?.[2] || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').trim();
          };
          const title = meta("og:title") || (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/<[^>]+>/g, "").trim();
          return json(200, { title: title.slice(0, 160), description: meta("og:description").slice(0, 300), image: meta("og:image").slice(0, 1e3), siteName: meta("og:site_name").slice(0, 100) });
        } catch (error) {
          return json(200, { title: target.hostname, description: "", image: "", siteName: target.hostname });
        } finally {
          clearTimeout(timer);
        }
      }
      const FRIEND_STORE = "pocket-friends";
      const friendsOf = async (em) => { const r = await getJSON(FRIEND_STORE, "list:" + em); return Array.isArray(r && r.emails) ? r.emails : []; };
      const addFriendPair = async (a, b) => {
        for (const [x, y] of [[a, b], [b, a]]) {
          const list = await friendsOf(x);
          if (!list.includes(y)) { list.push(y); await setJSON(FRIEND_STORE, "list:" + x, { emails: list }); }
        }
      };
      const friendCodeOf = async (em) => {
        let rec = await getJSON(FRIEND_STORE, "code:" + em);
        if (!rec || !rec.code) {
          rec = { code: crypto.randomBytes(12).toString("hex") };
          await setJSON(FRIEND_STORE, "code:" + em, rec);
          await setJSON(FRIEND_STORE, "byCode:" + rec.code, { email: em });
        }
        return rec.code;
      };
      if (action === "getFriendLink") return json(200, { code: await friendCodeOf(email) });
      if (action === "listFriends") {
        const friends = [];
        for (const em of await friendsOf(email)) {
          const profile = await getAccountProfile(em);
          if (profile && await getJSON(STORE_NAMES.ACCOUNTS, em)) friends.push({ email: em, profile });
        }
        return json(200, { friends });
      }
      if (action === "addFriendByCode") {
        const rec = await getJSON(FRIEND_STORE, "byCode:" + String(payload.code || "").slice(0, 80));
        if (!rec || !rec.email) return json(404, { error: "友達追加URLが無効です" });
        if (rec.email === email) return json(400, { error: "自分自身は友達追加できません" });
        if (!await getJSON(STORE_NAMES.ACCOUNTS, rec.email)) return json(404, { error: "相手のアカウントが見つかりません" });
        await addFriendPair(email, rec.email);
        return json(200, { ok: true, friend: { email: rec.email, profile: await getAccountProfile(rec.email) } });
      }
      if (action === "addFriendFromRoom") {
        const room = await getRoom(payload.roomId);
        const target = normalizeEmail(payload.targetEmail);
        if (!room || !room.memberEmails.includes(email) || !room.memberEmails.includes(target)) return json(404, { error: "同じルームのメンバーではありません" });
        if (target === email) return json(400, { error: "自分自身は友達追加できません" });
        await addFriendPair(email, target);
        return json(200, { ok: true });
      }
      if (action === "markRead") {
        const room = await getRoom(payload.roomId);
        if (!room || !room.memberEmails.includes(email)) return json(404, { error: "\u30EB\u30FC\u30E0\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        const ids = new Set(Array.isArray(payload.messageIds) ? payload.messageIds.map(String) : []);
        const upTo = payload.upToMessageId ? room.messages.findIndex((message) => message.id === payload.upToMessageId) : room.messages.length - 1;
        room.messages.forEach((message, index) => {
          if ((ids.size ? ids.has(message.id) : index <= upTo) && !(message.readBy || []).includes(email)) { message.readBy = message.readBy || []; message.readBy.push(email); message.readAt = message.readAt || {}; message.readAt[email] = (/* @__PURE__ */ new Date()).toISOString(); }
        });
        await setJSON(STORE_NAMES.POCKET_ROOMS, room.id, room);
        return json(200, { ok: true });
      }
      if (action === "setTyping") {
        const room = await getRoom(payload.roomId);
        if (!room || !room.memberEmails.includes(email)) return json(404, { error: "\u30EB\u30FC\u30E0\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        if (payload.active) room.typing[email] = Date.now();
        else delete room.typing[email];
        await setJSON(STORE_NAMES.POCKET_ROOMS, room.id, room);
        return json(200, { ok: true });
      }
      if (action === "createRoom") {
        const type = payload.type === "group" ? "group" : "dm";
        const memberEmails = Array.from(
          /* @__PURE__ */ new Set([email, ...Array.isArray(payload.memberEmails) ? payload.memberEmails.map(normalizeEmail) : []])
        ).filter(Boolean);
        if (type === "dm" && memberEmails.length !== 2) {
          return json(400, { error: "\u500B\u4EBA\u30C1\u30E3\u30C3\u30C8\u306F\u76F8\u624B\u30921\u4EBA\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044" });
        }
        if (memberEmails.length < 2) {
          return json(400, { error: "\u30E1\u30F3\u30D0\u30FC\u304C\u4E0D\u8DB3\u3057\u3066\u3044\u307E\u3059" });
        }
        if (!isAdmin) {
          const myFriends = await friendsOf(email);
          for (const m of memberEmails) {
            if (m !== email && !myFriends.includes(m)) return json(403, { error: `${m} は友達ではありません。友達追加URLを開いてもらうか、メンバー画面から友達追加してください` });
          }
        }
        for (const m of memberEmails) {
          if (m === email) continue;
          const acc = await getJSON(STORE_NAMES.ACCOUNTS, m);
          if (!acc) return json(404, { error: `${m} \u306F\u5B58\u5728\u3057\u306A\u3044\u30A2\u30AB\u30A6\u30F3\u30C8\u3067\u3059` });
        }
        const id = newId();
        const room = {
          id,
          type,
          title: type === "group" ? payload.title || "\u30B0\u30EB\u30FC\u30D7" : null,
          memberEmails,
          hostEmail: email,
          subHosts: [],
          customRoles: [],
          nicknames: {},
          bots: [],
          threads: [],
          messages: [],
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        await setJSON(STORE_NAMES.POCKET_ROOMS, id, room);
        return json(201, { room: roomSummaryFor(room, email) });
      }
      if (action === "createThread") {
        const room = await getRoom(payload.roomId);
        if (!room || !room.memberEmails.includes(email)) return json(404, { error: "\u30EB\u30FC\u30E0\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        const parent = room.messages.find((item) => item.id === payload.parentMessageId && !item.deleted);
        if (!parent) return json(404, { error: "\u89AA\u30E1\u30C3\u30BB\u30FC\u30B8\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        const existing = room.threads.find((item) => item.parentMessageId === parent.id);
        if (existing) return json(200, { thread: existing });
        const thread = { id: newId(), roomId: room.id, parentMessageId: parent.id, title: String(payload.title || "\u30B9\u30EC\u30C3\u30C9").trim().slice(0, 80) || "\u30B9\u30EC\u30C3\u30C9", createdBy: email, createdAt: (/* @__PURE__ */ new Date()).toISOString() };
        room.threads.push(thread);
        await setJSON(STORE_NAMES.POCKET_ROOMS, room.id, room);
        return json(201, { thread });
      }
      if (action === "sendMessage") {
        const room = await getRoom(payload.roomId);
        if (!room || !room.memberEmails.includes(email)) return json(404, { error: "\u30EB\u30FC\u30E0\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        const perms = permissionsFor(room, email, isAdmin);
        if (!perms.canWrite) return json(403, { error: "\u3053\u306E\u30EB\u30FC\u30E0\u3067\u306F\u767A\u8A00\u304C\u5236\u9650\u3055\u308C\u3066\u3044\u307E\u3059" });
        const text = (payload.text || "").trim();
        const threadId = payload.threadId ? String(payload.threadId).slice(0, 80) : null;
        if (threadId && !room.threads.some((item) => item.id === threadId)) return json(404, { error: "\u30B9\u30EC\u30C3\u30C9\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        let attachment = null;
        if (payload.poll) {
          if (room.type !== "group") return json(400, { error: "\u6295\u7968\u306F\u30B0\u30EB\u30FC\u30D7\u30C1\u30E3\u30C3\u30C8\u3067\u306E\u307F\u4F5C\u6210\u3067\u304D\u307E\u3059" });
          const question = String(payload.poll.question || "").trim().slice(0, 240);
          const options = Array.from(new Set((Array.isArray(payload.poll.options) ? payload.poll.options : []).map((item) => String(item).trim().slice(0, 80)).filter(Boolean))).slice(0, 10);
          if (!question || options.length < 2) return json(400, { error: "\u6295\u7968\u306E\u8CEA\u554F\u30682\u3064\u4EE5\u4E0A\u306E\u9078\u629E\u80A2\u304C\u5FC5\u8981\u3067\u3059" });
          attachment = { isPoll: true, question, options: options.map((label, index) => ({ id: String(index), label, voters: [] })), multiple: Boolean(payload.poll.multiple) };
        } else if (payload.location && Number.isFinite(Number(payload.location.lat)) && Number.isFinite(Number(payload.location.lng))) {
          const lat = Number(payload.location.lat);
          const lng = Number(payload.location.lng);
          if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return json(400, { error: "\u4F4D\u7F6E\u60C5\u5831\u304C\u4E0D\u6B63\u3067\u3059" });
          const locKind = payload.location.kind === "destination" ? "destination" : "current";
          attachment = { isLocation: true, kind: locKind, lat, lng, label: String(payload.location.label || (locKind === "destination" ? "\u76EE\u7684\u5730" : "\u73FE\u5728\u5730")).slice(0, 120) };
        } else if (payload.attachment && payload.attachment.shortUrl && /^image\//i.test(String(payload.attachment.type || ""))) {
          const shortUrl = String(payload.attachment.shortUrl).trim();
          if (!/^https:\/\/x\.gd\/[A-Za-z0-9_]+$/.test(shortUrl)) return json(400, { error: "\u753B\u50CF\u306E\u77ED\u7E2EURL\u304C\u4E0D\u6B63\u3067\u3059" });
          attachment = {
            name: String(payload.attachment.name || "image").slice(0, 160),
            type: String(payload.attachment.type).slice(0, 120),
            sizeBytes: Number(payload.attachment.sizeBytes) || 0,
            mediaHash: /^[a-f0-9]{64}$/i.test(String(payload.attachment.mediaHash || "")) ? String(payload.attachment.mediaHash).toLowerCase() : null,
            shortUrl
          };
        } else if (payload.attachment && payload.attachment.fileId) {
          if (payload.attachment.isStamp) {
            const stampKeys = await listKeys(STORE_NAMES.STAMPS);
            let stamp = null;
            for (const key of stampKeys) {
              const candidate = await getJSON(STORE_NAMES.STAMPS, key);
              if (candidate && candidate.fileId === payload.attachment.fileId) {
                stamp = candidate;
                break;
              }
            }
            if (!stamp) return json(404, { error: "\u30B9\u30BF\u30F3\u30D7\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
            const price = Math.max(0, Number(stamp.priceCoins) || 0);
            const owner = await getJSON(STORE_NAMES.STAMP_OWNERS, `${email}:${stamp.id}`);
            if (price > 0 && !owner && !isAdmin && !isOfficial) return json(402, { error: "\u3053\u306E\u6709\u6599\u30B9\u30BF\u30F3\u30D7\u306F\u8CFC\u5165\u5F8C\u306B\u9001\u4FE1\u3067\u304D\u307E\u3059" });
          } else {
            const manifest = await getJSON(STORE_NAMES.FILE_MANIFESTS, `${String(payload.attachment.fileId).trim()}:manifest`);
            if (!manifest?.finalized) return json(400, { error: "\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB\u306E\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9\u304C\u5B8C\u4E86\u3057\u3066\u3044\u307E\u305B\u3093" });
            if (manifest.ownerEmail !== email) return json(403, { error: "\u3053\u306E\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB\u3092\u6295\u7A3F\u3059\u308B\u6A29\u9650\u304C\u3042\u308A\u307E\u305B\u3093" });
          }
          attachment = {
            fileId: String(payload.attachment.fileId).slice(0, 80),
            name: String(payload.attachment.name || "file").slice(0, 160),
            type: String(payload.attachment.type || "application/octet-stream").slice(0, 120),
            sizeBytes: Number(payload.attachment.sizeBytes) || 0,
            isStamp: payload.attachment.isStamp === true,
            isVoiceMessage: payload.attachment.isVoiceMessage === true,
            durationMs: Math.max(0, Math.min(36e5, Number(payload.attachment.durationMs) || 0)),
            // スタンプは軽量サムネイルを即時表示に使い、裏で高画質版に差し替える
            thumbnailDataUrl: payload.attachment.isStamp && typeof payload.attachment.thumbnailDataUrl === "string" ? payload.attachment.thumbnailDataUrl.slice(0, 13e4) : null
          };
          if (!attachment.isStamp && /^image\//i.test(attachment.type)) {
            try {
              attachment = await dedupeImageAttachment(event, attachment, email);
            } catch (error) {
              console.warn("Pocket image dedupe skipped; keeping Blob attachment:", error.message);
            }
          }
        }
        if (!text && !attachment) return json(400, { error: "\u672C\u6587\u304B\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB\u306E\u3069\u3061\u3089\u304B\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044" });
        const replyTo = payload.replyTo ? String(payload.replyTo).slice(0, 80) : null;
        const clientChars = Number(payload.textChars);
        const clientBytes = Number(payload.textBytes);
        const textChars = [...text].length;
        const textBytes = Buffer.byteLength(text, "utf8");
        { const dupMsg = payload.clientId && room.messages.find((item) => item.id === payload.clientId && item.authorEmail === email); if (dupMsg) return json(200, { ok: true, message: dupMsg, duplicate: true }); } /* 再送しても二重に投稿されない */
        const clientMsgId = /^[A-Za-z0-9_-]{10,40}$/.test(String(payload.clientId || "")) && !room.messages.some((item) => item.id === payload.clientId) ? String(payload.clientId) : null; /* WebRTCで先に届けた同じメッセージとして履歴に残す */
        const message = { id: clientMsgId || newId(), authorEmail: email, authorName: room.nicknames[email] || payload.displayName || email, text, textChars, textBytes, clientTextChars: Number.isFinite(clientChars) ? clientChars : null, clientTextBytes: Number.isFinite(clientBytes) ? clientBytes : null, metricsMismatch: Number.isFinite(clientChars) && clientChars !== textChars || Number.isFinite(clientBytes) && clientBytes !== textBytes, attachment, replyTo, threadId: threadId || (replyTo ? replyTo : null), readBy: [email], createdAt: (/* @__PURE__ */ new Date()).toISOString() };
        { const freshRoom = await getRoom(payload.roomId); if (freshRoom) Object.assign(room, freshRoom); }
        room.messages.push(message);
        const mentionList = [];
        for (const item of Array.isArray(payload.mentions) ? payload.mentions.slice(0, 20) : []) {
          const target = normalizeEmail(item && item.email);
          const name = String(item && item.name || "").slice(0, 60);
          if (!target || !name || target === email || !room.memberEmails.includes(target) || !text.includes("@" + name)) continue;
          if (!mentionList.some((x) => x.email === target)) mentionList.push({ email: target, name });
        }
        if (mentionList.length) message.mentions = mentionList;
        const mentionedEmails = Array.from(new Set([...mentionList.map((x) => x.email), ...(text.match(/@[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []).map((value) => value.slice(1).toLowerCase())]));
        const replyTarget = replyTo ? room.messages.find((item) => item.id === replyTo) : null;
        await setJSON(STORE_NAMES.POCKET_ROOMS, payload.roomId, room);
        await notifyRecipients(room.memberEmails, threadId ? `pocket:${room.id}:thread:${threadId}` : `pocket:${room.id}`, { type: "pocketMessage", scope: threadId ? `pocket:${room.id}:thread:${threadId}` : `pocket:${room.id}`, roomId: room.id, messageId: message.id, actorEmail: email, title: room.title || "Pocket", body: text || "\u6DFB\u4ED8\u30E1\u30C3\u30BB\u30FC\u30B8", isReply: Boolean(replyTarget), replyToEmail: replyTarget?.authorEmail || null, isMessage: true, mentionedEmails, url: threadId ? `/Pocket/thread.html?id=${encodeURIComponent(room.id)}&thread=${encodeURIComponent(threadId)}` : `/Pocket/room.html?id=${encodeURIComponent(room.id)}` });
        let botPending = false;
        if (room.bots.some((bot) => bot.enabled !== false) || await hasOfficialAutomations("pocket")) {
          const task = { roomId: room.id, messageId: message.id };
          try {
            await enqueueBackgroundTask(event, "pocket-bots", task);
            botPending = true;
          } catch (dispatchError) {
            console.error("Pocket bot Background Function dispatch failed; using inline fallback:", dispatchError);
            try {
              await processPocketBotTask(task, crypto.randomBytes(24).toString("hex"));
            } catch (fallbackError) {
              console.error("Pocket bot fallback failed:", fallbackError);
            }
          }
        }
        return json(200, { ok: true, botPending });
      }
      if (action === "votePoll") {
        const room = await getRoom(payload.roomId);
        if (!room || !room.memberEmails.includes(email)) return json(404, { error: "\u30EB\u30FC\u30E0\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        const message = room.messages.find((item) => item.id === payload.messageId && item.attachment?.isPoll);
        if (!message) return json(404, { error: "\u6295\u7968\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        const selected = new Set((Array.isArray(payload.optionIds) ? payload.optionIds : [payload.optionId]).map(String));
        message.attachment.options.forEach((option) => {
          option.voters = (option.voters || []).filter((voter) => voter !== email);
          if (selected.has(option.id)) option.voters.push(email);
        });
        await setJSON(STORE_NAMES.POCKET_ROOMS, room.id, room);
        return json(200, { ok: true, poll: message.attachment });
      }
      if (["listNotes", "saveNote", "deleteNote", "shareNote", "listAlbums", "createAlbum", "addAlbumImages", "deleteAlbum"].includes(action)) {
        const room = await getRoom(payload.roomId);
        if (!room || !room.memberEmails.includes(email)) return json(404, { error: "\u30EB\u30FC\u30E0\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        room.notes = Array.isArray(room.notes) ? room.notes : [];
        room.albums = Array.isArray(room.albums) ? room.albums : [];
        if (action === "listNotes") return json(200, { notes: room.notes });
        if (action === "shareNote") {
          const note2 = room.notes.find((n) => n.id === payload.noteId);
          if (!note2) return json(404, { error: "\u30CE\u30FC\u30C8\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
          const message = { id: crypto.randomBytes(8).toString("hex"), authorEmail: email, authorName: room.nicknames[email] || email, text: "", attachment: { isNote: true, noteId: note2.id, label: "\u30CE\u30FC\u30C8" }, readBy: [email], createdAt: (/* @__PURE__ */ new Date()).toISOString() };
          room.messages.push(message);
          await setJSON(STORE_NAMES.POCKET_ROOMS, room.id, room);
          return json(200, { message });
        }
        if (action === "listAlbums") return json(200, { albums: room.albums });
        if (action === "deleteAlbum") {
          room.albums = room.albums.filter((a) => a.id !== payload.albumId);
          await setJSON(STORE_NAMES.POCKET_ROOMS, room.id, room);
          return json(200, { albums: room.albums });
        }
        if (action === "createAlbum") {
          const result2 = await normalizePocketMedia(payload.images, email, 100);
          if (result2.error) return json(result2.status, { error: result2.error });
          if (!result2.items.length) return json(400, { error: "\u753B\u50CF\u30921\u679A\u4EE5\u4E0A\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044" });
          const album = { id: crypto.randomBytes(8).toString("hex"), title: String(payload.title || "\u30A2\u30EB\u30D0\u30E0").slice(0, 120), images: result2.items.map((x) => ({ ...x, id: crypto.randomBytes(6).toString("hex"), createdAt: (/* @__PURE__ */ new Date()).toISOString() })), authorEmail: email, createdAt: (/* @__PURE__ */ new Date()).toISOString(), updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
          room.albums.unshift(album);
          await setJSON(STORE_NAMES.POCKET_ROOMS, room.id, room);
          return json(200, { album, albums: room.albums });
        }
        if (action === "addAlbumImages") {
          const album = room.albums.find((a) => a.id === payload.albumId);
          if (!album) return json(404, { error: "\u30A2\u30EB\u30D0\u30E0\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
          const result2 = await normalizePocketMedia(payload.images, email, 100);
          if (result2.error) return json(result2.status, { error: result2.error });
          if (!result2.items.length) return json(400, { error: "\u753B\u50CF\u30921\u679A\u4EE5\u4E0A\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044" });
          album.images = [...album.images || [], ...result2.items.map((x) => ({ ...x, id: crypto.randomBytes(6).toString("hex"), createdAt: (/* @__PURE__ */ new Date()).toISOString() }))].slice(-200);
          album.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
          await setJSON(STORE_NAMES.POCKET_ROOMS, room.id, room);
          return json(200, { album, albums: room.albums });
        }
        if (action === "deleteNote") {
          room.notes = room.notes.filter((n) => n.id !== payload.noteId);
          await setJSON(STORE_NAMES.POCKET_ROOMS, room.id, room);
          return json(200, { notes: room.notes });
        }
        const result = await normalizePocketMedia(payload.media, email, 20);
        if (result.error) return json(result.status, { error: result.error });
        const note = { id: crypto.randomBytes(8).toString("hex"), title: String(payload.title || "").slice(0, 120), body: String(payload.body || "").slice(0, 1e4), media: result.items, authorEmail: email, createdAt: (/* @__PURE__ */ new Date()).toISOString(), updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
        if (!note.title && !note.body && !note.media.length) return json(400, { error: "\u6295\u7A3F\u5185\u5BB9\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044" });
        room.notes.unshift(note);
        await setJSON(STORE_NAMES.POCKET_ROOMS, room.id, room);
        return json(200, { note, notes: room.notes });
      }
      if (action === "search") {
        const room = await getRoom(payload.roomId);
        if (!room || !room.memberEmails.includes(email)) return json(404, { error: "\u30EB\u30FC\u30E0\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        const query = parseSearchQuery(payload.query);
        const messages = room.messages.filter((item) => !item.deleted && (!query.raw || (() => {
          const author = String(item.authorEmail || item.authorName || "").toLowerCase();
          const haystack = `${item.text || ""} ${item.authorName || ""} ${author}`.toLowerCase();
          return query.author.every((x) => author.includes(x)) && query.terms.every((x) => haystack.includes(x));
        })())).slice(-200);
        const participants = room.memberEmails.map((member) => ({ email: member, name: room.nicknames?.[member] || member })).filter((item) => !query.raw || query.author.every((x) => `${item.email} ${item.name}`.toLowerCase().includes(x)) || query.terms.every((x) => `${item.email} ${item.name}`.toLowerCase().includes(x)));
        return json(200, { messages, participants, parsed: query });
      }
      if (action === "saveSearchHistory" || action === "listSearchHistory") {
        const { STORE_NAMES: STORE_NAMES2, getJSON: getJSON2, setJSON: setJSON2 } = require_store();
        const key = `user:${email}`;
        const current = await getJSON2(STORE_NAMES2.SEARCH_HISTORY, key) || { email, items: [] };
        if (action === "saveSearchHistory") {
          const value = String(payload.query || "").trim().slice(0, 240);
          if (value) current.items = [value, ...(current.items || []).filter((x) => x !== value)].slice(0, 30);
          await setJSON2(STORE_NAMES2.SEARCH_HISTORY, key, current);
        }
        return json(200, { items: current.items || [] });
      }
      if (action === "pinRoom" || action === "blockMember") {
        const room = await getRoom(payload.roomId);
        if (!room || !room.memberEmails.includes(email)) return json(404, { error: "\u30EB\u30FC\u30E0\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        if (action === "pinRoom") {
          room.pinnedBy = Array.isArray(room.pinnedBy) ? room.pinnedBy : [];
          if (payload.pinned === false) room.pinnedBy = room.pinnedBy.filter((item) => item !== email);
          else if (!room.pinnedBy.includes(email)) room.pinnedBy.push(email);
        } else {
          const target = String(payload.targetEmail || "").toLowerCase();
          room.blockedBy = room.blockedBy || {};
          room.blockedBy[email] = Array.isArray(room.blockedBy[email]) ? room.blockedBy[email] : [];
          if (payload.blocked === false) room.blockedBy[email] = room.blockedBy[email].filter((item) => item !== target);
          else if (target && !room.blockedBy[email].includes(target)) room.blockedBy[email].push(target);
        }
        await setJSON(STORE_NAMES.POCKET_ROOMS, room.id, room);
        return json(200, { ok: true, room });
      }
      if (action === "exportTxt") {
        const room = await getRoom(payload.roomId);
        if (!room || !room.memberEmails.includes(email)) return json(404, { error: "\u30EB\u30FC\u30E0\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        const text = room.messages.filter((item) => !item.deleted).map((item) => `[${item.createdAt}] ${item.authorName || item.authorEmail}: ${item.text || "[\u6DFB\u4ED8]"}`).join("\n");
        return json(200, { text, filename: `pocket-${room.id}.txt` });
      }
      if (action === "report") {
        const room = await getRoom(payload.roomId);
        if (!room || !room.memberEmails.includes(email)) return json(404, { error: "\u901A\u5831\u5BFE\u8C61\u306E\u30EB\u30FC\u30E0\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        const message = room.messages.find((item) => item.id === payload.messageId && !item.deleted);
        if (!message) return json(404, { error: "\u901A\u5831\u5BFE\u8C61\u306E\u30E1\u30C3\u30BB\u30FC\u30B8\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        const result = await createReport({
          reporterEmail: email,
          targetType: "pocketMessage",
          targetId: `${room.id}:${message.id}`,
          reason: payload.reason,
          detail: payload.detail,
          snapshot: { roomId: room.id, messageId: message.id, authorEmail: message.authorEmail, text: message.text, createdAt: message.createdAt }
        });
        return json(201, { ok: true, duplicate: result.duplicate, reportId: result.report.id });
      }
      if (action === "editMessage") {
        const room = await getRoom(payload.roomId);
        if (!room || !room.memberEmails.includes(email)) return json(404, { error: "\u30EB\u30FC\u30E0\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        const message = room.messages.find((m) => m.id === payload.messageId && !m.deleted);
        if (!message) return json(404, { error: "\u30E1\u30C3\u30BB\u30FC\u30B8\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        if (message.authorEmail !== email && !isAdmin) return json(403, { error: "\u81EA\u5206\u306E\u30E1\u30C3\u30BB\u30FC\u30B8\u306E\u307F\u7DE8\u96C6\u3067\u304D\u307E\u3059" });
        const text = String(payload.text || "").trim().slice(0, 12e3);
        if (!text) return json(400, { error: "\u672C\u6587\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044" });
        if (text === String(message.text || "")) return json(200, { ok: true, message });
        message.editHistory = Array.isArray(message.editHistory) ? message.editHistory : [];
        message.editHistory.push({ text: String(message.text || ""), editedAt: message.editedAt || message.createdAt, editedBy: message.editedBy || message.authorEmail });
        message.editHistory = message.editHistory.slice(-20);
        message.text = text;
        message.editedAt = (/* @__PURE__ */ new Date()).toISOString();
        message.editedBy = email;
        await setJSON(STORE_NAMES.POCKET_ROOMS, payload.roomId, room);
        return json(200, { ok: true, message });
      }
      if (action === "deleteMessage") {
        const room = await getRoom(payload.roomId);
        if (!room || !room.memberEmails.includes(email)) return json(404, { error: "\u30EB\u30FC\u30E0\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        const message = room.messages.find((m) => m.id === payload.messageId);
        if (!message) return json(404, { error: "\u30E1\u30C3\u30BB\u30FC\u30B8\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        if (!isAdmin && message.authorEmail !== email && room.hostEmail !== email) {
          return json(403, { error: "\u3053\u306E\u30E1\u30C3\u30BB\u30FC\u30B8\u3092\u524A\u9664\u3059\u308B\u6A29\u9650\u304C\u3042\u308A\u307E\u305B\u3093" });
        }
        if (!message.deleted) {
          message.deleted = true;
          message.deletedAt = (/* @__PURE__ */ new Date()).toISOString();
          message.deletedBy = email;
          message.deletedText = message.text;
          message.deletedAttachment = message.attachment;
          message.text = "";
          message.attachment = null;
        }
        await setJSON(STORE_NAMES.POCKET_ROOMS, payload.roomId, room);
        return json(200, { ok: true });
      }
      if (action === "setNickname") {
        const room = await getRoom(payload.roomId);
        if (!room || !room.memberEmails.includes(email)) return json(404, { error: "\u30EB\u30FC\u30E0\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        const nickname = (payload.nickname || "").trim();
        if (nickname) {
          room.nicknames[email] = nickname;
        } else {
          delete room.nicknames[email];
        }
        await setJSON(STORE_NAMES.POCKET_ROOMS, payload.roomId, room);
        return json(200, { ok: true, nickname: room.nicknames[email] || null });
      }
      if (action === "renameRoom") {
        const room = await getRoom(payload.roomId);
        if (!room || !room.memberEmails.includes(email)) return json(404, { error: "\u30EB\u30FC\u30E0\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        if (room.hostEmail !== email && !isAdmin) return json(403, { error: "\u30EB\u30FC\u30E0\u540D\u306F\u4E3B\u307E\u305F\u306F\u904B\u55B6\u306E\u307F\u5909\u66F4\u3067\u304D\u307E\u3059" });
        const title = String(payload.title || "").trim().slice(0, 80);
        if (!title) return json(400, { error: "\u30EB\u30FC\u30E0\u540D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044" });
        room.title = title;
        await setJSON(STORE_NAMES.POCKET_ROOMS, payload.roomId, room);
        return json(200, { ok: true, title });
      }
      if (action === "importUchBot") {
        const room = await getRoom(payload.roomId);
        if (!room || !room.memberEmails.includes(email)) return json(404, { error: "\u30EB\u30FC\u30E0\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        const perms = permissionsFor(room, email, isAdmin);
        if (!perms.manageBots) return json(403, { error: "bot\u3092\u7BA1\u7406\u3059\u308B\u6A29\u9650\u304C\u3042\u308A\u307E\u305B\u3093" });
        const sourceThread = await getJSON(STORE_NAMES.UCH_THREADS, payload.sourceThreadId);
        if (!sourceThread || sourceThread.authorEmail !== email && !isAdmin) return json(403, { error: "\u81EA\u5206\u304C\u4E3B\u306EUch\u30B9\u30EC\u30C3\u30C9\u307E\u305F\u306F\u904B\u55B6\u6A29\u9650\u304C\u5FC5\u8981\u3067\u3059" });
        const sourceBots = await getJSON(STORE_NAMES.UCH_BOTS, payload.sourceThreadId) || [];
        const source = sourceBots.find((bot2) => bot2.id === payload.botId || bot2.uchId === payload.botId || "b" + __require("crypto").createHash("sha256").update(`${payload.sourceThreadId}|${bot2.id}`).digest("hex").slice(0, 10) === payload.botId);
        if (!source) return json(404, { error: "Uch bot\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        if (room.bots.some((bot2) => bot2.sourceThreadId === payload.sourceThreadId && bot2.sourceBotId === source.id)) return json(409, { error: "\u305D\u306EUch bot\u306F\u65E2\u306B\u8FFD\u52A0\u3055\u308C\u3066\u3044\u307E\u3059" });
        const bot = { id: newId(), name: source.name, icon: source.icon || (source.triggerType === "ai" ? "AI" : "BOT"), replyMessage: source.replyMessage || source.cannedMessage || source.message || "", enabled: true, sourceThreadId: payload.sourceThreadId, sourceBotId: source.id, sourceTriggerType: source.triggerType || "canned", triggerType: source.triggerType || "canned", model: source.model || DEFAULT_GEMINI_MODEL, instruction: source.instruction || "", createdAt: (/* @__PURE__ */ new Date()).toISOString() };
        room.bots.push(bot);
        await setJSON(STORE_NAMES.POCKET_ROOMS, payload.roomId, room);
        return json(201, { bot });
      }
      if (action === "addBot") {
        const room = await getRoom(payload.roomId);
        if (!room || !room.memberEmails.includes(email)) return json(404, { error: "\u30EB\u30FC\u30E0\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        const perms = permissionsFor(room, email, isAdmin);
        if (!perms.manageBots) return json(403, { error: "bot\u3092\u7BA1\u7406\u3059\u308B\u6A29\u9650\u304C\u3042\u308A\u307E\u305B\u3093" });
        const name = String(payload.name || "").trim().replace(/^@/, "").slice(0, 40);
        const triggerType = ["mention", "every"].includes(payload.triggerType) ? payload.triggerType : "mention";
        const botType = ["ai", "mixbot", "mixall"].includes(payload.botType) ? payload.botType : "canned";
        const replyMessage = String(payload.replyMessage || "").trim().slice(0, 500);
        if (!name || botType === "canned" && !replyMessage) return json(400, { error: "bot\u540D\u3068\u8FD4\u4FE1\u6587\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044" });
        if (room.bots.some((bot2) => bot2.name.toLowerCase() === name.toLowerCase())) return json(409, { error: "\u540C\u3058\u540D\u524D\u306Ebot\u304C\u65E2\u306B\u3042\u308A\u307E\u3059" });
        const bot = { id: newId(), name, icon: String(payload.icon || (botType === "ai" ? "AI" : "BOT")).slice(0, 4), botType, replyMessage, triggerType, model: normalizeGeminiModel(payload.model), instruction: String(payload.instruction || "").slice(0, 2e3), enabled: true, createdAt: (/* @__PURE__ */ new Date()).toISOString() };
        room.bots.push(bot);
        await setJSON(STORE_NAMES.POCKET_ROOMS, payload.roomId, room);
        return json(201, { bot });
      }
      if (action === "removeBot") {
        const room = await getRoom(payload.roomId);
        if (!room || !room.memberEmails.includes(email)) return json(404, { error: "\u30EB\u30FC\u30E0\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        const perms = permissionsFor(room, email, isAdmin);
        if (!perms.manageBots) return json(403, { error: "bot\u3092\u7BA1\u7406\u3059\u308B\u6A29\u9650\u304C\u3042\u308A\u307E\u305B\u3093" });
        const before = room.bots.length;
        room.bots = room.bots.filter((bot) => bot.id !== payload.botId);
        if (room.bots.length === before) return json(404, { error: "bot\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        await setJSON(STORE_NAMES.POCKET_ROOMS, payload.roomId, room);
        return json(200, { ok: true, bots: room.bots });
      }
      if (action === "setSubHost") {
        const room = await getRoom(payload.roomId);
        if (!room) return json(404, { error: "\u30EB\u30FC\u30E0\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        if (room.hostEmail !== email && !isAdmin) return json(403, { error: "\u4E3B(\u30DB\u30B9\u30C8)\u307E\u305F\u306F\u904B\u55B6\u306E\u307F\u64CD\u4F5C\u3067\u304D\u307E\u3059" });
        const target = normalizeEmail(payload.targetEmail);
        if (!room.memberEmails.includes(target)) return json(400, { error: "\u30E1\u30F3\u30D0\u30FC\u3067\u306F\u3042\u308A\u307E\u305B\u3093" });
        if (payload.appoint) {
          if (!room.subHosts.includes(target)) room.subHosts.push(target);
        } else {
          room.subHosts = room.subHosts.filter((e) => e !== target);
        }
        await setJSON(STORE_NAMES.POCKET_ROOMS, payload.roomId, room);
        return json(200, { subHosts: room.subHosts });
      }
      if (action === "createRole") {
        const room = await getRoom(payload.roomId);
        if (!room || !room.memberEmails.includes(email)) return json(404, { error: "\u30EB\u30FC\u30E0\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        const perms = permissionsFor(room, email, isAdmin);
        if (!perms.manageRoles) return json(403, { error: "\u30ED\u30FC\u30EB\u3092\u7BA1\u7406\u3059\u308B\u6A29\u9650\u304C\u3042\u308A\u307E\u305B\u3093" });
        const role = {
          id: newId(),
          name: payload.name || "\u30ED\u30FC\u30EB",
          color: payload.color || "#5b8cff",
          permissions: {
            kick: !!payload.permKick,
            manageRoles: !!payload.permManageRoles,
            manageBots: !!payload.permManageBots,
            restrictWrite: !!payload.permRestrictWrite
          },
          members: []
        };
        room.customRoles.push(role);
        await setJSON(STORE_NAMES.POCKET_ROOMS, payload.roomId, room);
        return json(201, { role });
      }
      if (action === "assignRole") {
        const room = await getRoom(payload.roomId);
        if (!room || !room.memberEmails.includes(email)) return json(404, { error: "\u30EB\u30FC\u30E0\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        const perms = permissionsFor(room, email, isAdmin);
        if (!perms.manageRoles) return json(403, { error: "\u30ED\u30FC\u30EB\u3092\u7BA1\u7406\u3059\u308B\u6A29\u9650\u304C\u3042\u308A\u307E\u305B\u3093" });
        const role = room.customRoles.find((r) => r.id === payload.roleId);
        if (!role) return json(404, { error: "\u30ED\u30FC\u30EB\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        const target = normalizeEmail(payload.targetEmail);
        if (!room.memberEmails.includes(target)) return json(400, { error: "\u30E1\u30F3\u30D0\u30FC\u3067\u306F\u3042\u308A\u307E\u305B\u3093" });
        if (payload.assign) {
          if (!role.members.includes(target)) role.members.push(target);
        } else {
          role.members = role.members.filter((e) => e !== target);
        }
        await setJSON(STORE_NAMES.POCKET_ROOMS, payload.roomId, room);
        return json(200, { role });
      }
      if (action === "kickMember") {
        const room = await getRoom(payload.roomId);
        if (!room || !room.memberEmails.includes(email)) return json(404, { error: "\u30EB\u30FC\u30E0\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        const perms = permissionsFor(room, email, isAdmin);
        if (!perms.kick) return json(403, { error: "\u30AD\u30C3\u30AF\u3059\u308B\u6A29\u9650\u304C\u3042\u308A\u307E\u305B\u3093" });
        const target = normalizeEmail(payload.targetEmail);
        if (target === room.hostEmail && !isAdmin) return json(400, { error: "\u4E3B(\u30DB\u30B9\u30C8)\u306F\u30AD\u30C3\u30AF\u3067\u304D\u307E\u305B\u3093" });
        room.memberEmails = room.memberEmails.filter((e) => e !== target);
        room.subHosts = room.subHosts.filter((e) => e !== target);
        room.customRoles.forEach((r) => {
          r.members = r.members.filter((e) => e !== target);
        });
        await setJSON(STORE_NAMES.POCKET_ROOMS, payload.roomId, room);
        return json(200, { ok: true });
      }
      if (action === "inviteMember") {
        const room = await getRoom(payload.roomId);
        if (!room || !room.memberEmails.includes(email)) return json(404, { error: "\u30EB\u30FC\u30E0\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" });
        if (room.type !== "group") return json(400, { error: "\u500B\u4EBA\u30C1\u30E3\u30C3\u30C8\u306B\u306F\u62DB\u5F85\u3067\u304D\u307E\u305B\u3093" });
        const perms = permissionsFor(room, email, isAdmin);
        if (!perms.manageRoles) return json(403, { error: "\u62DB\u5F85\u3059\u308B\u6A29\u9650\u304C\u3042\u308A\u307E\u305B\u3093" });
        const target = normalizeEmail(payload.targetEmail);
        const acc = await getJSON(STORE_NAMES.ACCOUNTS, target);
        if (!acc) return json(404, { error: `${target} \u306F\u5B58\u5728\u3057\u306A\u3044\u30A2\u30AB\u30A6\u30F3\u30C8\u3067\u3059` });
        if (!isAdmin && !(await friendsOf(email)).includes(target)) return json(403, { error: "友達追加していない相手は招待できません" });
        if (!room.memberEmails.includes(target)) room.memberEmails.push(target);
        await setJSON(STORE_NAMES.POCKET_ROOMS, payload.roomId, room);
        return json(200, { memberEmails: room.memberEmails });
      }
      return json(400, { error: "\u4E0D\u660E\u306Aaction\u3067\u3059" });
    }
  }
});

// entries/pocket-f42a4.mjs
var import_pocket = __toESM(require_pocket(), 1);

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

// entries/pocket-f42a4.mjs
var handler = import_pocket.default.handler || import_pocket.default.default && import_pocket.default.default.handler;
var __onRequest = wrap(handler, {});

export async function onRequest(context) {
  return __onRequest(context);
}
