// server/deno-globals.js
// 旧Netlify(Node)向けコードがDenoでも動くよう、Node互換のグローバルを用意する。
import process from 'node:process';
import { Buffer } from 'node:buffer';
import postgres from 'npm:postgres@3.4.5';

globalThis.process = globalThis.process || process;
globalThis.Buffer = globalThis.Buffer || Buffer;
globalThis.__mixallPostgres = postgres;
