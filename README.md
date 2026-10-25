# MixAll +（二世代）

掲示板 Uch、チャット「ぽけっと」、SNS Ghost、Mail、ふぉます、コドミル、学校モード、みつばち、Wiki、MAWS、ツールなどをまとめたWebサービスです。
友人が作った EdgeOne Pages + Supabase 版（v27c、`README-EdgeOne.md`）を土台にしています。2026-10-25 から **EdgeOne Pages（https://mixall-plus.edgeone.dev）+ Supabase** で公開し、GitHub Pages（kaikomziu.github.io/mixall）は移転先へ案内するだけです。

## 構成

| 部分 | 場所 |
|---|---|
| 公開 | `scripts/build-edgeone.mjs` で `edgeone-build/`（画面 `public/` + 関数 `cloud/` → `cloud-functions/`）→ EdgeOne Pages プロジェクト **mixall-plus**。EdgeOne の環境変数は SUPABASE_URL と SUPABASE_SECRET_KEY だけ（ほかは下の設定値を各関数が読む） |
| 旧URL | GitHub Pages `/mixall/` は `scripts/build-redirect.mjs` の案内ページ（端末だけにある以前のチャット本文を戻してから移る・通知だけ受け取るサービスワーカー） |
| 予備のAPI | Supabase Edge Function **mixall-api**（`server/edge-router.js` が `cloud/` を呼ぶ）。旧URLの案内ページが本文を戻すときに使う。`scripts/build-pages.mjs` を使えば GitHub Pages 版にも戻せる |
| データ | Supabase Postgres `public.kv`（EdgeOne版と同じ形式） |
| 定期実行 | pg_cron → `public.mixall_cron_call2(関数名)`（やることが無いときは呼ばない） |
| 設定値 | `kv` の store=`mixall-config` key=`env`（EdgeOne の環境変数・Edge Function のシークレットが優先）。MIXALL_SITE_URL・MIXALL_API_BASE（cron の呼び先）は EdgeOne。AgentMail・cron の合言葉・VAPID 鍵など |
| 古いデータ | 毎日 03:30（日本時間）に **kaikomziu/mixall-data** の GitHub Actions が、1日以上更新されていない行を暗号化して `data/` に移し、GitHub Pages で公開を確かめてから Supabase から消す（`server/archive-job.js`）。サイトは Supabase に無いキーを `MIXALL_DATA_URL` から読む。`MIXALL_ARCHIVE_SECRET` は変えないこと |

### GitHub Pages 版（build-pages.mjs、今は使っていない）での EdgeOne 版との違い
- サイト内パス（`/Pocket/` など）に `/mixall` を付け、`/api/<名前>` を Edge Function のURLにする。実行時にも `js/mixall-base.js` が fetch・リンク・画面移動を補正する
- `edgeone.json` の書き換えルールの代わりに `404.html` が振り分ける（`/Mail/Thread/<id>`、`/ghost/@<id>`、大文字小文字の違いなど）
- サイト名を「MixAll +（二世代）」にそろえ、canonical・robots・keywords などを補う
- 友人のコードに直接書かれていた鍵（Supabase・AgentMail・x.gd・pixiv・VAPID・cron）は `scripts/import-edgeone.mjs` で取り除き、環境変数から読む（このリポジトリは公開）
- 以前の版（端末保存チャット）の本文は、`js/vault-restore.js` が書いた本人の端末から一度だけサーバーへ戻す

## 新しい版を取り込むとき
```
node scripts/import-edgeone.mjs <EdgeOne版ZIPを展開したフォルダ>
npm test
node scripts/build-edgeone.mjs --site https://mixall-plus.edgeone.dev
edgeone makers deploy edgeone-build -n mixall-plus     # 公開直後の数十秒は 545 が出ることがある
node scripts/build-edge.mjs                            # 予備の Supabase 版も合わせる
npx supabase functions deploy mixall-api --project-ref kifnzvktwbomxthzvvgy --no-verify-jwt --use-api
git push origin main
```
- 元の `middleware.js`（Ghost投稿のリンクプレビュー）は、入れると公開に失敗するので入れていない
- EdgeOne の環境変数を変えたら、もう一度公開しないと反映されない
- EdgeOne の `context.env` は列挙できないことがあるので、名前を指定して読む（`server/edgeone/mixall-config.js`）
