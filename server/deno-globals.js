// server/deno-globals.js
// 旧Netlify(Node)向けコードがDenoでも動くよう、Node互換のグローバルを用意する。
import nodeProcess from 'node:process';
import { Buffer } from 'node:buffer';
import postgres from 'npm:postgres@3.4.5';
import webpush from 'npm:web-push@3.6.7';

// Supabase Edge Runtime では環境変数の書き換え（Deno.env.set）ができないため、
// process.env を書き換え可能な普通のオブジェクトに差し替える（runtime-config.js が設定を足す）。
const env = { ...nodeProcess.env };
const processShim = new Proxy(nodeProcess, {
  get(target, key) {
    if (key === 'env') return env;
    const value = Reflect.get(target, key);
    return typeof value === 'function' ? value.bind(target) : value;
  }
});
Object.defineProperty(globalThis, 'process', { value: processShim, writable: true, configurable: true });
globalThis.Buffer = globalThis.Buffer || Buffer;
globalThis.__mixallPostgres = postgres;
globalThis.__mixallWebPush = webpush;
