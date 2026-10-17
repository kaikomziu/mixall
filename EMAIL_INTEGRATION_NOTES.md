# Netlify Email Integration 調査メモ

調査日: 2026-10-15

## 確認済みの事項

- Netlify Email Integration は、バージョン管理されたメールテンプレートと、外部メールAPIプロバイダーをつなぎ、Netlify Functionsからメールを送る機能。公式ドキュメントの対応プロバイダーは Mailgun、Postmark、SendGrid。
- 2026-09-11以降、新規チームのプロジェクトにはこの統合を新たに追加できない。該当日以前に作成されたチーム、または既に統合を利用しているプロジェクトは引き続き利用可能と記載されている。
- 送信にはプロバイダー側の確認済みアカウント・送信者アドレス認可とAPIキーが必要。`NETLIFY_EMAILS_PROVIDER`、`NETLIFY_EMAILS_PROVIDER_API_KEY`、`NETLIFY_EMAILS_SECRET` などを利用する。テンプレート送信例は `POST /.netlify/functions/emails/<template>` に `netlify-emails-secret` ヘッダーを付ける形。
- この統合の説明は外部APIを用いた送信機能であり、メールボックス、IMAP、受信メール配送機能の説明はない。外部メール受信は、ドメインのMX設定とプロバイダー側のInbound Parse/Routeから別のWebhookを構成する必要がある。
- Netlify Identityのパスワード回復メールはNetlify Identityユーザー向け。現行MixAllはNetlify Identityではなく、独自のNetlify Blobsアカウント/セッションを使うため、Identityの既成回復メールだけでは既存アカウントのパスワードを再設定できない。
- 現行MixAllのログインIDは `@bix.3erver` の疑似アドレス。外部受信可能な住所ではない。既存利用者に回復用メールアドレスを本人確認付きで登録させる機能と、専用の一回限りリセットURLを実装する必要がある。

## 参照URL

- Netlify Email Integration: https://docs.netlify.com/extend/install-and-use/setup-guides/email-integration/
- Netlify Identity生成メール: https://docs.netlify.com/manage/security/secure-access-to-sites/identity/identity-generated-emails/
- Netlify Email Integration発表: https://www.netlify.com/blog/netlify-email-integration-ga/
- Netlify連携のPostmark説明: https://postmarkapp.com/integrations/netlify
- Mailgun Webhook署名: https://documentation.mailgun.com/docs/mailgun/user-manual/webhooks/securing-webhooks
- Postmark Inbound Webhook: https://postmarkapp.com/developer/webhooks/inbound-webhook
- SendGrid Inbound Parse設定: https://www.twilio.com/docs/sendgrid/for-developers/parsing-email/setting-up-the-inbound-parse-webhook
- SendGrid Inbound Parse署名: https://www.twilio.com/docs/sendgrid/for-developers/parsing-email/securing-your-parse-webhooks


## 2026-10-16 外部宛てMail送信に関する公式仕様

- Netlify公式ガイドでは、Email Integrationの対応プロバイダーはMailgun、Postmark、SendGrid。メールテンプレートは`emails/<template>/index.html`または`index.mjml`に置き、HTMLではHandlebars構文のパラメータを使用する。`netlify.toml`で有効化する場合、プロバイダー、APIキー、`NETLIFY_EMAILS_SECRET`が必要で、環境変数のスコープはBuildsとFunctionsの両方を含める。
- 同ガイドは、添付を`attachments`配列にし、各要素へBase64の`content`、`filename`、必要に応じ`type`を渡す例を記載している。
- Netlifyは2026-09-11以降、新しいチームのプロジェクトへEmail Integrationを新規追加できない。該当日以前のチーム、または既に統合を使用中のプロジェクトでは継続利用できる。
- Google公式Gmail送信者ガイドでは、全送信者にSPFまたはDKIMの設定が求められる。大量送信者はSPF、DKIM、DMARCが必要で、Fromドメインと認証ドメインの整合が求められる。個人Gmail宛てには1024-bit以上のDKIMが必要で、2048-bitが推奨される。

Sources:
- [Netlify Email Integration](https://docs.netlify.com/extend/install-and-use/setup-guides/email-integration/)
- [Gmail Email sender guidelines](https://support.google.com/mail/answer/81126?hl=en)
