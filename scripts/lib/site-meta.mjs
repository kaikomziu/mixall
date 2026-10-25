// scripts/lib/site-meta.mjs
// GitHub Pages 版（build-pages.mjs）と EdgeOne 版（build-edgeone.mjs）で共通の、サイト名・検索向けタグ・サイトマップ。
export const NAME = 'MixAll +（二世代）';

// タイトル・SNS向けの名前を「MixAll +（二世代）」にする
export function rename(html) {
  const fixName = (value) => {
    let v = value.replace(/MixAll（ミックスオール）/g, NAME).replace(/MixAll運営/g, `${NAME} 運営`);
    if (v.includes(NAME)) return v;
    if (/(^|[\s|｜\-–—])MixAll$/.test(v)) return v.replace(/MixAll$/, NAME);
    if (!/MixAll/.test(v)) return `${v} - ${NAME}`;
    return v;
  };
  return html
    .replace(/<title>([^<]*)<\/title>/i, (m, t) => `<title>${fixName(t.trim())}</title>`)
    .replace(/(<meta\s+(?:property|name)="(?:og:title|twitter:title)"\s+content=")([^"]*)(")/gi, (m, a, t, b) => a + fixName(t) + b)
    .replace(/(<meta\s+(?:property|name)="(?:og:site_name|application-name|apple-mobile-web-app-title)"\s+content=")([^"]*)(")/gi, `$1${NAME}$3`)
    .replace(/"@type": "(WebSite|Organization)", "name": "MixAll", "alternateName": \[/g, `"@type": "$1", "name": "${NAME}", "alternateName": ["MixAll", "MixAll+", "MixAll 二世代", "ミックスオールプラス", `);
}

// 検索・SNS向けのタグを補う（ページに既にあるものは触らない）
const BASE_KEYWORDS = [NAME, 'MixAll 二世代', 'MixAll+', 'MixAll プラス', 'ミックスオールプラス', 'MixAll', 'ミックスオール', '二世代'];
const SECTION_KEYWORDS = {
  '': ['掲示板', 'チャット', 'SNS', 'コミュニティ', '無料'],
  Uch: ['Uch', '掲示板', '匿名掲示板', 'スレッド'],
  Pocket: ['ぽけっと', 'チャット', 'グループチャット', '通話'],
  Ghost: ['Ghost', 'SNS', 'タイムライン', '投稿', 'ショート動画'],
  Mail: ['Mail', 'メール', 'Webメール'],
  Create: ['Creator Studio', '画像作成', '作品'],
  Custom: ['Custom', '3Dワールド', 'HTMLゲーム'],
  Tools: ['ツール', '便利ツール', '画像変換'],
  Calendar: ['共有カレンダー', '予定表'],
  Coin: ['Mcコイン', 'みつばち', '仕事掲示板'],
  Language: ['特殊言語', '辞書'],
  Extensions: ['拡張機能'],
  lending: ['貸し出しサーバー'],
  Fomasu: ['ふぉます', 'マッチング'],
  Kodomiru: ['コドミル', '見守り', 'ペアレンタルコントロール'],
  school: ['学校モード', 'クラスルーム', 'クイズ'],
  Wiki: ['Wiki', 'みんなのWiki'],
  MAWS: ['MAWS', 'Web検索'],
  Store: ['アプリストア']
};
function keywordsFor(rel) {
  const top = rel.includes('/') ? rel.split('/')[0] : '';
  return [...new Set([...BASE_KEYWORDS, ...(SECTION_KEYWORDS[top] || SECTION_KEYWORDS[''])])].join(',');
}
const NOINDEX = new Set(['404.html', 'site-view/index.html', 'downloads/mixall-emergency.html']);
// ログインしないと中身が見られない・個人用のページは検索に出さない
const PRIVATE_PAGES = new Set(['account/index.html', 'admin/index.html', 'admin/ghost-age.html', 'age.html', 'reset-password/index.html', 'Webhook/index.html', 'unlock/index.html',
  'Mail/index.html', 'Mail/thread.html', 'Pocket/index.html', 'Pocket/room.html', 'Pocket/thread.html', 'Pocket/stamps.html', 'Notifications/index.html', 'Uch/approvals.html',
  'Ghost/compose.html', 'Ghost/notifications.html', 'Ghost/bookmarks.html', 'Ghost/chat.html', 'Ghost/stamps.html', 'Coin/index.html', 'lending/index.html', 'Custom/builder.html',
  'school/classroom/index.html', 'Kodomiru/index.html', 'Fomasu/index.html']);
// ?id= などで中身が変わるページは、正規URLを1つに決められないので canonical を付けない
const QUERY_PAGES = new Set(['Ghost/post.html', 'Ghost/profile.html', 'Ghost/watch.html', 'Ghost/chat.html', 'Ghost/live.html', 'Ghost/sound.html', 'Pocket/room.html', 'Pocket/thread.html', 'Uch/thread.html', 'Mail/thread.html', 'Custom/room.html', 'Custom/builder.html', 'Custom/play.html']);
function attr(value) { return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

// rel はサイト直下からのパス（大文字小文字は GitHub 版の Ghost/ にそろえる）
export function seoTags(html, rel, site) {
  if (!/<head[^>]*>/i.test(html)) return html;
  rel = rel.replace(/^ghost\//, 'Ghost/');
  const add = [];
  const url = `${site}/${rel.replace(/(^|\/)index\.html$/, '$1')}`;
  // 友人のドメイン用の確認タグ・正規URLは外す（こちらのURLで付け直す）
  html = html.replace(/<meta name="google-site-verification"[^>]*>/gi, '').replace(/<link rel="canonical"[^>]*>/gi, '');
  if (NOINDEX.has(rel)) {
    if (!/name="robots"/i.test(html)) add.push('<meta name="robots" content="noindex">');
  } else {
    if (!/name="robots"/i.test(html)) add.push(PRIVATE_PAGES.has(rel) ? '<meta name="robots" content="noindex, follow">' : '<meta name="robots" content="index, follow, max-image-preview:large">');
    if (/property="og:title"/i.test(html) && !/property="og:site_name"/i.test(html)) add.push(`<meta property="og:site_name" content="${NAME}">`);
    if (!/name="keywords"/i.test(html)) add.push(`<meta name="keywords" content="${attr(keywordsFor(rel))}">`);
    else html = html.replace(/(<meta name="keywords" content=")([^"]*)/i, (m, a, k) => a + attr([...new Set([...BASE_KEYWORDS, ...k.split(/[,、]/).map((s) => s.trim()).filter(Boolean)])].join(',')));
    if (!QUERY_PAGES.has(rel)) add.push(`<link rel="canonical" href="${attr(url)}">`);
    if (!/name="description"/i.test(html)) {
      const og = /property="og:description"\s+content="([^"]*)"/i.exec(html);
      if (og) add.push(`<meta name="description" content="${og[1]}">`);
    }
  }
  return add.length ? html.replace(/<\/head>/i, `${add.join('')}</head>`) : html;
}

// 検索エンジン用サイトマップ（ログインなしで中身が見えるページだけ）
export function sitemap(site) {
  const today = new Date().toISOString().slice(0, 10);
  const publicPages = ['/', '/login/', '/register/', '/emergency.html', '/Uch/', '/Ghost/', '/Ghost/videos.html', '/Tools/', '/Create/', '/Custom/', '/Calendar/', '/Language/',
    '/Extensions/', '/Wiki/', '/MAWS/', '/Store/', '/school/', '/app/', '/company/', '/terms/', '/privacy/'];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${publicPages.map((p) => `  <url><loc>${site}${p}</loc><lastmod>${today}</lastmod>${p === '/' ? '<priority>1.0</priority>' : ''}</url>`).join('\n')}
</urlset>
`;
}
