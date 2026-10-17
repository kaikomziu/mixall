const { STORE_NAMES, getJSON } = require('../lib/store');
const { listKeys } = require('../lib/store');
const { getSessionInfo } = require('../lib/session');

function json(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) };
}

exports.handler = async (event) => {

  try {
    if (event.httpMethod !== 'GET') return json(405, { error: 'GETのみ対応しています' });
    const token = event.queryStringParameters?.token;
    const info = await getSessionInfo(token);
    if (!info) return json(401, { error: 'ログインが必要です' });
    const unlimited = Boolean(info.isAdmin || info.isOfficial);
    const balance = Number(await getJSON(STORE_NAMES.COINS, info.email)) || 0;
    if (event.queryStringParameters?.action === 'earningSites') {
      const config = await getJSON(STORE_NAMES.COIN_EARNING_SITES, 'featured');
      const selected = Array.isArray(config?.slugs) ? config.slugs : [];
      const sites = [];
      for (const slug of selected) {
        const site = await getJSON(STORE_NAMES.LENDING_SITES, slug);
        if (site && site.coinPrograms?.length) sites.push({ slug:site.slug, title:site.title || site.slug, description:site.description || '', url:`/site-view/${encodeURIComponent(site.slug)}` });
      }
      return json(200, { sites });
    }
    return json(200, { email: info.email, balance, unlimited });
  } catch (error) {
    console.error('coins function error:', error);
    return json(500, { error: `内部エラー: ${error.message}` });
  }
};
