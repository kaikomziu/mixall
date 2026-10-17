# MixAll Mail・回復用メールの設定ガイド

## MailからGmailなどへ送信する

Mailアプリは、既存のMixAllアカウント間メッセージを維持したまま、Gmailなどの外部メールアドレス宛てにも送信できます。外部送信はNetlify Email Integrationとそのプロバイダーを経由し、外部宛てのスレッドはMailの「送信済み」に保存されます。外部メールの受信や、Gmail側からの返信をMixAllの受信トレイへ自動で取り込む機能はありません。これはGoogle/Gmail APIのOAuth連携とは別の機能です。**Gemini APIキーの設定はメール送信設定には使われません。**

外部送信はアカウントあたり1日20通、同一宛先へ1日5通までです。本文は100KiBまで、外部宛ての添付は1ファイル4MiBまでです。サイト内Mailの受信箱・送信済み・全メール・新規作成は、それぞれ `/Mail/Inbox/`、`/Mail/Sent/`、`/Mail/All/`、`/Mail/Compose/` の専用URLで開けます。外部送信の失敗も送信済み一覧へ未送信として保存されます。

## Netlify側の設定

サイトの `netlify.toml` に `@netlify/plugin-emails` を登録済みです。Netlifyで利用可能なメールプロバイダーを設定し、次の環境変数をNetlifyのサイト設定へ追加してください。APIキーや秘密値はチャットへ送らず、Netlifyの環境変数画面に直接入力してください。

| 変数 | 設定内容 |
|---|---|
| `NETLIFY_EMAILS_PROVIDER` | `mailgun`、`sendgrid`、`postmark`のいずれか |
| `NETLIFY_EMAILS_PROVIDER_API_KEY` | 選んだプロバイダーのAPIキー |
| `NETLIFY_EMAILS_SECRET` | メール送信関数を認証する、推測困難な独自秘密値 |
| `MIXALL_EMAIL_FROM` | プロバイダーで送信認証済みの差出人。例: `MixAll <no-reply@example.com>` |
| `NETLIFY_EMAILS_MAILGUN_DOMAIN` | Mailgunを使う場合の送信ドメイン |
| `NETLIFY_EMAILS_MAILGUN_HOST_REGION` | Mailgunを使う場合は`eu`または`non-eu` |

Netlifyの環境変数スコープは **Builds と Functions の両方**を含めてください。Gmail宛てに届けるには、`MIXALL_EMAIL_FROM`を自分がDNSを管理できるドメインの認証済みアドレスにし、そのドメインでSPFまたはDKIMを設定してください。大量送信を行う場合はSPF・DKIM・DMARCが必要です。`mix-alls.netlify.app`のように自分でDNSを管理できないNetlifyサブドメインを送信元に使うと、認証設定ができず、拒否・迷惑メール判定・未達の原因になります。詳細は[GoogleのGmail送信者ガイドライン](https://support.google.com/mail/answer/81126?hl=en)を参照してください。

設定後に再デプロイし、最初は自分で管理するGmailアドレスへ少数のテストメールを送って、受信トレイ・迷惑メール・プロバイダーの配信ログを確認してください。送信テンプレートは `emails/recovery-verify/index.html`、`emails/password-reset/index.html`、`emails/mail-message/index.html` です。Netlify Email Integrationの仕様は[公式ガイド](https://docs.netlify.com/extend/install-and-use/setup-guides/email-integration/)を参照してください。

Netlify Email Integrationは2026-09-11以降に作成された新しいNetlifyチームでは、新規プロジェクトへ追加できない場合があります。すでに有効な統合は継続利用できます。現在のチームで利用できない場合は、SendGrid/Postmark/Mailgunの通常APIを使う別送信層が必要です。メール設定が足りないとき、Mail画面は「設定未完了」または「外部送信失敗」を表示します。

## 回復用メール・パスワード再設定

今回追加したアカウント回復機能は、本人確認済みアドレスへの確認コード送信と、期限付きパスワード再設定リンクの送信です。外部のメールボックスをサイト内Mailへ取り込む機能や、利用者ごとのGoogle OAuth接続は含みません。

- 利用者はログイン後、アカウント設定で実メールアドレスを登録し、届いた6桁コードを確認します。MixAllの疑似ログインID（`@bix.3erver`）は回復先にできません。
- コードは10分で失効し、誤入力は最大5回です。同じアカウントからの再送は1分ごとに制限します。
- パスワード再設定依頼は、実在アカウントかどうかに関係なく同じ応答を返します。確認済み回復アドレスがある場合だけ、30分有効・一回限りのリンクを送ります。
- トークンはハッシュで保存されます。再設定が完了すると、そのアカウントの全ログイン端末が失効します。
- 回復コード・再設定トークンの一時ストアはバックアップから除外し、確認済み回復アドレスはアカウント情報としてバックアップ対象に含めます。
