const { STORE_NAMES, getJSON } = require('../lib/store');

function json(status, body) { return { statusCode: status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) }; }

exports.handler = async (event) => {

  if (event.httpMethod !== 'GET') return json(405, { error: 'GETのみ対応しています' });
  try {
    const state = await getJSON(STORE_NAMES.SITE_STATE, 'global');
    return json(200, { locked: state?.locked === true, message: state?.message || '現在このサイトは保護ロック中です。' });
  } catch (error) {
    console.error('site-state function error:', error);
    return json(200, { locked: false });
  }
};
