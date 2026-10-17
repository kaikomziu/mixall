const crypto = require('crypto');
const { STORE_NAMES, getJSON, setJSON, deleteKey, listKeys } = require('../lib/store');
const { requireSession } = require('../lib/session');
const { callGemini } = require('../lib/gemini');
const { PublicSiteError, parseAllowedUrl, resolvePublicAddresses, requestPublicResource, crawlPublicSite } = require('../lib/public-site-source');

const MAX_TEXT = 12000;
const now = () => Date.now();
const id = (n = 12) => crypto.randomBytes(n).toString('hex');
const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'Access-Control-Allow-Origin':'*' }, body:JSON.stringify(body) });
const asText = (v, n = MAX_TEXT) => String(v || '').trim().slice(0, n);
const parse = (event) => event.httpMethod === 'GET' ? (event.queryStringParameters || {}) : JSON.parse(event.body || '{}');


function buildRedirectBase(event) {
  // 公開サイト（GitHub Pages）の /r/<id> は 404.html からこのAPIへ転送される
  if (process.env.MIXALL_SITE_URL) return String(process.env.MIXALL_SITE_URL).replace(/\/$/, '');
  const headers = event.headers || {};
  const host = headers['x-forwarded-host'] || headers.host || '';
  const proto = headers['x-forwarded-proto'] || 'https';
  if (!/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) return 'https://mix-alls.netlify.app';
  return `${proto}://${host}`;
}

async function publicHttpUrl(raw) {
  const url = parseAllowedUrl(raw, { allowHttp: true });
  await resolvePublicAddresses(url);
  return url;
}
async function callAi(prompt, system, maxOutputTokens = 900) {
  const result = await callGemini({ model:'gemini-3.6-flash', timeoutMs:24000, body:{ systemInstruction:{parts:[{text:system}]}, contents:[{role:'user',parts:[{text:String(prompt).slice(0,7000)}]}], generationConfig:{maxOutputTokens,temperature:0.8} } });
  if (!result.ok) throw new Error(result.error || 'AIの応答を取得できませんでした');
  return result.data.candidates?.[0]?.content?.parts?.map(x => x.text || '').join('').trim() || '回答を生成できませんでした。';
}
async function expiredRecord(store, key) {
  const item = await getJSON(store, key);
  if (item && Number(item.expiresAt) <= now()) { await deleteKey(store,key); return null; }
  return item;
}
async function rateLimit(namespace, key, intervalMs) {
  const hash = crypto.createHash('sha256').update(String(key || 'unknown')).digest('hex').slice(0,24);
  const k = `${namespace}:${hash}`;
  const previous = await getJSON(STORE_NAMES.TOOL_DATA,k);
  if (previous && now()-Number(previous.at)<intervalMs) return false;
  await setJSON(STORE_NAMES.TOOL_DATA,k,{at:now()});
  return true;
}
async function readLimited(response, maxBytes) {
  if(!response.body)return '';
  const reader=response.body.getReader(),parts=[];let size=0;
  try { while(size<maxBytes){const {done,value}=await reader.read();if(done)break;const take=value.subarray(0,Math.max(0,maxBytes-size));if(take.length){parts.push(Buffer.from(take));size+=take.length;}if(take.length<value.length){await reader.cancel();break;}} }
  finally { try{reader.releaseLock();}catch{} }
  return Buffer.concat(parts,size).toString('utf8');
}

exports.handler = async (event) => {

  if (event.httpMethod === 'OPTIONS') return { statusCode:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'} };
  if (!['GET','POST'].includes(event.httpMethod)) return json(405,{error:'GET/POSTのみ対応しています'});
  let p; try { p=parse(event); } catch { return json(400,{error:'リクエスト形式が不正です'}); }
  const action=String(p.action||'');
  const ip=event.headers?.['x-nf-client-connection-ip'] || event.headers?.['x-forwarded-for']?.split(',')[0] || 'unknown';
  try {
    if (event.httpMethod === 'GET') {
      if (action === 'boxInfo') {
        const slug=asText(p.slug,32).toLowerCase(); const box=await getJSON(STORE_NAMES.ANON_BOXES,`box:${slug}`);
        return box?json(200,{box:{slug:box.slug,displayName:box.displayName,message:String(box.message||'')},messages:undefined}):json(404,{error:'ボックスが見つかりません'});
      }
      if (action === 'inbox') {
        const email=await requireSession(p.token); if(!email)return json(401,{error:'ログインしてください'});
        const box=await getJSON(STORE_NAMES.ANON_BOXES,`owner:${email}`); if(!box)return json(200,{box:null,messages:[]});
        const rows=await getJSON(STORE_NAMES.ANON_BOXES,`messages:${box.slug}`)||[];
        return json(200,{box:{slug:box.slug,displayName:box.displayName},messages:rows.slice(-300).reverse()});
      }
      if (action === 'roomGet') {
        const room=await expiredRecord(STORE_NAMES.TEMP_ROOMS,`room:${asText(p.id,32)}`); return room?json(200,{room}):json(404,{error:'チャットルームは存在しないか、有効期限が切れました'});
      }
      if (action === 'lockerGet') {
        const item=await expiredRecord(STORE_NAMES.TEMP_SHARES,`share:${asText(p.id,32)}`); if(!item)return json(404,{error:'共有データは存在しないか、有効期限が切れました'});
        return json(200,{item:{id:item.id,name:item.name,type:item.type,text:item.text||'',dataUrl:item.dataUrl||'',expiresAt:item.expiresAt,createdAt:item.createdAt}});
      }
      if (action === 'wikiList') {
        const keys=await listKeys(STORE_NAMES.WIKI,'wiki:'); const pages=[];
        for(const key of keys){const item=await getJSON(STORE_NAMES.WIKI,key);if(item&&!item.deleted)pages.push({id:item.id,title:item.title,summary:item.summary,updatedAt:item.updatedAt,authorName:item.authorName});}
        return json(200,{pages:pages.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)))});
      }
      if (action === 'wikiGet') { const item=await getJSON(STORE_NAMES.WIKI,`wiki:${asText(p.id,32)}`); if(!item||item.deleted)return json(404,{error:'ページがありません'});const {ownerEmail,...publicPage}=item;return json(200,{page:publicPage}); }
      return json(400,{error:'不明なactionです'});
    }

    // Public, capability-URL operations do not require account login.
    // Permanent redirect records are public by URL and intentionally have no expiresAt.
    if (action === 'redirectGet') {
      const redirectId = asText(p.id, 64);
      if (!/^[a-f0-9]{24,64}$/.test(redirectId)) return json(400, {error:'リダイレクトIDが不正です'});
      const item = await getJSON(STORE_NAMES.TOOL_DATA, `redirect:${redirectId}`);
      if (!item || item.deleted) return { statusCode:404, headers:{'Content-Type':'text/plain; charset=utf-8'}, body:'リダイレクト先が見つかりません' };
      const target = String(item.target || '');
      if (/^https?:\/\//i.test(target)) return { statusCode:302, headers:{Location:target, 'Cache-Control':'public, max-age=300'}, body:'' };
      if (/^data:[^\s]+$/i.test(target)) {
        const escaped = target.replace(/\\/g,'\\\\').replace(/`/g,'\\`').replace(/</g,'%3C');
        return { statusCode:200, headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=300','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'"}, body:`<!doctype html><meta charset="utf-8"><title>MixAll redirect</title><p>移動しています…</p><script>location.replace(\`${escaped}\`)</script>` };
      }
      return { statusCode:400, headers:{'Content-Type':'text/plain; charset=utf-8'}, body:'対応していないリダイレクト先です' };
    }
    if (action === 'anonSend') {
      if(!await rateLimit('anon',ip,5000))return json(429,{error:'送信が早すぎます。少し待ってください'});
      const slug=asText(p.slug,32).toLowerCase(); const box=await getJSON(STORE_NAMES.ANON_BOXES,`box:${slug}`); if(!box)return json(404,{error:'ボックスが見つかりません'});
      const text=asText(p.text,1200);if(!text)return json(400,{error:'メッセージを入力してください'});
      const key=`messages:${slug}`;const rows=await getJSON(STORE_NAMES.ANON_BOXES,key)||[];rows.push({id:id(8),text,createdAt:new Date().toISOString()});await setJSON(STORE_NAMES.ANON_BOXES,key,rows.slice(-500));return json(201,{ok:true});
    }
    if (action === 'roomCreate') {
      if(!await rateLimit('roomcreate',ip,4000))return json(429,{error:'ルーム作成の間隔を空けてください'});
      const roomId=id(9);const room={id:roomId,title:asText(p.title,80)||'一時チャット',messages:[],createdAt:now(),expiresAt:now()+6*60*60*1000};await setJSON(STORE_NAMES.TEMP_ROOMS,`room:${roomId}`,room);return json(201,{room});
    }
    if (action === 'roomPost') {
      if(!await rateLimit('room',`${ip}:${p.id}`,700))return json(429,{error:'少し待ってから送信してください'});
      const room=await expiredRecord(STORE_NAMES.TEMP_ROOMS,`room:${asText(p.id,32)}`);if(!room)return json(404,{error:'チャットルームは存在しないか、有効期限が切れました'});
      const text=asText(p.text,1000),name=asText(p.name,32)||'ゲスト';if(!text)return json(400,{error:'メッセージを入力してください'});
      room.messages.push({id:id(8),name,text,createdAt:new Date().toISOString()});room.messages=room.messages.slice(-400);await setJSON(STORE_NAMES.TEMP_ROOMS,`room:${room.id}`,room);return json(201,{room});
    }
    if (action === 'lockerCreate') {
      if(!await rateLimit('lockercreate',ip,5000))return json(429,{error:'共有リンク発行の間隔を空けてください'});
      const text=String(p.text||'');const dataUrl=String(p.dataUrl||'');if(text.length>30000||dataUrl.length>5*1024*1024)return json(413,{error:'テキストは3万文字、ファイルは約3.5MBまでです'});if(!text&&!dataUrl)return json(400,{error:'共有するテキストかファイルを選択してください'});
      if(dataUrl){const match=dataUrl.match(/^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([a-z0-9+/=\r\n]+)$/i);if(!match||/^(text\/html|application\/(?:xhtml\+xml|javascript|ecmascript)|image\/svg\+xml)$/i.test(match[1])||match[2].replace(/\s/g,'').length%4!==0)return json(400,{error:'この形式のファイルは共有できません'});}
      const shareId=id(16),hours=Math.min(24,Math.max(1,Number(p.hours)||6));const item={id:shareId,name:asText(p.name,120)||'共有ファイル',type:asText(p.type,100)||'text/plain',text,dataUrl,createdAt:now(),expiresAt:now()+hours*60*60*1000};await setJSON(STORE_NAMES.TEMP_SHARES,`share:${shareId}`,item);return json(201,{id:shareId,expiresAt:item.expiresAt,url:`/Tools?locker=${shareId}`});
    }
    if (action === 'lockerDelete') { await deleteKey(STORE_NAMES.TEMP_SHARES,`share:${asText(p.id,32)}`);return json(200,{ok:true}); }

    const email=await requireSession(p.token);if(!email)return json(401,{error:'この機能にはログインが必要です'});
    if (action === 'redirectCreate' || action === 'xgdShorten') {
      const target = String(p.target || '').trim();
      if (!target) return json(400,{error:'短縮するURLまたはData URLを入力してください'});
      if (!/^(?:https?:\/\/|data:[^\s]+$)/i.test(target)) return json(400,{error:'http(s):// または data: URL のみ対応しています'});
      if (!await rateLimit('redirect-create',email,1500)) return json(429,{error:'短縮URLの発行間隔を空けてください'});
      const redirectId = id(16);
      const record = { id:redirectId, target, createdAt:new Date().toISOString(), createdBy:email, deleted:false };
      await setJSON(STORE_NAMES.TOOL_DATA, `redirect:${redirectId}`, record);
      const redirectUrl = `${buildRedirectBase(event)}/r/${redirectId}`;
      if (action === 'redirectCreate') return json(201,{ok:true,id:redirectId,url:redirectUrl,permanent:true});
      const apiKey = String(process.env.XGD_API_KEY || '').trim();
      if (!/^[0-9a-f]{32}$/i.test(apiKey)) return json(503,{error:'x.gd APIキーの設定が不正なため、x.gd短縮URLを発行できませんでした。'});
      const xgd = new URL('https://xgd.io/V1/shorten');
      xgd.searchParams.set('url',redirectUrl); xgd.searchParams.set('key',apiKey); xgd.searchParams.set('analytics','true'); xgd.searchParams.set('filterbots','true');
      const response = await fetch(xgd,{method:'GET',headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});
      const result = await response.json().catch(()=>({}));
      if (!response.ok || Number(result.status) !== 200 || !result.shorturl) return json(Number(result.status)||502,{error:result.message||'x.gdで短縮URLを発行できませんでした'});
      await setJSON(STORE_NAMES.TOOL_DATA, `redirect:${redirectId}`, {...record,xgdUrl:result.shorturl,xgdCreatedAt:new Date().toISOString()});
      return json(201,{ok:true,id:redirectId,redirectUrl,shortUrl:result.shorturl,permanent:true,analytics:result.analytics});
    }
    if(action==='siteSource'){
      const raw=asText(p.url,2048);if(!raw)return json(400,{error:'サイトURLを入力してください'});
      if(!await rateLimit('site-source',`${email}:${ip}`,30000))return json(429,{error:'サイト取得は30秒以上間隔を空けてください'});
      const result=await crawlPublicSite(raw);
      return json(200,result);
    }
    if(action==='boxCreate'){
      const slug=asText(p.slug,32).toLowerCase();if(!/^[a-z0-9][a-z0-9-]{2,30}$/.test(slug))return json(400,{error:'URL IDは英小文字・数字・ハイフンの3〜31文字にしてください'});
      const owned=await getJSON(STORE_NAMES.ANON_BOXES,`owner:${email}`);if(owned&&owned.slug!==slug)return json(409,{error:`すでに匿名箱があります: ${owned.slug}。既存の受信ページを利用してください。`});
      const existing=await getJSON(STORE_NAMES.ANON_BOXES,`box:${slug}`);if(existing&&existing.ownerEmail!==email)return json(409,{error:'このURL IDは使用されています'});
      const box={slug,ownerEmail:email,displayName:asText(p.displayName,60)||email.split('@')[0],message:asText(p.message,200),createdAt:existing?.createdAt||new Date().toISOString()};await setJSON(STORE_NAMES.ANON_BOXES,`box:${slug}`,box);await setJSON(STORE_NAMES.ANON_BOXES,`owner:${email}`,box);return json(200,{box:{slug,displayName:box.displayName,message:box.message},url:`/Tools?anon=${slug}`});
    }
    if(action==='inboxDelete'){
      const box=await getJSON(STORE_NAMES.ANON_BOXES,`owner:${email}`);if(!box)return json(404,{error:'ボックスがありません'});const key=`messages:${box.slug}`,rows=await getJSON(STORE_NAMES.ANON_BOXES,key)||[];await setJSON(STORE_NAMES.ANON_BOXES,key,rows.filter(x=>x.id!==p.messageId));return json(200,{ok:true});
    }
    if(action==='counsel'){
      const text=asText(p.text,2500);if(!text)return json(400,{error:'相談内容を入力してください'});
      const character=['tsundere','kansai','philosopher','gentle'].includes(p.character)?p.character:'gentle';
      const personas={tsundere:'少しツンデレだが、相手を傷つけず親身な日本語の相談相手。照れ隠しの短い言い回しはよいが、侮辱しない。',kansai:'自然な関西弁で話す、温かく現実的な相談相手。決めつけず、質問を一つ添える。',philosopher:'哲学的な問い返しで視点を広げる相談相手。難解にしすぎず、具体的な一歩に戻す。',gentle:'穏やかで共感的な相談相手。まず気持ちを受け止め、選択肢と小さな次の一歩を提案する。'};
      const answer=await callAi(text,`${personas[character]} 医師・弁護士・専門家の診断を装わず、危険を断定しない。自傷・虐待・差し迫った危険が示唆されたら、責めずに安全な場所へ移動し、信頼できる人や日本の緊急窓口へ今すぐ相談するよう勧める。緊急時は119/110。個人情報を尋ねない。`,950);return json(200,{answer});
    }
    if(action==='recommend'){
      const likes=Array.isArray(p.likes)?p.likes.map(x=>asText(x,120)).filter(Boolean).slice(0,15):[];if(!likes.length)return json(400,{error:'好きな作品を1つ以上登録してください'});
      const answer=await callAi(`好きな作品: ${likes.join('、')}\nジャンル: ${asText(p.kind,40)||'映画・本どちらでも'}\n既出候補: ${asText(p.exclude,600)}`, '日本語の作品レコメンド担当。好みの共通点を短く推定し、実在する映画・小説・漫画から新しいおすすめを最大5件、作品名・作者/監督・選んだ理由の形式で提案する。確信のない作品情報を捏造せず、推測はその旨を示す。',1000);return json(200,{answer});
    }
    if(action==='meal'){
      const foods=asText(p.foods,1200);if(!foods)return json(400,{error:'食材名を入力してください'});
      const answer=await callAi(`食材: ${foods}\n期限が近い食材: ${asText(p.soon,600)}\n避けたい食材: ${asText(p.avoid,300)}`, '家庭向け献立提案。入力食材を優先し、簡単な料理を最大3案、材料・手順・目安時間付きで日本語回答。アレルギーを推測せず、食品安全や栄養について医療的な断定をしない。',900);return json(200,{answer});
    }
    if(action==='wikiCreate'||action==='wikiUpdate'||action==='wikiDelete'){
      const pageId=asText(p.id,32)||id(8);let page=await getJSON(STORE_NAMES.WIKI,`wiki:${pageId}`);
      if(action!=='wikiCreate'&&(!page||page.deleted))return json(404,{error:'ページがありません'});
      if(page&&page.ownerEmail!==email)return json(403,{error:'作成者のみ編集できます'});
      if(action==='wikiDelete'){page.deleted=true;page.updatedAt=new Date().toISOString();await setJSON(STORE_NAMES.WIKI,`wiki:${pageId}`,page);return json(200,{ok:true});}
      const title=asText(p.title,120),body=asText(p.body,15000);if(!title||!body)return json(400,{error:'タイトルと本文が必要です'});
      page={id:pageId,title,body,summary:asText(body.replace(/[#*_`>\n]/g,' '),180),ownerEmail:email,authorName:email.split('@')[0],createdAt:page?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),deleted:false};await setJSON(STORE_NAMES.WIKI,`wiki:${pageId}`,page);return json(200,{page});
    }
    if(action==='linkCheck'){
      const raw=asText(p.url,2048);if(!raw)return json(400,{error:'URLを入力してください'});const base=await publicHttpUrl(raw);
      const response=await requestPublicResource(base,{allowHttp:true,maxRedirects:0,maxBytes:500000,timeoutMs:8000});
      if(response.status!==200&&response.status!==206)return json(200,{ok:false,status:response.status,error:`トップページ取得失敗 (HTTP ${response.status})`});
      const source=response.body.toString('utf8');
      const links=[...source.matchAll(/\b(?:href|src)\s*=\s*(["'])(.*?)\1/gi)].map(m=>m[2]).filter(h=>h&&!h.startsWith('#')&&!/^(javascript:|mailto:|tel:|data:)/i.test(h));const uniq=[...new Set(links)].slice(0,25),results=[];
      for(const href of uniq){try{const u=new URL(href,response.url);if(!['http:','https:'].includes(u.protocol))continue;await publicHttpUrl(u.href);let r=await requestPublicResource(u,{allowHttp:true,method:'HEAD',maxRedirects:0,maxBytes:0,timeoutMs:5000});if(r.status===405||r.status===501)r=await requestPublicResource(u,{allowHttp:true,method:'GET',maxRedirects:0,maxBytes:0,timeoutMs:5000});results.push({url:u.href,status:r.status,ok:r.status>=200&&r.status<300});}catch(e){results.push({url:href,status:0,ok:false,error:e.message||'接続に失敗しました'});}}
      return json(200,{url:`${base.origin}${base.pathname}`,checked:results.length,results});
    }
    return json(400,{error:'不明なactionです'});
  } catch(error){console.error('tools function error',action,error);const status=error instanceof PublicSiteError?error.statusCode:(action==='linkCheck'||action==='siteSource'?400:500);return json(status,{error:error.message||'内部エラー'});}
};
