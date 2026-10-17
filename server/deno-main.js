// server/deno-main.js
// Supabase Edge Function（Deno）で mixall-api を起動する入口。scripts/build-edge.mjs がバンドルする。
import './deno-globals.js';
import entry from './entry.js';
import { loadRuntimeConfig } from './runtime-config.js';

Deno.serve(async (request) => {
  await loadRuntimeConfig();
  return entry.handle(request);
});
