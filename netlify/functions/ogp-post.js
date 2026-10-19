const { STORE_NAMES, getJSON } = require('../lib/store');

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
}
function baseUrl() {
  const value = process.env.URL || process.env.DEPLOY_PRIME_URL || 'https://mix-alls.netlify.app';
  return String(value).replace(/\/$/, '');
}
exports.handler = async (event) => {

  const id = String(event.queryStringParameters?.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  if (!id) return { statusCode: 400, headers: { 'Content-Type':'text/plain; charset=utf-8' }, body:'投稿IDがありません' };
  const post = await getJSON(STORE_NAMES.GHOST_POSTS, id);
  if (!post || post.deleted) return { statusCode:404, headers:{'Content-Type':'text/html; charset=utf-8'}, body:'<!doctype html><title>Ghost投稿が見つかりません</title>' };
  const base = baseUrl();
  const canonical = `${base}/ghost/post/${encodeURIComponent(id)}`;
  const fallback = `${base}/ogp/04-ghost-post.jpg?v=20261020-plus`;
  const media = Array.isArray(post.media) ? post.media : [];
  const image = media.find((item) => String(item.kind || '').startsWith('image') && item.mediaUrl)?.mediaUrl || fallback;
  const title = String(post.title || post.authorName || 'Ghost投稿').slice(0, 160);
  const description = String(post.description || post.text || 'MixAll + Ghostの投稿').replace(/\s+/g, ' ').slice(0, 300);
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${esc(title)} - MixAll +</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${esc(canonical)}"><meta property="og:type" content="article"><meta property="og:site_name" content="MixAll +"><meta property="og:locale" content="ja_JP"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(canonical)}"><meta property="og:image" content="${esc(image)}"><meta property="og:image:secure_url" content="${esc(image)}"><meta property="og:image:type" content="image/jpeg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${esc(image)}"></head><body><p><a href="${esc(canonical)}">${esc(title)}</a></p><script>location.replace(${JSON.stringify(`/Ghost/post.html?id=${id}`)});</script></body></html>`;
  return { statusCode:200, headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=60, s-maxage=300'}, body:html };
};
