# MixAll Webhook 利用ガイド

## できること

ログイン済みのユーザーは、トップページの「Webhook」または `/Webhook` から、自分のアカウントに紐づくWebhookを作成できます。運営アカウントだけでなく、一般ユーザーも利用できます。作成できるWebhookは1アカウントにつき最大20個です。

Webhookの送信者は、Webhookを作成したアカウントです。Pocketへ送信する場合は、そのアカウントが対象ルームのメンバーである必要があります。Mailへ送信する場合は、宛先がMixAll内に存在するアカウントである必要があります。

## 作成手順

1. MixAllへログインします。
2. トップページの「Webhook」を開きます。
3. 名前、種類（MailまたはPocket）を入力して「追加」を押します。
4. 表示されたエンドポイントと秘密鍵を保存します。秘密鍵は作成時または再発行時に一度だけ表示されます。
5. 外部サービスから、署名付きのJSON POSTを送信します。

Webhookは画面から停止、再開、秘密鍵の再発行、削除ができます。秘密鍵が漏れた場合は、すぐに停止または再発行してください。

## エンドポイント

画面に表示されたURLを使用します。通常は次の形式です。

```text
https://mix-alls.netlify.app/.netlify/functions/webhook?id=WebhookID
```

HTTPメソッドは `POST` です。リクエスト本文はUTF-8のJSONにしてください。

## 署名計算

JSON本文の文字列を変更せず、そのまま秘密鍵でHMAC-SHA-256計算します。計算結果を小文字の16進文字列として `X-MixAll-Signature` ヘッダーへ指定してください。`sha256=` を先頭へ付けた形式も利用できます。

```js
const crypto = require('crypto');
const body = JSON.stringify(payload);
const signature = crypto
  .createHmac('sha256', WEBHOOK_SECRET)
  .update(body, 'utf8')
  .digest('hex');

// X-MixAll-Signature: signature
```

本文のJSONを整形し直したり、改行・空白・Unicode表現を送信前に変えたりすると署名が一致しなくなるため、署名計算に使った文字列と実際に送る本文を同じ値にしてください。

## Pocket投稿

Pocket Webhookで作成した場合、本文の `type` は省略できます。指定する場合は `pocket` にしてください。

```json
{
  "type": "pocket",
  "roomId": "room-id",
  "text": "外部サービスからの投稿です。",
  "idempotencyKey": "external-event-0001"
}
```

返信する場合は、同じルーム内に存在するメッセージIDを `replyTo` へ指定します。

```json
{
  "roomId": "room-id",
  "text": "このメッセージへの返信です。",
  "replyTo": "message-id",
  "idempotencyKey": "external-event-0002"
}
```

すでにMixAll側へ保存されているファイルを添付する場合は、次の形式を使用できます。Webhook自体へ未保存ファイルの生データを送る仕様ではありません。

```json
{
  "roomId": "room-id",
  "text": "ファイルを添付します。",
  "attachment": {
    "fileId": "stored-file-id",
    "name": "report.pdf",
    "type": "application/pdf",
    "sizeBytes": 123456
  }
}
```

## Mail送信

Mail Webhookで作成した場合、本文の `type` は省略できます。指定する場合は `mail` にしてください。

```json
{
  "type": "mail",
  "toEmail": "recipient@bix.3erver",
  "subject": "外部システムからのお知らせ",
  "text": "これはMixAll MailへのWebhook送信です。",
  "idempotencyKey": "mail-event-0001"
}
```

`text` の代わりに `body` も利用できます。既存のMailスレッドへ追加する場合は、権限のある `threadId` を指定します。

```json
{
  "toEmail": "recipient@bix.3erver",
  "threadId": "thread-id",
  "subject": "返信のお知らせ",
  "body": "既存スレッドへの追加本文です。"
}
```

## curlの例

```bash
BODY='{"type":"pocket","roomId":"room-id","text":"外部投稿","idempotencyKey":"event-001"}'
SECRET='Webhook画面で発行された秘密鍵'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $2}')

curl -X POST \
  'https://mix-alls.netlify.app/.netlify/functions/webhook?id=WebhookID' \
  -H 'Content-Type: application/json' \
  -H "X-MixAll-Signature: $SIG" \
  --data "$BODY"
```

## 再送とエラー

同じ `idempotencyKey` を再送すると、処理済みとしてHTTP `200` と `duplicate: true` が返ります。`idempotencyKey` を指定しない場合は、本文のSHA-256ハッシュが再送判定に使われます。処理成功時はHTTP `201`、署名不一致は `401`、Webhookが存在しない・停止中の場合は `404`、入力不備は `400`、権限のないMailスレッドは `403` です。

## Ghost投稿削除

Ghostでは、投稿カードに表示される「削除」ボタンから、自分の投稿を削除できます。運営アカウントは他のユーザーの投稿も削除できます。削除は監査用の削除情報を残す方式で、通常の公開フィード、個別投稿、プロフィールの投稿数、通知一覧からは非表示になります。削除後に画面を再読み込みしても再表示されません。
