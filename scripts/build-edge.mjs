// scripts/build-edge.mjs
// mixall-api（Supabase Edge Function）のフォルダを組み立てる。
//   node scripts/build-edge.mjs  →  supabase/functions/mixall-api/{index.js, cloud/}
// cloud/ は EdgeOne 版のサーバー（scripts/import-edgeone.mjs で取り込んだもの）をそのまま使う。
import { cpSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'supabase/functions/mixall-api';
mkdirSync(OUT, { recursive: true });
for (const name of readdirSync(OUT)) rmSync(join(OUT, name), { recursive: true, force: true });
cpSync('server/edge-router.js', join(OUT, 'index.js'));
cpSync('server/archive-job.js', join(OUT, 'archive-job.js'));
cpSync('server/vault-restore.js', join(OUT, 'vault-restore.js'));
cpSync('server/plus.js', join(OUT, 'plus.js'));
cpSync('cloud', join(OUT, 'cloud'), { recursive: true });

let bytes = 0;
(function size(dir) { for (const name of readdirSync(dir)) { const full = join(dir, name); const st = statSync(full); if (st.isDirectory()) size(full); else bytes += st.size; } })(OUT);
console.log(`${OUT}: ${(bytes / 1024 / 1024).toFixed(2)} MiB`);
