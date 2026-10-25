// /Ghost/<ページ名> と /Ghost/@<ハンドル> を、対応する静的HTMLを返して表示する。
const PAGES = { watch: 'watch', videos: 'videos', post: 'post', sound: 'sound', bookmarks: 'bookmarks', search: 'search', live: 'live', chat: 'chat', profile: 'profile' };

export async function onRequestGet(context) {
  const handle = decodeURIComponent(String((context.params && context.params.handle) || ''));
  let file = null;
  if (handle.startsWith('@')) file = 'profile';
  else if (PAGES[handle.toLowerCase()]) file = PAGES[handle.toLowerCase()];
  if (!file) return new Response('Not Found', { status: 404 });
  const res = await fetch(new URL(`/Ghost/${file}.html`, context.request.url));
  return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' } });
}
