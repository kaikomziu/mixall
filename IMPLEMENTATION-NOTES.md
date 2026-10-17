# ツールセンター実装ノート

## 既存環境の保持

この成果物は受領したプロジェクト一式を土台に差分を加えたものです。既存アプリ・サーバー構成・ファイル・過去のデータは今回削除していません。バックアップは継続して利用できる想定で、追加したTools用のBlobストアも既存の`STORE_NAMES`列挙バックアップに含まれます。

## 追加した領域

- `public/Tools/index.html`, `public/js/toolbox.js`: 更新後27カードのツールセンターUI/ブラウザ処理（元の24機能と追加ツールを含む）
- `netlify/functions/tools.js`: 匿名箱、AI相談、推薦、Wiki、匿名ルーム、期限付き共有、献立、リンク確認、公開サイト静的ソース取得API
- `netlify/lib/public-site-source.js`: 公開サイトを安全に巡回するTLS/DNS/IP制限付きHTTPクライアント
- `public/js/vendor/fflate.min.js`: サイト応答を端末内でZIP化するブラウザーライブラリ
- `netlify/functions/scheduled-tools-cleanup.js`: 期限切れ一時データ掃除
- `netlify/lib/store.js`: Tools向けBlobストア名の追加のみ
- `public/js/mixall-nav.js`, `public/index.html`, `netlify.toml`, `public/_redirects`: 導線とルーティングの追加
- `public/Uch/index.html`, `public/Uch/thread.html`, `netlify/functions/uch.js`: タグ保存・一覧検索・複数タグ絞込
- `public/Pocket/room.html`: メッセージ内の選択範囲コピー

## 外部依存

Gemini APIキーは運営画面から登録したキー（Netlify Blobsの`ADMIN_SECRETS`）を共通Gemini呼び出し層が読み込みます。`GEMINI_API_KEY`環境変数も任意のフォールバックとして利用できます。Leaflet/OpenStreetMap、Marked/DOMPurify、js-yaml、QRCode.js、Tesseract.jsはCDNから読み込みます。ネットワーク遮断環境では対応ツールだけが制限を受けます。

## 注意点

一時ルームと共有ロッカーはBlobs上へ保存されます。6時間または選択時間を過ぎたらAPIアクセスは拒否され、毎時Scheduled Functionが物理削除します。Wikiは公開テキストのみで、更新・削除は作成者限定です。匿名メッセージは受信箱所有者だけが読み取れます。匿名送信と部屋投稿には簡易IP間隔制限を設定しました。

画面分割は利用先サイトがiframe埋め込みを許可しない場合、表示できません。外部ページを埋め込むための制限解除やプロキシは実装していません。

## 確認結果

Netlify CLIのFunction bundling、Node構文確認、インラインJavaScript確認、JSON/TOML形式確認、モックBlobsによる匿名箱・受信箱・Wiki所有権・一時チャット・一時共有削除・プライベートIP拒否のテストを実施。

> 今回の環境で本番Netlifyへデプロイはしていません。公開反映はプロジェクトをNetlifyへアップロードし、運営画面で保存済みのGeminiキーとScheduled Functionsを確認してから行ってください。Gemini用環境変数の追加は、運営画面にキーが設定済みなら不要です。

## 今回の継続確認（2026-10-13）

- Tool Centerは24カード（22の独立ツール＋Uchタグ検索・Pocket部分コピーへの導線）になっていることを確認。
- Chromium/Playwrightでカード、47都道府県、41か国、日本の訪問切替、文字数・頻出語分析を検査。ページJavaScript例外なし。
- Uch APIのモック読み取りで複数タグAND/OR、キーワード検索、検索前総数、タグ一覧を確認（本番Blobsのデータは変更していません）。
- OGPのビルド処理で公開HTML全42ページへOG/Twitterメタデータを補完し、画像ファイル参照と2回目実行の冪等性を確認。大文字を含む実パスを保持し、`/ghost/` はGhostフィードへ内部リライトします。
- JS/Python構文、Netlify Functionsのバンドル、Netlify TOMLを検査済み。`netlify build` はsite IDが設定されていないため実行できず、本番デプロイも未実施です。
- Gemini APIキーは運営画面の保存設定を共通ラッパーが読む構成で、環境変数だけに依存しないことを確認。ユーザーからも運営画面で設定済みとの連絡あり。
- スマートフォン幅では分割画面を1列にし、埋め込みページ内の重複ヘッダー・下部ナビを抑制。余白・操作部品を縮小します。
- 運営メニューの項目数を下部ナビ幅へ動的に反映し、ページ表示時にAuthの`verify`で権限を再取得して古いローカル権限表示を同期します。
- 本番反映にはNetlifyサイトID・認証と承認済みの連携が必要です。


## 緊急通信HTMLのBlob URL起動（2026-10-13）

- ユーザー提供の`mixall-emergency(2).html`（単体HTML、外部参照なし）を`public/downloads/mixall-emergency.html`へ反映。
- 緊急モード画面の「緊急通信HTMLを開く」はクリック時に同一オリジンの配信HTMLを取得し、ブラウザー内で`URL.createObjectURL(new Blob(...))`を作成して`location.assign(blobUrl)`する。Blob URLは呼出元ページのオリジンを継承するため、`blob:null/...`の一時URLを固定配布せず各ブラウザーで利用可能。
- Service Workerキャッシュをv2へ更新し、新しい単体HTMLを事前キャッシュ対象に維持。
- Chromiumで実際にクリックし、`blob:http://127.0.0.1:8845/<UUID>`への遷移・添付HTMLのタイトルと接続画面・JavaScript例外なしを確認。
- 本番Netlifyへのデプロイは未実施。


## Background Functionsと年齢ゲート（2026-10-13）

- UchのAI返信は投稿リクエスト内でGeminiを待たず、専用Blobキューへ登録。`scheduled-uch-ai-background`が1分ごとに処理するため、投稿者が画面を閉じても返信を保存できます。重複防止・再試行・スレッド保存を維持。
- 時報bot、Ghost監査、プログラム審査もBackground Functionとして登録。時報botはオンライン参加者がいなくても実行し、予約曜日・日付・時刻は日本時間（Asia/Tokyo）で評価。検証中に見つかったbot引数の渡し漏れも修正。
- 年齢確認への誘導は、ログイン済みでセッション上の年齢確認が未完了の場合だけ実施。年齢ページ側でもまず認証を検証し、アカウントのBlobに有効な生年月日が存在すれば入力フォームを出さず目的ページへ戻し、Blob未設定のログインアカウントだけにフォームを表示。
- Geminiの実行設定は運営画面保存値を読む既存共通ラッパーを使用。運営画面のAPIキーを新たに環境変数へ複製する必要はありません。
- 検証: Netlify Functions bundling、JS構文、cron/TOML設定、BlobモックでのAIキュー登録・消化、プレゼンス無しの時報投稿、日本時間の曜日・単発日付・時刻判定、`age.html`の未ログイン／生年月日Blob有り／無しの3分岐を確認。既存ユーザーデータの削除・移行は行っていません。
- Netlify公式仕様: [Background Functions](https://docs.netlify.com/build/functions/background-functions/)（非同期実行・最大15分、旧`-background`ファイル名規則もサポート）、[Scheduled Functions](https://docs.netlify.com/build/functions/scheduled-functions/)（cronはUTC基準、公開デプロイで実行、通常の実行上限30秒）、[Functions API config](https://docs.netlify.com/build/functions/api/)（`background`と`schedule`設定の項目）。
- この作業環境ではNetlify連携が無効で対象Site IDも未設定のため、本番デプロイは実施していません。関数バンドルはビルド済みですが、スケジュール実行の本番確認にはNetlifyサイトへの接続・紐づけと公開デプロイが必要です。

## 添付更新と公開サイト静的ソースZIP取得（2026-10-15）

- 受領した`mixall-theme-edit-update.zip`の更新を既存の年齢確認・運営画面・緊急Blob URL・Background Functions・バックアップ実装を残して統合。Tool Centerは現在27カードです。
- Tool Centerの「公開サイトのプログラムを取得」はログイン必須の`tools` Function（`action: siteSource`）を呼び、ZIPはブラウザー内の`fflate`で作成してダウンロードリンクを表示します。取得ファイルをサーバーへ保存したり、取得したコードを実行したりしません。ユーザー単位の連続取得は30秒の間隔制限があります。
- 対象は公開HTTPS応答で、入力サイトと同一オリジンのHTML、CSS、JavaScript、JSON/Web Manifest等のみです。HTML内の同一オリジンページ（最大8ページ）・stylesheet/script/modulepreload、CSSの`@import`、JavaScriptの静的/動的importをたどります。ログイン保護ページ、サーバー上のPHP等のソース、データベース、隠しファイル、外部CDN資産は取得しません。したがって「サイトのサーバーフォルダー全体」ではなく「ブラウザーに公開配信された静的プログラム資産のスナップショット」です。
- URLはHTTPS・標準ポートのみで、資格情報付きURLやローカル/予約ホスト名を拒否します。DNSの全レコードがグローバル公開IPであることを検査し、実接続のIPを固定してDNS差し替えを防ぎ、HTTPSの証明書/ホスト名検証は維持します。同一オリジンを外れるリダイレクトは拒否します。HTTPメソッドはGET/HEADに限定し、圧縮応答・対象外MIME・不正パスも取得しません。
- 取得上限は1ファイル256KiB、合計2MiB、最大32ファイル、HTML最大8ページ、リソース要求最大36件、全体24秒、1要求4.5秒、並列4件です。JSON応答も3.5MiBで制限します。リンク切れチェッカーも同じ固定DNS/IP接続を使い、公開HTTP(S)だけを検査します。
- 検証: Netlify Functions bundling成功。Node構文/IP・予約アドレス/URL形式テスト、DNS/IP固定を含むモックHTTPS Crawl、CSS/JS import・同一オリジン制約・私設IP/DNS・別オリジンredirect拒否を確認。Chromiumでは393px画面で27カード、ZIPダウンロードと内容（README/HTML/JS）を検査し、画面幅320/360/393pxの横スクロールなし、下部8項目に「運営等」が表示されることを確認。ページJavaScript例外なし。年齢ページも未ログイン→ログイン、Blob登録済み→目的ページへ戻る、ログイン済みBlob未設定→入力欄表示の3分岐を確認。
- 実公開サイト`https://example.com/`への読み取り専用実接続で、DNS固定後にHTMLとJSの2ファイル（計2,540 bytes）を警告なしで取得できることも確認しました。任意の第三者サイトやNetlify本番環境での稼働を全て保証するものではなく、本番デプロイは未実施です。
- Gemini共通ラッパーは引き続き運営画面に保存された`ADMIN_SECRETS`設定を読みます。運営画面にキーが設定済みなら、環境変数へ再登録する必要はありません。


## Mail外部送信・専用フォルダーURL・復元認証修正（2026-10-16）

- Mailは、既存のMixAll内アカウント間スレッドと`MAIL_THREADS`保存を維持しながら、未登録の有効なメールアドレスをNetlify Email Integrationへ送信します。外部送信/返信は`emails/mail-message/index.html`を使い、添付はBase64形式でプロバイダーへ渡します。利用者単位で1日20通・同一宛先1日5通、本文100KiB、外部添付1ファイル4MiBに制限。送信中/成功/失敗をスレッドに記録し、失敗時も送信済みフォルダーで確認できます。短期送信回数は既存`ACCOUNT_RECOVERY`一時ストアを利用し、バックアップ対象データを増やさず、メール本文・アカウントスレッドも消去しません。
- Mailの受信トレイ・送信済み・全メール・新規作成に `/Mail/Inbox/`、`/Mail/Sent/`、`/Mail/All/`、`/Mail/Compose/` を追加し、Netlify rewritesとルートマニフェストを同期。専用ビューではフォルダー名・新規作成パネルを切り替え、モバイルで横スクロールしないことを確認しました。
- バックアップ読み込み認証は進捗Blobだけを優先してmetaを無視する方式を廃止し、両方のBlobを再試行読み込みして、古い進捗ハッシュの後に正しい復元metaも照合するよう修正。管理画面は中断再開前にimportTokenを確認し、期限切れ/欠落セッションを新規セッションに切替。異なるファイルの確認を既存ジョブ確認より先に行います。
- 回帰検証: Netlify Functions bundle、Node構文、インラインJavaScript、TOML/JSONルート、Blob mockでの外部Gmail送信・外部返信・MixAll内送信・不正宛先・プロバイダー失敗時の保存、復元時の古い進捗ハッシュ+一時的Blob未反映とページ受付/送信、Chromiumの受信/送信/全メール/新規ビューと390px表示を確認。`MAIL_THREADS`は従来どおりバックアップ対象です。
- **未完了の本番要件:** このSandboxにはNetlify Email Integrationのプロバイダー/秘密値/認証済み差出人環境変数がなく、Netlifyコネクターも無効です。モック以外のGmail配送とライブサイトへのデプロイはこの変更だけでは確認できません。NetlifyでプロバイダーAPIキー、`NETLIFY_EMAILS_SECRET`、DNS認証済みドメインの`MIXALL_EMAIL_FROM`をBuildsとFunctions両方へ設定して再デプロイしてください。手順は[EMAIL_SETUP.md](EMAIL_SETUP.md)に記載。
- 公式資料: [Netlify Email Integration](https://docs.netlify.com/extend/install-and-use/setup-guides/email-integration/)（テンプレート/添付/チーム利用条件）、[Google Gmail送信者ガイド](https://support.google.com/mail/answer/81126?hl=en)（SPF/DKIM/DMARCと送信元ドメイン認証）。
