// /site-view/(slug) serves user HTML only inside a sandboxed iframe.
const { STORE_NAMES, getJSON } = require('../lib/store');
const { getSessionInfo } = require('../lib/session');
const { canViewAgeReviewed } = require('../lib/ghost-age');

function escapeAttr(value) { return String(value).replace(/&/g,'&amp;').replace(/"/g,'&quot;'); }
function escapeScriptString(value) { return JSON.stringify(String(value)).replace(/<\//g,'<\\/'); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function ogpHead(site, slug) { const title=escapeHtml(site.title || slug || 'MixAllサイト'); const description=escapeHtml(site.description || site.summary || 'MixAllで公開されているサイト'); const image='https://mix-alls.netlify.app/ogp/14-website-creation.jpg?v=20261013-1'; return `<meta property="og:type" content="website"><meta property="og:site_name" content="MixAll"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:image" content="${image}"><meta property="og:image:secure_url" content="${image}"><meta property="og:image:type" content="image/jpeg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="MixAllサイト - ${title}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${image}">`; }
// GitHub Pages + Supabase版: サイト内リンクは公開サイトのベースパス、API呼び出しはEdge FunctionのURLへ向ける
function rebase(body) {
  const site = String(process.env.MIXALL_SITE_URL || '').replace(/\/$/, '');
  const sitePath = site ? new URL(site).pathname.replace(/\/$/, '') : '';
  const api = String(process.env.MIXALL_API_BASE || '/.netlify/functions').replace(/\/$/, '');
  let out = String(body).split('/.netlify/functions/').join(`${api}/`);
  if (site) out = out.split('https://mix-alls.netlify.app').join(site);
  return out
    .split('href="/"').join(`href="${sitePath}/"`)
    .split('href="/login/').join(`href="${sitePath}/login/`)
    .split('%2Fsite-view%2F').join(encodeURIComponent(`${sitePath}/site-view/`));
}
function html(statusCode, body) { return { statusCode, headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}, body: rebase(body) }; }
function json(statusCode, body) { return { statusCode, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}, body:JSON.stringify(body) }; }
function slugOf(event,payload={}) {
  const qs=event.queryStringParameters||{};let raw=payload.slug||qs.slug||'';
  if(!raw&&event.path){const parts=event.path.split('/').filter(Boolean);const last=parts[parts.length-1]||'';if(last!=='site-view')raw=last;}
  return String(raw).toLowerCase().replace(/[^a-z0-9-]/g,'');
}
function isAgeGated(site) { return !site.ageReview || site.ageReview.status!=='reviewed' || (Array.isArray(site.ageReview.categories)&&site.ageReview.categories.length>0); }
function blockedPage(title, message) { return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${String(title||'サイト').replace(/</g,'&lt;')}</title><meta property="og:image" content="https://mix-alls.netlify.app/ogp/14-website-creation.jpg?v=20261013-1"></head><body style="font-family:sans-serif;background:#111;color:#eee;padding:24px"><h1>${String(title||'サイト').replace(/</g,'&lt;')}</h1><p>${message}</p><a href="/" style="color:#9cf">MixAllホームへ</a></body></html>`; }

function makeWrapper(site, slug) {
  let runtimeHtml=String(site.html||'')
    .replace(/Coin\+let\s+\$\{([A-Za-z0-9._-]{1,80})\}\{\/\[([A-Za-z0-9._-]{1,80})\]‹BoxMedia›\}/g,(_,scoreVariable,binding)=>`window.MixAllCoinScore(${scoreVariable},${escapeScriptString(binding)});`)
    .replace(/mail\?=\/let\s+([A-Za-z0-9._-]{1,80})\s*;?/g,(_,binding)=>`window.MixAllBindMail(${escapeScriptString(binding)});`);
  if (!/<meta\s+[^>]*property=[\"']og:image[\"']/i.test(runtimeHtml)) {
    const fallback=ogpHead(site,slug);
    runtimeHtml=runtimeHtml.includes('</head>') ? runtimeHtml.replace('</head>',fallback+'</head>') : `<!doctype html><html lang=\"ja\"><head><meta charset=\"utf-8\">${fallback}</head><body>${runtimeHtml}</body></html>`;
  }
  const runtimeBridge=`<script>window.MixAllBindMail=()=>{};window.MixAllCoinScore=(score,binding)=>{const amount=Math.floor(Number(score));if(!Number.isFinite(amount)||amount<=0||amount>100000)return;const nonce=(crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random()).replace(/[^A-Za-z0-9_-]/g,'');parent.postMessage({type:'mixall-coin-claim',slug:${escapeScriptString(slug)},amount,binding:String(binding||''),nonce},'*');};</script>`;
  const safeTitle=String(site.title||slug).replace(/</g,'&lt;');
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle} - site-view/${slug}</title>${ogpHead(site, slug)}<style>html,body{margin:0;height:100%;background:#0f1115}iframe{width:100%;height:100%;border:0}</style></head><body><iframe id="siteFrame" sandbox="allow-scripts allow-forms allow-popups" srcdoc="${escapeAttr(runtimeHtml.includes('</head>')?runtimeHtml.replace('</head>',runtimeBridge+'</head>'):runtimeHtml+runtimeBridge)}"></iframe><script>window.addEventListener('message',async(event)=>{if(!event.data||event.data.type!=='mixall-coin-claim'||event.source!==document.getElementById('siteFrame').contentWindow)return;try{const raw=localStorage.getItem('netrify_session');const session=raw?JSON.parse(raw):null;if(!session?.token)return;await fetch('/.netlify/functions/lending',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'claimCoin',token:session.token,slug:event.data.slug,amount:event.data.amount,binding:event.data.binding,nonce:event.data.nonce})});}catch(_){}});</script></body></html>`;
}
function makeAgeGate(site,slug) {
  const title=String(site.title||slug).replace(/</g,'&lt;');
  const message='このサイトは年齢に応じた表示制限があります。ログイン中のアカウントの年齢を確認しています。';
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · 年齢確認</title>${ogpHead(site, slug)}</head><body style="font-family:sans-serif;background:#111;color:#eee;padding:24px"><h1>${title}</h1><p id="status">${message}</p><p><a id="login" href="/login/?next=${encodeURIComponent(`/site-view/${slug}`)}" style="color:#9cf">ログイン</a></p><script>(async()=>{const status=document.getElementById('status');try{const session=JSON.parse(localStorage.getItem('netrify_session')||'null');if(!session?.token)return;const response=await fetch('/.netlify/functions/site-view',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'serve',slug:${escapeScriptString(slug)},token:session.token})});if(!response.ok){let message='年齢制限により表示できません。';try{message=(await response.json()).error||message}catch(_){}status.textContent=message;return;}const page=await response.text();document.open();document.write(page);document.close();}catch(error){status.textContent='年齢確認に失敗しました。ログイン状態を確認して再読み込みしてください。';}})();</script></body></html>`;
}

exports.handler=async(event)=>{

  const lockState=await getJSON(STORE_NAMES.SITE_STATE,'global');
  if(lockState?.locked===true)return html(503,blockedPage('保護ロック中','データ保護のため、現在この公開サイトは停止しています。'));
  let payload={};
  if(event.httpMethod==='POST'){try{payload=JSON.parse(event.body||'{}')}catch{return json(400,{error:'不正なリクエストです'});}}
  const slug=slugOf(event,payload);
  if(!slug)return html(404,blockedPage('サイトが見つかりません','有効な識別子がありません。'));
  const site=await getJSON(STORE_NAMES.LENDING_SITES,slug);
  if(!site)return html(404,blockedPage('このサイトはまだ存在しません','指定されたサイトは見つかりませんでした。'));
  if(site.programReview?.human?.decision==='block')return html(451,blockedPage(site.title||slug,'運営のプログラム審査により、このサイトは停止されています。'));
  if(site.programReview?.ai?.holdPublic===true&&site.programReview?.human?.decision!=='approve')return html(451,blockedPage(site.title||slug,'AIの安全性審査で要確認となったため、運営の確認が完了するまで公開を保留しています。'));
  if(event.httpMethod==='POST'&&payload.action==='serve'){
    const viewer=await getSessionInfo(payload.token);
    if(!viewer)return json(401,{error:'年齢確認にはログインが必要です。'});
    if(!canViewAgeReviewed(site,viewer.age))return json(403,{error:'申告年齢に基づくGhostと同じ年齢制限により、このサイトは表示できません。'});
    return html(200,makeWrapper(site,slug));
  }
  if(isAgeGated(site))return html(200,makeAgeGate(site,slug));
  return html(200,makeWrapper(site,slug));
};
