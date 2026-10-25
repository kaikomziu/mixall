# MixAll +（二世代）

掲示板 Uch、チャット「ぽけっと」、SNS Ghost、Mail、ふぉます、コドミル、学校モード、みつばち、Wiki、MAWS、ツールなどをまとめたWebサービスです。
友人が作った EdgeOne Pages + Supabase 版（v27c、`README-EdgeOne.md`）を土台に、**GitHub Pages + Supabase** で動くようにしています。

## 構成

| 部分 | 場所 |
|---|---|
| 画面 | `public/`（EdgeOne版そのまま）＋ `overlay/`（GitHub版だけのファイル）→ `scripts/build-pages.mjs` で `build/` → GitHub Pages（`/mixall/` 配下） |
| API | `cloud/`（EdgeOne版の cloud-functions）を `server/edge-router.js` から呼ぶ Supabase Edge Function **mixall-api** |
| データ | Supabase Postgres `public.kv`（EdgeOne版と同じ形式） |
| 定期実行 | pg_cron → `public.mixall_cron_call2(関数名)`（やることが無いときは呼ばない） |
| 設定値 | `kv` の store=`mixall-config` key=`env`（Edge Function のシークレットが優先）。AgentMail・cron の合言葉・VAPID 鍵など |

### EdgeOne版との違い（ビルドで吸収）
- サイト内パス（`/Pocket/` など）に `/mixall` を付け、`/api/<名前>` を Edge Function のURLにする。実行時にも `js/mixall-base.js` が fetch・リンク・画面移動を補正する
- `edgeone.json` の書き換えルールの代わりに `404.html` が振り分ける（`/Mail/Thread/<id>`、`/ghost/@<id>`、大文字小文字の違いなど）
- サイト名を「MixAll +（二世代）」にそろえ、canonical・robots・keywords などを補う
- 友人のコードに直接書かれていた鍵（Supabase・AgentMail・x.gd・pixiv・VAPID・cron）は `scripts/import-edgeone.mjs` で取り除き、環境変数から読む（このリポジトリは公開）
- 以前の版（端末保存チャット）の本文は、`js/vault-restore.js` が書いた本人の端末から一度だけサーバーへ戻す

## 新しい版を取り込むとき
```
node scripts/import-edgeone.mjs <EdgeOne版ZIPを展開したフォルダ>
npm test
node scripts/build-edge.mjs
npx supabase functions deploy mixall-api --project-ref kifnzvktwbomxthzvvgy --no-verify-jwt --use-api
git push origin main            # GitHub Actions が Pages を公開
```
ローカル確認: `node scripts/build-pages.mjs --api http://localhost:8000/mixall-api` → `node scripts/serve-local.mjs`、API は `deno run -A --env-file=<SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY> supabase/functions/mixall-api/index.js`
