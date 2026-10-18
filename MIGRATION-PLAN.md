# MixAll: Netlify → GitHub Pages + Supabase 移行メモ

## 決定事項（ユーザー確認済み）
- 公開先: GitHub Pages `https://kaikomziu.github.io/mixall/`（ユーザーサイト kaikomziu.github.io は使用済みのためサブパス）。**公開はユーザーの最終OKを取ってから。**
- サーバー: 既存Supabaseプロジェクト `kifnzvktwbomxthzvvgy`（MOD Wikiと共用、テーブル名は `mixall_*`）
- チャット（Pocket / Ghost DM / Mail / Ghostライブ）: サーバーにはメッセージIDなどのスタブだけ、本文は端末（IndexedDB）。「受信したら消す」方式。
- 通報: 通報時だけ通報者の端末から本文を送る。チャット監査は本文なし。
- メール送信（Netlify Emails）: 当面無効。
- 既存データ: 友人に運営画面のバックアップZIPをもらって `scripts/migrate-backup.mjs` で取り込む。

## 完了（ローカルで動作確認済み）
- Supabaseテーブル `mixall_kv` / `mixall_chat_inbox`、設定行 `mixall-config/env`（API URL・サイトURL・cron秘密・移行用秘密）
- `netlify/lib/store.js` をPostgres版に置換、`server/entry.js` で全Functionを Edge Function `mixall-api` に集約
- `server/chat-vault.js`（本文の抜き出し・端末ごとの配送・受領で削除・地雷フィルターは配送時変換）
- `public/js/chat-vault.js`（IndexedDB保存・スタブへの差し込み・検索/TXT/原文表示/通報の端末処理・複数アカウント対応）
- `scripts/build-pages.mjs`（/mixall/ ベースパス化、API URL置換、404.htmlでの旧URL振り分け、site-view表示ページ）
- `scripts/build-edge.mjs`（esbuild → Deno用1ファイル、Deno 2.9で起動確認）
- `scripts/migrate-backup.mjs` + `server/migrate.js`（ダミーZIPで、旧パスワードでのログイン・旧チャットの端末配送を確認）
- セキュリティ: 運営初期パスワードを環境変数化、Manus中継を既定で無効、x.gdキーを環境変数化
- 友人コードのバグ修正: language-input.js の `editor is not defined`
- `.github/workflows/pages.yml`（mainへのpushで自動公開）、`supabase/cron.sql`（pg_cronで定期実行）

## 公開済み（2026-10-18）
- サイト: https://kaikomziu.github.io/mixall/ （リポジトリ kaikomziu/mixall、main への push で自動公開）
- API: Edge Function `mixall-api`（`npx supabase functions deploy mixall-api --project-ref kifnzvktwbomxthzvvgy --no-verify-jwt --use-api`、CLIログインは通常のPowerShellで）
- `node server/remote-check.mjs` で本番の送受信・端末配送・受領削除を確認済み。pg_cron 登録済み（`supabase/cron.sql`）
- 友人の秘密情報入りの元履歴は手元の `netlify-history` ブランチにだけある（push しない）

## 残り
3. 友人のバックアップZIPを入手 → `MIXALL_MIGRATION_SECRET`（mixall-config の値）を使って取り込み → 取り込み後はその値を消す
4. Gemini APIキー（運営画面またはconfig）・必要なら x.gd キーを設定
5. 未確認: 運営画面の各機能・Custom・通話/ライブ（P2P）・Tools などの本番での動作、APK（public/downloads）の中身
