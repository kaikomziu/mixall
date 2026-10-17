# MixAll 緊急モード

## 今回追加したもの

- `public/sw.js`: HTTPSで一度アクセスした端末に緊急モードの起動ファイルをキャッシュ
- `public/emergency.html`: オフラインで開ける緊急メモ画面
- `public/js/emergency.js`: 端末内IndexedDBへのメモ保存、JSON書き出し／復元、接続表示、電池残量表示、省電力モード
- `public/manifest.webmanifest`: ホーム画面へ追加できるPWAマニフェスト
- `public/downloads/MixAll-APK-1.0.apk`: 添付されたAndroid WebView版サンプルAPKをダウンロード可能にしたもの
- `public/emergency-alert.json`: 運営が警報準備を有効化するためのフラグ
- `public/emergency-monitor.js`: 位置情報・通信品質・気象判定に応じた緊急モード切替
- `public/emergency-policy.json`: 危険区域、通信閾値、気象API接続先の設定
- `public/emergency-peer.html` / `public/js/emergency-peer.js`: WebRTC DataChannelによる端末間P2P接続とメッセージ交換
- `public/downloads/mixall-emergency.html`: 外部ファイルに依存せず、起動時に保存済み候補を自動試行する単一HTMLの緊急通信クライアント
- `public/js/mesh-persistence.js`: 接続候補、成功率、RTT、保存イベントをIndexedDBへ記録し、永続ストレージを申請するモジュール
- 共通ナビとホームから緊急モードへアクセス可能

### 使い方

1. 通信できるうちにMixAllへアクセスし、「緊急モード」を一度開く。
2. 「起動ファイルを更新」を押す。
3. 必要ならPWAとしてホーム画面へ追加する。
4. 安否や集合場所などは緊急メモへ保存し、JSONでも外部へバックアップする。
5. 電池が少ない場合は「省電力モード」を有効にする。自動的なネットワーク確認を止める。
6. Android端末では、APKの手動準備ボタンを押すか、警報フラグまたは通信品質低下が検知されたときにダウンロードを促す。インストールはAndroidの確認画面で本人が行う。

緊急メモはサーバーへ送信せず、その端末のIndexedDBにだけ保存する。ブラウザのサイトデータ削除やOSによるストレージ整理で消える可能性があるため、JSONの手動保存も必要になる。

## APK準備の条件

ブラウザが提供するNetwork Information APIで `slow-2g`／`2g`、おおむね1.5Mbps以下、またはRTT 500ms以上を「危険水準の一つ手前」として扱い、通信がまだ使える間にAPKのダウンロードを促す。端末やブラウザによってこのAPIがない場合は自動検知できないため、手動ボタンを残している。

警報は `public/emergency-alert.json` の `active: true` を監視する。これは現時点では運営設定フラグであり、気象庁などの公式警報を自動取得する機能ではない。公式警報と連動する場合は、公式情報源を確認するサーバー側の取得処理を別途用意し、誤警報・通信障害・署名検証を考慮する必要がある。

添付APKはWebViewで通常サイトへアクセスするサンプルであり、ローカル会話DBやWi‑Fi Aware／Wi‑Fi Directによるメッシュ機能はまだ含まない。APKを配布できることと、APIなしで緊急通信できることは別である。

## 自動モード切替

通常時のサイトは、危険判定後に単一HTMLをダウンロードして端末へ保存するための準備入口として使う。災害時の通信画面そのものはサイトに依存せず、`downloads/mixall-emergency.html` を直接開く。サイト・単一HTML・別の単一HTMLは、同じWebRTCメッセージ形式を使う構成にする。

接続候補はIndexedDBへ保存し、成功率・平均RTT・最終確認時刻で優先順位を付ける保存領域を追加した。ブラウザが許可する場合はStorage Persistenceを申請するが、ユーザーがサイトデータを消去した場合やOSが容量確保を行った場合まで保持を保証することはできない。localStorageのみに依存せず、IndexedDBとフォールバック保存を併用する。

単一HTML版はコード入力欄を持たず、起動時に `localStorage` とIndexedDBから、`localOffer` と `remoteAnswer` を含む期限内の候補を読み込む。候補を成功率・RTT順に自動試行し、接続済み端末をツリー表示する。候補が空、またはネットワーク経路がない場合は自動接続できないため、平常時にサイト側で相互接続用の候補ペアを配布しておく必要がある。

保存イベントは端末内のログとして記録する。サーバーへ「誰がどの候補を持つか」を送る場合は、メールアドレスやIPアドレスの平文ではなく、期限付きの端末ID・公開鍵・候補ID・ハッシュ化したアカウント識別子を使い、利用者への説明と同意、保存期間、削除方法を用意する必要がある。現段階の実装は端末内ログまでで、隠れて外部へ送信しない。

緊急モード画面で「危険監視を有効化」すると、WebView内でも位置情報の監視を開始する。現在の判定は次の通り。

- 遭難フラグがONで、現在地が `dangerZones` の範囲内なら切替
- 遭難フラグがONで、通信品質が設定閾値以下なら切替
- `weather.endpoint` が返す `danger: true` または `alertLevel >= minAlertLevel` なら切替

判定成立時は `mixall_emergency_mode` を端末に保存し、画面上部に赤い緊急バナーを出したうえで `/emergency.html` へ移動する。誤検知で即座にAPKを落とさないよう、APKの自動準備は別に行い、ブラウザがブロックした場合は手動ボタンを表示する。

なお、WebViewがバックグラウンドにいる間も位置情報を監視するには、APK側で位置情報権限、Foreground Service、通信状態監視、端末の省電力制限への対応が必要になる。添付されたコンパイル済みAPKだけでは安全に追加できないため、Androidプロジェクトのソースから再ビルドする必要がある。

## 端末間P2Pの採用方式

Web版の代替方式としてWebRTC DataChannelを追加した。接続後は任意の文字データをブラウザ間で直接交換できる。PWAでは `/emergency-peer.html` を開き、端末AがOfferを作成し、端末BがAnswerを作成して、コードをコピー・貼り付けして接続する。ICEサーバーは空にしているため、同じWi‑Fi、端末のテザリング、同一ローカルネットワークでの直接接続を優先する。

接続後は、疎通チェックのprobe／ackを15秒ごとに送り、成功率とRTTを画面に表示する。緊急メッセージには端末ID、messageId、hop、ttl、pathを付け、受信側で重複排除したうえでTTLが残っていれば別の接続へ転送する。これがWeb版でのバケツリレーの基礎実装である。現画面は1接続を基本とするため、複数端末を中継するには各端末で別のP2P接続を確立する必要がある。

WebRTCの仕様上、Offer／AnswerやICE候補を相手へ渡すシグナリングはWebRTC APIの範囲外であり、今回はサーバーを使わない手動コード交換にした。[2] そのため自動発見ではないが、通信確立後のメッセージは外部APIを経由しない。単体HTMLとして配る場合も同じ実装を含められるが、PWAのHTTPS配信の方がブラウザ互換性とService Worker利用に優れる。

Web BluetoothはBLEのGATTサーバーへ接続する中央側APIで、ブラウザの対応やユーザー操作が必要であり、スマートフォン同士の汎用メッシュには向かない。[1] Web NFCも現在の仕様ではP2Pをサポートしていない。[4] Android専用ならNearby Connectionsがオフラインの発見・接続に適しているが、これはネイティブSDKでありPWAには直接入れられない。[5]

## 端末間メッシュをWebだけで行えない理由

現行のWeb版は、Wi‑Fi Ad-hocやWi‑Fi Directをブラウザから自動的に有効化するAPIを持たない。Web BluetoothはBluetooth Low EnergyのGATT周辺機器へ接続するAPIで、対応ブラウザが限定され、汎用的な端末間メッシュ通信APIではない。[1]

WebRTC DataChannelはブラウザ間で任意データをP2P転送できるが、接続には相手とのシグナリングと、必要に応じてSTUN/TURNなどの接続調整が必要になる。Wi‑Fiがなく、双方が未接続の状態から、ブラウザだけで近くの端末を自動発見して多段中継する仕組みにはならない。[2]

Service WorkerはHTTPS上でサイトのファイルをキャッシュし、オフライン時にキャッシュを返す仕組みである。これはNetlifyが一時的に到達不能でも画面を起動するために使えるが、無線の中継機能を提供するものではない。[3]

このため、今回のWeb版では、実装可能で安全な範囲として「オフライン起動」「端末内メモ」「JSON手動交換」「省電力モード」を追加した。Wi‑Fi Aware／Wi‑Fi Directなどを利用した多段メッシュは、Android/iOSのネイティブアプリ層で、端末発見、認証、暗号化、重複排除、TTL、電池制御、悪意ある中継への対策まで設計して実装する必要がある。

## 重要な注意

- `navigator.onLine`だけではインターネット到達性を保証しないため、画面ではサーバーへの軽い到達確認も使う。
- MHTML/MHTは保存・閲覧用の単一アーカイブであり、端末間の無線中継機能を追加するものではない。Web版の緊急起動にはService Worker/PWAを優先する。
- 災害時の連絡手段として使う場合、MixAllだけに依存せず、携帯無線、自治体の防災情報、衛星通信など別経路も併用する。

## 参考資料

[1]: https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API "MDN Web Bluetooth API"
[2]: https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel "MDN RTCDataChannel"
[3]: https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers "MDN Using Service Workers"
[4]: https://w3c.github.io/web-nfc/ "Web NFC Specification"
[5]: https://developers.google.com/nearby/connections/overview "Google Nearby Connections Overview"
