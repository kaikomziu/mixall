// scripts/build-edge.mjs
// mixall-api（Supabase Edge Function）を1ファイルにバンドルする。
//   node scripts/build-edge.mjs  →  supabase/functions/mixall-api/index.js
import { build } from 'esbuild';
import { mkdirSync, statSync } from 'node:fs';

const outfile = 'supabase/functions/mixall-api/index.js';
mkdirSync('supabase/functions/mixall-api', { recursive: true });

await build({
  entryPoints: ['server/deno-main.js'],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  external: ['npm:*', 'node:*', 'postgres', 'web-push'],
  // Nodeの組み込みモジュールを require するコードのため、Denoで require を用意する
  banner: { js: "import { createRequire as __mixallCreateRequire } from 'node:module'; const require = __mixallCreateRequire(import.meta.url);" },
  logLevel: 'warning'
});

console.log(`${outfile}: ${(statSync(outfile).size / 1024).toFixed(1)} KiB`);
