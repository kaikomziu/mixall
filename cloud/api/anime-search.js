// アニメ画像検索のサーバー経由プロキシ。ブラウザから直接外部APIを叩くとCORSやbot判定で失敗するため、
// サーバー側で中継し、結果のpixivリンクはMAWS内ビューア(/MAWS?pixiv=ID)に差し替える。
//  POST /api/anime-search {image:'data:image/png;base64,...', sites:['pixiv',...]}
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const ALLOWED_SITES = ['pixiv', 'skeb', 'bilibili', 'misskey', 'danbooru'];
const buckets = new Map();
function limited(ip) {
  const now = Date.now(); const last = buckets.get(ip) || 0;
  if (now - last < 2500) return true;
  buckets.set(ip, now); if (buckets.size > 2000) buckets.clear();
  return false;
}

async function viaOnegai(bytes, sites) {
  const form = new FormData();
  form.set('image', new Blob([bytes], { type: 'image/png' }), 'search.png');
  form.set('sites', sites.join(','));
  const res = await fetch('https://api.onegai.moe/search', { method: 'POST', body: form, headers: { 'User-Agent': UA, Origin: 'https://onegai.moe', Referer: 'https://onegai.moe/' }, signal: AbortSignal.timeout(25000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || `onegai.moe ${res.status}`);
  const items = Array.isArray(data.result) ? data.result : Array.isArray(data.results) ? data.results : [];
  return items.map((it) => ({
    title: it.title || '', url: it.url || '', source: it.site || it.source || '',
    image: it.cdn_path ? `https://cdn.onegai.moe/${String(it.cdn_path).replace(/^\/+/, '')}` : (it.thumbnail || it.image || ''),
    score: Number(it.score || it.similarity || 0) || null, nsfw: Number(it.nsfw_score || 0)
  }));
}

// 予備: アニメのスクリーンショットならtrace.moeで探せる
async function viaTraceMoe(bytes) {
  const res = await fetch('https://api.trace.moe/search?cutBorders&anilistInfo', { method: 'POST', body: bytes, headers: { 'Content-Type': 'image/png', 'User-Agent': UA }, signal: AbortSignal.timeout(25000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || `trace.moe ${res.status}`);
  return (data.result || []).slice(0, 8).map((r) => {
    const t = r.anilist?.title || {};
    return { title: `${t.native || t.romaji || t.english || 'アニメ'}${r.episode ? ' 第' + r.episode + '話' : ''}`, url: r.anilist?.id ? `https://anilist.co/anime/${r.anilist.id}` : '', source: 'trace.moe', image: r.image || '', score: r.similarity || null, nsfw: r.anilist?.isAdult ? 1 : 0 };
  });
}

// pixivのURLはMAWS内のpixiv画面(?ServerAction=)で開く(pixiv本体はbot判定や地域制限で開けない端末があるため)
function localize(item) {
  const m = /pixiv\.net\/(?:[a-z]{2}\/)?artworks\/(\d{3,12})/i.exec(item.url || '');
  if (m) return { ...item, source: item.source || 'pixiv', pixivId: m[1], viewerUrl: `/MAWS/?ServerAction=${encodeURIComponent('https://www.pixiv.net/artworks/' + m[1])}` };
  return item;
}

export async function onRequest(context) {
  const req = context.request;
  if (req.method !== 'POST') return json(405, { error: 'POSTのみ対応しています' });
  const ip = context.clientIp || req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  if (limited(ip)) return json(429, { error: '少し待ってからもう一度検索してください' });
  let body; try { body = await req.json(); } catch (_) { return json(400, { error: 'リクエストが不正です' }); }
  const m = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(body.image || ''));
  if (!m) return json(400, { error: '画像を指定してください' });
  const bytes = Buffer.from(m[1], 'base64');
  if (bytes.length < 100 || bytes.length > 2 * 1024 * 1024) return json(413, { error: '画像サイズが不正です' });
  const sites = (Array.isArray(body.sites) ? body.sites : []).filter((x) => ALLOWED_SITES.includes(x));
  if (!sites.length) return json(400, { error: '検索先を選択してください' });
  const errors = [];
  let results = [];
  try { results = await viaOnegai(bytes, sites); } catch (e) { errors.push(String(e.message || e)); }
  let engine = 'onegai';
  if (!results.length) {
    try { const t = await viaTraceMoe(bytes); if (t.length) { results = t; engine = 'trace.moe'; } } catch (e) { errors.push(String(e.message || e)); }
  }
  if (!results.length && errors.length) return json(502, { error: '検索サービスに接続できませんでした: ' + errors.join(' / ') });
  return json(200, { engine, results: results.map(localize), note: engine === 'trace.moe' ? 'イラスト検索で見つからなかったため、アニメのスクリーンショット検索(trace.moe)の結果を表示しています。' : '' });
}
