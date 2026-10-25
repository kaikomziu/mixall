// /Ghost/post.html?id=〇〇 を SNS・チャットアプリのリンクプレビュー用クローラーが開いたときだけ、
// 投稿ごとのOGP(先頭画像+右下MixAll Ghostロゴ)を返す /Ghost/post/〇〇 に切り替える。
// 人間のブラウザは今までどおり post.html をそのまま表示する(リダイレクトのループを避けるため)。
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|facebot|twitterbot|discord|slack|telegram|whatsapp|line-poker|linebot|line\/|skype|pinterest|embedly|preview|vkshare|mastodon|misskey|bluesky|iframely|redditbot|applebot|google-inspectiontool|ogp|opengraph/i;

export function middleware(context) {
  try {
    const request = context.request;
    const url = new URL(request.url);
    const id = (url.searchParams.get('id') || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
    const ua = request.headers.get('user-agent') || '';
    if (id && BOT.test(ua)) return context.rewrite('/Ghost/post/' + encodeURIComponent(id));
  } catch (_) {}
  return context.next();
}

export const config = { matcher: ['/Ghost/post.html', '/ghost/post.html', '/Ghost/post', '/ghost/post'] };
