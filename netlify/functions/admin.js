const crypto = require('crypto');
const { STORE_NAMES, getJSON, setJSON, deleteKey, listKeys } = require('../lib/store');
const { sourceForAdmin, cleanCategories, monthKey } = require('../lib/program-review');
const { requireAdmin, getAccountProfile } = require('../lib/session');
const { getAgeFromBirthDate, isValidBirthDate } = require('../lib/ghost-age');
const { getEmailSettings } = require('../lib/email-integration');

function json(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body)
  };
}

function newId() {
  return crypto.randomBytes(10).toString('hex');
}

function publicAccount(account, email) {
  return {
    email,
    displayName: account && account.displayName ? account.displayName : email.split('@')[0],
    isAdmin: Boolean(account && account.isAdmin === true),
    isDeputyAdmin: Boolean(account && account.isDeputyAdmin === true),
    isOfficial: Boolean(account && (account.isOfficial === true || account.isAdmin === true)),
    createdAt: account ? account.createdAt : null
  };
}

// 主運営・副運営はいずれも同じ運営権限を持つ。
function canManageAdminRoles(account) { return Boolean(account && (account.isAdmin === true || account.isDeputyAdmin === true)); }

async function readAll(storeName, limit = 300) {
  const keys = (await listKeys(storeName)).slice(0, limit);
  const values = await Promise.all(keys.map(async (key) => {
    try { return await getJSON(storeName, key); } catch (error) { console.error(`admin read failed: ${storeName}/${key}`, error); return null; }
  }));
  return values.filter(Boolean);
}

async function safeReadAll(storeName) {
  try { return await readAll(storeName); }
  catch (error) { console.error(`admin snapshot store failed: ${storeName}`, error); return []; }
}

function auditAttachment(message) {
  const attachment = message?.deleted ? (message.deletedAttachment || message.attachment) : message?.attachment;
  if (!attachment || typeof attachment !== 'object') return null;
  const safe = { ...attachment };
  delete safe.dataUrl;
  if (typeof safe.thumbnailDataUrl === 'string') safe.thumbnailDataUrl = safe.thumbnailDataUrl.slice(0, 130000);
  return safe;
}

async function getAuditMessageAttachment(roomId, messageId) {
  const room = await getJSON(STORE_NAMES.POCKET_ROOMS, roomId);
  if (!room) return { error:json(404,{error:'ルームが見つかりません'}) };
  const message = (room.messages || []).find((item) => item?.id === messageId);
  if (!message) return { error:json(404,{error:'メッセージが見つかりません'}) };
  const attachment = message.deleted ? (message.deletedAttachment || message.attachment) : message.attachment;
  if (!attachment) return { error:json(404,{error:'添付ファイルがありません'}) };
  return { room, message, attachment };
}

function parseDataUrl(value) {
  const match=String(value||'').match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]*)$/);
  return match ? { mimeType:match[1], data:match[2] } : null;
}

async function safeReadGhostPosts(limit = 300) {
  try {
    const keys = (await listKeys(STORE_NAMES.GHOST_POSTS)).filter((key) => !key.startsWith('media:')).slice(0, limit);
    const rows = [];
    for (const key of keys) {
      const post = await getJSON(STORE_NAMES.GHOST_POSTS, key);
      if (!post || post.id !== key) continue;
      rows.push({ ...post, media:[], mediaCount:Array.isArray(post.media) ? post.media.length : 0 });
    }
    return rows;
  } catch (error) { console.error('admin snapshot Ghost posts failed', error); return []; }
}

async function recordAudit(actorEmail, action, targetType, targetId, detail) {
  const entry = {
    kind: 'audit',
    id: newId(),
    actorEmail,
    action,
    targetType,
    targetId: String(targetId || '').slice(0, 180),
    detail: String(detail || '').slice(0, 1000),
    createdAt: new Date().toISOString()
  };
  await setJSON(STORE_NAMES.ADMIN_AUDIT, `audit:${entry.id}`, entry);
}

exports.handler = async (event) => {

  if (event.httpMethod !== 'POST') return json(405, { error: 'POSTのみ対応しています' });

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: '不正なリクエストです' });
  }

  try {
    const admin = await requireAdmin(payload.token);
    if (!admin) return json(403, { error: '運営アカウントのみ利用できます' });
    return await handle(payload, admin.email);
  } catch (err) {
    console.error('admin function error:', err);
    return json(500, { error: `内部エラー: ${err.message}` });
  }
};

function normalizeCommandTag(value) {
  const tag = String(value || '').trim().replace(/^#/, '');
  return /^[\p{L}\p{N}_-]{1,40}$/u.test(tag) ? tag : '';
}

async function saveCommandTag(actorEmail, input, mode) {
  const allKeys = await listKeys(STORE_NAMES.GHOST_TAGS, 'tag:');
  const allTags = [];
  for (const key of allKeys) { const value = await getJSON(STORE_NAMES.GHOST_TAGS, key); if (value) allTags.push(value); }
  const target = mode === 'edit' ? allTags.find((item) => item.id === input.id) : null;
  const tag = normalizeCommandTag(input.tag || target?.tag);
  if (!tag) throw new Error('タグ名は日本語・英数字・アンダースコア・ハイフンの1〜40文字で指定してください');
  if (allTags.some((item) => item.tag === tag && item.id !== target?.id)) throw new Error('同じタグが既に登録されています');
  const now = new Date().toISOString();
  const record = { id:target?.id || newId(), tag, description:String(input.description || '').trim().slice(0, 300), enabled:input.enabled !== false, order:Number.isFinite(Number(input.order)) ? Number(input.order) : (target?.order || 0), createdAt:target?.createdAt || now, updatedAt:now };
  if (target && target.tag !== tag) await deleteKey(STORE_NAMES.GHOST_TAGS, `tag:${target.id}`);
  await setJSON(STORE_NAMES.GHOST_TAGS, `tag:${record.id}`, record);
  await recordAudit(actorEmail, mode === 'edit' ? 'Ghostタグ更新(コマンド)' : 'Ghostタグ追加(コマンド)', 'ghostTag', record.id, `#${record.tag}`);
  return record;
}

async function compactNextGhostPost(actorEmail) {
  const keys = (await listKeys(STORE_NAMES.GHOST_POSTS)).filter((key) => !key.startsWith('media:'));
  for (const key of keys) {
    // Only primary post records carry id === key.
    const post = await getJSON(STORE_NAMES.GHOST_POSTS, key);
    if (!post || post.id !== key || post.deleted || !Array.isArray(post.media)) continue;
    const candidates = post.media.map((item, index) => ({ item, index })).filter(({ item }) =>
      (item?.kind === 'image' && typeof item.dataUrl === 'string' && item.dataUrl.startsWith('data:image/')) ||
      (item?.kind === 'videoFile' && typeof item.dataUrl === 'string' && item.dataUrl.startsWith('data:video/'))
    );
    if (!candidates.length) continue;

    const nextMedia = post.media.slice();
    let movedBytes = 0;
    for (const { item, index } of candidates) {
      const match = String(item.dataUrl).match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]*)$/);
      if (!match) throw new Error(`投稿 ${post.id} の添付 ${index + 1} の形式を判定できません`);
      const mimeType = match[1];
      const encoded = match[2];
      const fileId = `legacy_${crypto.createHash('sha256').update(`${post.id}:${index}`).digest('hex').slice(0, 32)}`;
      const chunkSize = 256 * 1024; // Base64の4文字境界に揃え、1 blobあたりを十分小さく保つ
      const totalChunks = Math.max(1, Math.ceil(encoded.length / chunkSize));
      // 直列書き込み。全チャンクが成功したあとでのみ投稿本体を軽量な参照に置き換える。
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
        const data = encoded.slice(chunkIndex * chunkSize, (chunkIndex + 1) * chunkSize);
        await setJSON(STORE_NAMES.GHOST_POSTS, `media:${fileId}:chunk:${chunkIndex}`, { index:chunkIndex, data });
      }
      await setJSON(STORE_NAMES.GHOST_POSTS, `media:${fileId}:meta`, {
        fileId, mimeType, totalChunks, chunkBytes:chunkSize * 3 / 4, sizeBytes:Buffer.from(encoded, 'base64').length, received:Array.from({ length:totalChunks }, (_, i) => i),
        complete:true, uploadedBy:post.authorEmail || 'legacy-migration', createdAt:new Date().toISOString()
      });
      movedBytes += Buffer.byteLength(item.dataUrl, 'utf8');
      const common = { fileId, mimeType, name:String(item.name || (item.kind === 'image' ? 'image' : 'video')).slice(0,120), size:Buffer.from(encoded, 'base64').length };
      nextMedia[index] = { kind:item.kind === 'image' ? 'imageBlob' : 'videoBlob', ...common };
    }
    post.media = nextMedia;
    post.storageCompactedAt = new Date().toISOString();
    await setJSON(STORE_NAMES.GHOST_POSTS, key, post);
    await recordAudit(actorEmail, 'ghostMediaCompact', 'ghostPost', post.id, `${candidates.length}件の添付をチャンク化、約${movedBytes} byteを投稿本体から分離`);
    return { migrated:true, postId:post.id, mediaCount:candidates.length, bytesMoved:movedBytes };
  }
  return { migrated:false };
}

function safeFileKey(value) {
  const key = String(value || '').trim();
  return /^[a-zA-Z0-9._-]{1,80}$/.test(key) && !key.includes('..') ? key : '';
}

async function handleFileCommand(actorEmail, parts, raw) {
  const action = parts[1];
  if (action === 'list') {
    const keys = (await listKeys(STORE_NAMES.ADMIN_FILES)).filter((key) => key.startsWith('file:')).map((key) => key.slice(5));
    await recordAudit(actorEmail, 'fileList', 'adminFile', '*', '運営コマンドで一覧取得');
    return json(200, { command:raw, output:keys.length ? keys.join('\\n') : 'アプリ管理ファイルはありません。' });
  }
  const key = safeFileKey(parts[2]);
  if (!key) return json(400, { error:'fileキーは英数字・ドット・ハイフン・アンダースコアの1〜80文字で指定してください' });
  if (action === 'read') {
    const value = await getJSON(STORE_NAMES.ADMIN_FILES, `file:${key}`);
    if (value === null) return json(404, { error:'ファイルが見つかりません' });
    await recordAudit(actorEmail, 'fileRead', 'adminFile', key, '運営コマンドで読み取り');
    return json(200, { command:raw, output:JSON.stringify(value, null, 2) });
  }
  if (action === 'write') {
    const rawValue = parts.slice(3).join(' ');
    if (Buffer.byteLength(rawValue, 'utf8') > 20000) return json(400, { error:'ファイル内容は20KB以内にしてください' });
    let value; try { value = JSON.parse(rawValue); } catch { value = { text:rawValue }; }
    await setJSON(STORE_NAMES.ADMIN_FILES, `file:${key}`, { key, value, updatedAt:new Date().toISOString(), updatedBy:actorEmail });
    await recordAudit(actorEmail, 'fileWrite', 'adminFile', key, '運営コマンドで書き込み');
    return json(200, { command:raw, output:`ファイルを書き込みました: ${key}` });
  }
  if (action === 'delete') {
    await deleteKey(STORE_NAMES.ADMIN_FILES, `file:${key}`);
    await recordAudit(actorEmail, 'fileDelete', 'adminFile', key, '運営コマンドで削除');
    return json(200, { command:raw, output:`ファイルを削除しました: ${key}` });
  }
  return json(400, { error:'形式: file list / file read キー / file write キー JSON / file delete キー' });
}

async function handle(payload, actorEmail) {
  const { action } = payload;
  if (action === 'preflight') return json(200,{ok:true});

  if (action === 'listProgramReviews') {
    const state = await getJSON(STORE_NAMES.GHOST_MODERATION,'program-review:state');
    const items=[];
    for (const [targetType,storeName] of [['custom',STORE_NAMES.CUSTOM_PROJECTS],['site',STORE_NAMES.LENDING_SITES]]) {
      for (const key of await listKeys(storeName)) {
        const item=await getJSON(storeName,key);
        const id=targetType==='site'?(item?.slug||key):(item?.id||key);
        if (!item || id!==key) continue;
        items.push({targetType,targetId:id,title:String(item.title||item.name||item.slug||id),ownerEmail:item.ownerEmail||'',updatedAt:item.updatedAt||item.createdAt||null,ageReview:item.ageReview||{status:'pending',categories:[]},programReview:item.programReview||{status:'pending'}});
      }
    }
    items.sort((a,b)=>Number((a.programReview?.human?.decision?1:0)) - Number((b.programReview?.human?.decision?1:0)) || String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
    return json(200,{items,state:state||{status:'not_started',month:monthKey()}});
  }
  if (action === 'getProgramReview') {
    const config=payload.targetType==='site'?STORE_NAMES.LENDING_SITES:payload.targetType==='custom'?STORE_NAMES.CUSTOM_PROJECTS:null;
    if(!config)return json(400,{error:'審査対象が不正です'});
    const targetId=String(payload.targetId||'').slice(0,100);const item=await getJSON(config,targetId);
    if(!item)return json(404,{error:'審査対象が見つかりません'});
    const source=sourceForAdmin(payload.targetType,item);let selectedFile=null;
    if(payload.targetType==='custom'&&payload.fileIndex!==undefined){if(payload.fileIndex==='visual'){const content=JSON.stringify({blocks:item.blocks||[],variables:item.variables||{},scene:item.scene||{}},null,2);selectedFile={path:'ビジュアルブロック／シーンJSON',content:content.slice(0,200000),truncated:content.length>200000};}else{const index=Number(payload.fileIndex);const file=Array.isArray(item.programFiles)?item.programFiles[index]:null;if(!Number.isInteger(index)||!file)return json(404,{error:'指定ファイルが見つかりません'});const content=String(file.content||'');selectedFile={path:String(file.path||`file-${index+1}`),content:content.slice(0,200000),truncated:content.length>200000};}}
    return json(200,{targetType:payload.targetType,targetId,title:String(item.title||item.name||item.slug||targetId),ownerEmail:item.ownerEmail||'',ageReview:item.ageReview||{status:'pending',categories:[]},programReview:item.programReview||{status:'pending'},...source,...(selectedFile?{selectedFile}:{})});
  }
  if (action === 'saveProgramReview') {
    const config=payload.targetType==='site'?STORE_NAMES.LENDING_SITES:payload.targetType==='custom'?STORE_NAMES.CUSTOM_PROJECTS:null;
    if(!config)return json(400,{error:'審査対象が不正です'});
    const targetId=String(payload.targetId||'').slice(0,100);const item=await getJSON(config,targetId);
    if(!item)return json(404,{error:'審査対象が見つかりません'});
    const decision=['approve','block'].includes(payload.decision)?payload.decision:'';
    if(!decision)return json(400,{error:'審査結果を選択してください'});
    const categories=cleanCategories(payload.categories);const now=new Date().toISOString();
    item.programReview=item.programReview||{};
    item.programReview.human={decision,status:'reviewed',categories,note:String(payload.note||'').slice(0,1000),reviewedBy:actorEmail,reviewedAt:now};
    item.programReview.status=decision==='block'?'blocked':'reviewed';
    item.ageReview={status:'reviewed',categories,reason:String(payload.note||'運営による手動確認').slice(0,500),source:'human-review',reviewedAt:now,reviewedBy:actorEmail};
    await setJSON(config,targetId,item);
    await recordAudit(actorEmail,'saveProgramReview',payload.targetType,targetId,`${decision}; categories=${categories.join(',')}; ${String(payload.note||'').slice(0,300)}`);
    return json(200,{ok:true,ageReview:item.ageReview,programReview:item.programReview});
  }
  if (action === 'roomAttachmentInfo' || action === 'roomAttachmentChunk') {
    const roomId=String(payload.roomId||'').slice(0,100),messageId=String(payload.messageId||'').slice(0,100);
    const found=await getAuditMessageAttachment(roomId,messageId);if(found.error)return found.error;
    const a=found.attachment;let info={name:String(a.name||'添付ファイル').slice(0,200),mimeType:String(a.type||a.mimeType||'application/octet-stream').slice(0,120),totalBytes:Number(a.sizeBytes)||0,source:'',totalChunks:0,previewDataUrl:typeof a.thumbnailDataUrl==='string'?a.thumbnailDataUrl:null};
    let inline=parseDataUrl(a.dataUrl);
    if(inline){info.source='inline';info.mimeType=inline.mimeType;info.totalBytes=Math.floor(inline.data.length*3/4);info.totalChunks=Math.max(1,Math.ceil(inline.data.length/1048576));}
    else if(a.fileId){
      const fileId=String(a.fileId).trim();const manifest=await getJSON(STORE_NAMES.FILE_MANIFESTS,`${fileId}:manifest`);
      if(manifest?.finalized){info={...info,name:String(manifest.fileName||info.name).slice(0,200),mimeType:String(manifest.mimeType||info.mimeType),totalBytes:Number(manifest.totalBytes)||0,totalChunks:Number(manifest.totalChunks)||0,source:'file'};}
      else if(a.isStamp&&info.previewDataUrl){const parsedThumb=parseDataUrl(info.previewDataUrl);if(parsedThumb){inline=parsedThumb;info.source='inline';info.mimeType=parsedThumb.mimeType;info.totalBytes=Math.floor(parsedThumb.data.length*3/4);info.totalChunks=Math.max(1,Math.ceil(parsedThumb.data.length/1048576));}}
      else return json(404,{error:'添付マニフェストがありません'});
    }
    if(action==='roomAttachmentInfo'){await recordAudit(actorEmail,'roomAttachmentInfo','pocketRoom',roomId,`監査添付を参照: ${messageId}`);return json(200,info);}
    const index=Number(payload.chunkIndex);if(!Number.isInteger(index)||index<0||index>=info.totalChunks)return json(400,{error:'添付チャンク番号が不正です'});
    let data='';
    if(info.source==='file'){
      const fileId=String(a.fileId).trim();const chunk=await getJSON(STORE_NAMES.FILE_CHUNKS,`${fileId}:chunk:${index}`);if(!chunk?.data)return json(404,{error:'添付チャンクが見つかりません'});data=String(chunk.data);
    }else if(inline){data=inline.data.slice(index*1048576,(index+1)*1048576);}
    else return json(404,{error:'添付内容を取得できません'});
    return json(200,{...info,previewDataUrl:undefined,chunkIndex:index,data});
  }

  if (['getEmailSettings','saveEmailSettings'].includes(action)) {
    const key='email:settings';
    const current=await getEmailSettings();
    const mask=(value)=>value?`${String(value).slice(0,4)}••••${String(value).slice(-4)}`:'';
    if(action==='getEmailSettings') return json(200,{settings:{provider:current.provider,from:current.from,mailgunDomain:current.mailgunDomain,mailgunHostRegion:current.mailgunHostRegion,providerApiKey:mask(current.providerApiKey),secret:mask(current.secret),webhook:Boolean(current.webhookSecret),configured:!(!current.provider||!current.providerApiKey||(!current.secret&&!['brevo','agentmail'].includes(current.provider))||!current.from)}});
    const existing=await getJSON(STORE_NAMES.ADMIN_SECRETS,key)||{};
    const provider=String(payload.provider||'').toLowerCase();
    if(!['mailgun','sendgrid','postmark','brevo','agentmail'].includes(provider)) return json(400,{error:'メールプロバイダーはAgentMail・Brevo・Mailgun・SendGrid・Postmarkから選択してください'});
    const providerApiKey=String(payload.providerApiKey||existing.providerApiKey||current.providerApiKey||'').trim();
    const secret=String(payload.secret||existing.secret||current.secret||'').trim();
    const from=String(payload.from||'').trim();
    if(!providerApiKey||(!secret && !['brevo','agentmail'].includes(provider))||!from||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(from)) return json(400,{error:'APIキー・連携シークレット・認証済み送信元メールアドレスを入力してください'});
    const settings={provider,providerApiKey,secret,from,mailgunDomain:String(payload.mailgunDomain||existing.mailgunDomain||current.mailgunDomain||'').trim(),mailgunHostRegion:String(payload.mailgunHostRegion||existing.mailgunHostRegion||current.mailgunHostRegion||'').trim(),updatedAt:new Date().toISOString(),updatedBy:actorEmail};
    if(provider==='mailgun'&&(!settings.mailgunDomain||!['eu','non-eu'].includes(settings.mailgunHostRegion))) return json(400,{error:'Mailgunの場合はドメインとホスト地域（eu / non-eu）が必要です'});
    let webhookNote='';
    if(provider==='agentmail'){
      // 返信を取り込むWebhookをAgentMailに登録し直す（秘密値はこの設定と一緒に保存）
      const { agentMailRequest } = require('../lib/email-integration');
      const apiBase=String(process.env.MIXALL_API_BASE||'').replace(/\/+$/,'');
      try{
        await agentMailRequest(providerApiKey,'GET',`/inboxes/${encodeURIComponent(from)}`);
      }catch(error){return json(400,{error:`AgentMailの受信箱 ${from} を確認できませんでした。APIキーと受信箱アドレスを確かめてください（${error.message}）`});}
      if(existing.webhookId&&existing.providerApiKey){try{await agentMailRequest(existing.providerApiKey,'DELETE',`/webhooks/${encodeURIComponent(existing.webhookId)}`);}catch(_){}}
      if(apiBase){
        try{
          const hook=await agentMailRequest(providerApiKey,'POST','/webhooks',{url:`${apiBase}/agentmail-webhook`,event_types:['message.received'],inbox_ids:[from]});
          settings.webhookId=hook?.webhook_id||null;settings.webhookSecret=hook?.secret||'';
          webhookNote='返信の取り込みも設定しました';
        }catch(error){webhookNote=`返信の取り込み設定に失敗しました（${error.message}）`;}
      }
    }
    await setJSON(STORE_NAMES.ADMIN_SECRETS,key,settings);
    await recordAudit(actorEmail,'saveEmailSettings','emailSettings',key,'メール送信プロバイダー設定を更新（秘密値は監査記録に保存しない）');
    return json(200,{ok:true,settings:{provider,from,mailgunDomain:settings.mailgunDomain,mailgunHostRegion:settings.mailgunHostRegion,providerApiKey:mask(providerApiKey),secret:mask(secret),configured:true,webhook:Boolean(settings.webhookSecret),webhookNote}});
  }
  if (['getGeminiSettings','saveGeminiSettings'].includes(action)) {
    const key = 'gemini:runtimeSettings';
    const current = await getJSON(STORE_NAMES.ADMIN_SECRETS, key) || {};
    const defaults = { fixedPrompt:'', allowUserReply:true, allowGeminiReply:true, readUch:true, readGhost:true };
    if (action === 'getGeminiSettings') return json(200, { settings:{ ...defaults, ...current } });
    const settings = {
      fixedPrompt:String(payload.fixedPrompt ?? current.fixedPrompt ?? '').slice(0, 6000),
      allowUserReply:payload.allowUserReply !== undefined ? payload.allowUserReply === true : current.allowUserReply !== false,
      allowGeminiReply:payload.allowGeminiReply !== undefined ? payload.allowGeminiReply === true : current.allowGeminiReply !== false,
      readUch:payload.readUch !== undefined ? payload.readUch === true : current.readUch !== false,
      readGhost:payload.readGhost !== undefined ? payload.readGhost === true : current.readGhost !== false,
      updatedAt:new Date().toISOString(), updatedBy:actorEmail
    };
    await setJSON(STORE_NAMES.ADMIN_SECRETS, key, settings);
    await recordAudit(actorEmail, 'saveGeminiSettings', 'geminiSettings', key, 'Gemini固定プロンプト・返信・参照範囲設定を更新');
    return json(200, { ok:true, settings });
  }

  if (['geminiKeys','addGeminiKey','updateGeminiKey','deleteGeminiKey','reorderGeminiKeys'].includes(action)) {
    const current = await getJSON(STORE_NAMES.ADMIN_SECRETS, 'gemini:apiKeys');
    const legacy = await getJSON(STORE_NAMES.ADMIN_SECRETS, 'gemini:apiKey');
    let keys = Array.isArray(current?.keys) ? current.keys : (legacy?.apiKey ? [{ id:'legacy', label:'旧設定', apiKey:legacy.apiKey, enabled:true, order:0 }] : []);
    const mask = (key) => key ? `${String(key).slice(0,4)}••••${String(key).slice(-4)}` : '';
    if (action === 'geminiKeys') return json(200, { keys:keys.sort((a,b)=>(Number(a.order)||0)-(Number(b.order)||0)).map((item,index)=>({ id:item.id, label:item.label||`Gemini ${index+1}`, masked:mask(item.apiKey), enabled:item.enabled !== false, order:Number(item.order)||index })) });
    if (action === 'addGeminiKey') {
      const apiKey=String(payload.apiKey||'').trim(); if(!/^[A-Za-z0-9._-]{20,200}$/.test(apiKey))return json(400,{error:'Gemini APIキーの形式が不正です'});
      const item={id:newId(),label:String(payload.label||'Gemini API').trim().slice(0,80),apiKey,enabled:true,order:keys.length,createdAt:new Date().toISOString(),updatedBy:actorEmail}; keys.push(item);
    } else if (action === 'updateGeminiKey') {
      const item=keys.find((row)=>row.id===payload.id); if(!item)return json(404,{error:'Gemini APIキーが見つかりません'}); if(payload.label!==undefined)item.label=String(payload.label).trim().slice(0,80); if(payload.enabled!==undefined)item.enabled=payload.enabled===true; if(payload.apiKey){if(!/^[A-Za-z0-9._-]{20,200}$/.test(String(payload.apiKey)))return json(400,{error:'Gemini APIキーの形式が不正です'});item.apiKey=String(payload.apiKey).trim();} item.updatedAt=new Date().toISOString(); item.updatedBy=actorEmail;
    } else if (action === 'deleteGeminiKey') { keys=keys.filter((row)=>row.id!==payload.id); }
    else if (action === 'reorderGeminiKeys') { const order=Array.isArray(payload.order)?payload.order:[]; const byId=new Map(keys.map((row)=>[row.id,row])); keys=order.map((id)=>byId.get(id)).filter(Boolean).concat(keys.filter((row)=>!order.includes(row.id))); keys.forEach((row,index)=>row.order=index); }
    keys.forEach((row,index)=>row.order=index); await setJSON(STORE_NAMES.ADMIN_SECRETS,'gemini:apiKeys',{keys,updatedAt:new Date().toISOString(),updatedBy:actorEmail});
    await recordAudit(actorEmail, action, 'geminiApiKeys', 'multiple', 'Gemini APIキーの管理（値は監査記録に保存しない）');
    return json(200,{ok:true,keys:keys.map((item,index)=>({id:item.id,label:item.label||`Gemini ${index+1}`,masked:mask(item.apiKey),enabled:item.enabled!==false,order:index}))});
  }

  // 公式アカウントと自動化ルール。任意コードは実行せず、許可された宣言型アクションだけを扱う。
  if (['officialAccounts','createOfficialAccount','updateOfficialAccount','deleteOfficialAccount'].includes(action)) {
    const rows = [];
    for (const key of await listKeys(STORE_NAMES.OFFICIAL_ACCOUNTS)) {
      const item = await getJSON(STORE_NAMES.OFFICIAL_ACCOUNTS, key);
      if (item?.id) rows.push(item);
    }
    if (action === 'officialAccounts') {
      return json(200, { accounts: rows.sort((a,b) => String(a.displayName).localeCompare(String(b.displayName), 'ja')).map((item) => ({
        ...item, rules: (item.rules || []).map((rule) => ({ ...rule, instruction: rule.instruction || '', text: rule.text || '' }))
      })) });
    }
    const target = action === 'updateOfficialAccount' ? rows.find((item) => item.id === payload.id) : null;
    if (action === 'updateOfficialAccount' && !target) return json(404, { error:'公式アカウントが見つかりません' });
    if (action === 'deleteOfficialAccount') {
      if (!target) return json(404, { error:'公式アカウントが見つかりません' });
      await deleteKey(STORE_NAMES.OFFICIAL_ACCOUNTS, target.id);
      await recordAudit(actorEmail, action, 'officialAccount', target.id, '公式アカウントを削除');
      return json(200, { ok:true, deleted:target.id });
    }
    const name = String(payload.name ?? target?.name ?? '').trim().replace(/^@/, '').slice(0, 40);
    const displayName = String(payload.displayName ?? target?.displayName ?? name).trim().slice(0, 80);
    if (!name || !displayName) return json(400, { error:'公式アカウント名と表示名が必要です' });
    if (!/^[A-Za-z0-9_ぁ-んァ-ヶ一-龯.-]{1,40}$/.test(name)) return json(400, { error:'アカウント名に使用できない文字が含まれています' });
    if (rows.some((item) => item.name.toLowerCase() === name.toLowerCase() && item.id !== target?.id)) return json(409, { error:'同じ公式アカウント名が既にあります' });
    const channels = (Array.isArray(payload.channels) ? payload.channels : (target?.channels || ['pocket'])).filter((channel) => ['pocket','ghost','uch','mail'].includes(channel));
    const rawRules = Array.isArray(payload.rules) ? payload.rules : (target?.rules || []);
    const rules = rawRules.slice(0, 30).map((rule) => ({
      id: String(rule.id || newId()).slice(0, 80), enabled: rule.enabled !== false,
      channel: ['pocket','ghost','uch','mail'].includes(rule.channel) ? rule.channel : 'pocket',
      trigger: ['mention','every','keyword'].includes(rule.trigger) ? rule.trigger : 'mention',
      action: ['canned','ai','ghostPost'].includes(rule.action) ? rule.action : 'canned',
      keyword: String(rule.keyword || '').slice(0, 80), text: String(rule.text || '').slice(0, 5000),
      instruction: String(rule.instruction || '').slice(0, 3000), model: String(rule.model || 'gemini-2.0-flash').slice(0, 80), stopAfterMatch: rule.stopAfterMatch !== false,
      conditions: normalizeOfficialConditions(rule.conditions)
    }));
    if (rules.some((rule) => rule.action === 'canned' && !rule.text)) return json(400, { error:'定型文ルールには返信文が必要です' });
    const now = new Date().toISOString();
    const record = { id:target?.id || newId(), name, handle:name.toLowerCase(), displayName, icon:String(payload.icon ?? target?.icon ?? '公式').slice(0, 8), enabled:payload.enabled !== undefined ? payload.enabled === true : target?.enabled !== false, channels:[...new Set(channels)], rules, createdAt:target?.createdAt || now, updatedAt:now, updatedBy:actorEmail };
    await setJSON(STORE_NAMES.OFFICIAL_ACCOUNTS, record.id, record);
    await recordAudit(actorEmail, action, 'officialAccount', record.id, `${record.displayName} / ${record.channels.join(',')}`);
    return json(200, { ok:true, account:record });
}

function normalizeOfficialConditions(input) {
  const c = input && typeof input === 'object' ? input : {};
  const list = (value, max = 30) => Array.isArray(value) ? value.map((item) => String(item).trim().slice(0, 160)).filter(Boolean).slice(0, max) : [];
  const days = Array.isArray(c.daysOfWeek) ? c.daysOfWeek.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6).slice(0, 7) : [];
  const time = c.timeRangeUtc && typeof c.timeRangeUtc === 'object' ? { start:String(c.timeRangeUtc.start || '').slice(0, 5), end:String(c.timeRangeUtc.end || '').slice(0, 5) } : null;
  return {
    fromEmails:list(c.fromEmails).map((item) => item.toLowerCase()), fromIncludes:String(c.fromIncludes || '').slice(0, 120),
    textIncludes:list(c.textIncludes), textExcludes:list(c.textExcludes), textRegex:String(c.textRegex || '').slice(0, 160),
    historyIncludes:list(c.historyIncludes), historyExcludes:list(c.historyExcludes),
    ...(Number.isFinite(Number(c.historyMessageCountMin)) ? { historyMessageCountMin:Math.max(0, Math.min(10000, Number(c.historyMessageCountMin))) } : {}),
    ...(Number.isFinite(Number(c.historyMessageCountMax)) ? { historyMessageCountMax:Math.max(0, Math.min(10000, Number(c.historyMessageCountMax))) } : {}),
    roomIds:list(c.roomIds), threadIds:list(c.threadIds),
    ...(typeof c.hasAttachment === 'boolean' ? { hasAttachment:c.hasAttachment } : {}),
    ...(typeof c.isReply === 'boolean' ? { isReply:c.isReply } : {}), daysOfWeek:days,
    ...(time && /^\d{2}:\d{2}$/.test(time.start) && /^\d{2}:\d{2}$/.test(time.end) ? { timeRangeUtc:time } : {}),
    ghostStatus: c.ghostStatus && typeof c.ghostStatus === 'object' ? {
      ...(c.ghostStatus.contentType ? { contentType:String(c.ghostStatus.contentType).slice(0, 30) } : {}),
      ...(c.ghostStatus.title !== undefined ? { title:String(c.ghostStatus.title).slice(0, 160) } : {}),
      ...(c.ghostStatus.visibility !== undefined ? { visibility:String(c.ghostStatus.visibility).slice(0, 30) } : {}),
      ...(typeof c.ghostStatus.hasMedia === 'boolean' ? { hasMedia:c.ghostStatus.hasMedia } : {}),
      ...(typeof c.ghostStatus.hasTitle === 'boolean' ? { hasTitle:c.ghostStatus.hasTitle } : {}),
      ...(typeof c.ghostStatus.isVideo === 'boolean' ? { isVideo:c.ghostStatus.isVideo } : {}),
      ...(typeof c.ghostStatus.isShort === 'boolean' ? { isShort:c.ghostStatus.isShort } : {})
    } : {}
  };
}

  if (action === 'command') {
    const raw = String(payload.command || '').trim().slice(0, 500);
    const parts = raw.split(/\s+/).filter(Boolean);
    const command = parts.join(' ').toLowerCase();
    if (parts[0] === 'gemini' && parts[1] === 'set-key' && parts[2]) {
      const apiKey = String(parts.slice(2).join('')).trim();
      if (!/^[A-Za-z0-9._-]{20,200}$/.test(apiKey)) return json(400, { error:'Gemini APIキーの形式が不正です' });
      const existing = await getJSON(STORE_NAMES.ADMIN_SECRETS, 'gemini:apiKeys');
      const keys = Array.isArray(existing?.keys) ? existing.keys : [];
      keys.push({ id:newId(), label:`Gemini ${keys.length + 1}`, apiKey, enabled:true, order:keys.length, createdAt:new Date().toISOString(), updatedBy:actorEmail });
      await setJSON(STORE_NAMES.ADMIN_SECRETS, 'gemini:apiKeys', { keys, updatedAt:new Date().toISOString(), updatedBy:actorEmail });
      console.info('Gemini API key updated by admin:', actorEmail);
      return json(200, { command:'gemini set-key [秘匿]', output:'Gemini APIキーを安全な秘密ストアへ保存しました。キーの値は表示・監査記録しません。' });
    }
    if (parts[0] === 'gemini' && parts[1] === 'status') {
      const configured = Boolean(process.env.GEMINI_API_KEY || (await getJSON(STORE_NAMES.ADMIN_SECRETS, 'gemini:apiKeys'))?.keys?.some((key) => key.enabled !== false && key.apiKey));
      return json(200, { command:raw, output:`Gemini APIキー: ${configured ? '設定済み' : '未設定'}（値は表示しません）` });
    }
    if (parts[0] === 'file') return handleFileCommand(actorEmail, parts, raw);
    if (parts[0] === 'ghost' && parts[1] === 'cleanup') {
      const result = await compactNextGhostPost(actorEmail);
      if (!result.migrated) return json(200, { command:raw, output:'移行対象のインライン画像・動画はありません。' });
      return json(200, { command:raw, output:`Ghost投稿 ${result.postId} の添付 ${result.mediaCount} 件を分割Blobへ移行しました（約${result.bytesMoved.toLocaleString()} byte）。タイムアウト回避のため1投稿ずつ処理しています。続ける場合は ghost cleanup を再実行してください。` });
    }
    const tagMatch = raw.match(/^ghost\s+tag\s+(add|edit)\s+(.+)$/i);
    if (tagMatch) {
      const values = tagMatch[2].split('|').map((value) => value.trim());
      const input = tagMatch[1].toLowerCase() === 'edit'
        ? { id:values[0], tag:values[1], description:values[2], order:values[3], enabled:values[4] !== 'off' }
        : { tag:values[0], description:values[1], order:values[2], enabled:values[3] !== 'off' };
      if (!input.tag && tagMatch[1].toLowerCase() === 'add') return json(400, { error:'形式: ghost tag add タグ | 説明 | 表示順 | on/off' });
      const saved = await saveCommandTag(actorEmail, input, tagMatch[1].toLowerCase());
      return json(200, { command:raw, output:`Ghostタグを${tagMatch[1].toLowerCase() === 'edit' ? '更新' : '追加'}しました: #${saved.tag}`, tag:saved });
    }
    if (parts[0] === 'ghost' && parts[1] === 'tag' && parts[2] === 'delete' && parts[3]) {
      const tagId = parts[3]; const existing = await getJSON(STORE_NAMES.GHOST_TAGS, `tag:${tagId}`);
      if (!existing) return json(404, { error:'タグが見つかりません' });
      await deleteKey(STORE_NAMES.GHOST_TAGS, `tag:${tagId}`); await recordAudit(actorEmail, 'Ghostタグ削除(コマンド)', 'ghostTag', tagId, `#${existing.tag}`);
      return json(200, { command:raw, output:`Ghostタグを削除しました: #${existing.tag}` });
    }
    if (parts[0] === 'official' && ['on', 'off'].includes(parts[1]) && parts[2]) return handle({ action:'setOfficial', email:parts[2], isOfficial:parts[1] === 'on' }, actorEmail);
    if (parts[0] === 'password' && parts[1] === 'reset' && parts[2] && parts[3]) return handle({ action:'resetPassword', email:parts[2], customPassword:parts.slice(3).join(' ') }, actorEmail);
    if (parts[0] === 'ghost' && parts[1] === 'id' && parts[2] === 'requests') return handle({ action:'listGhostIdRequests' }, actorEmail);
    if (parts[0] === 'ghost' && parts[1] === 'id' && parts[2] === 'approve' && parts[3]) return handle({ action:'reviewGhostIdRequest', requestId:parts[3], decision:'approve' }, actorEmail);
    if (parts[0] === 'ghost' && parts[1] === 'id' && parts[2] === 'reject' && parts[3]) return handle({ action:'reviewGhostIdRequest', requestId:parts[3], decision:'reject' }, actorEmail);
    if (parts[0] === 'report' && parts[1] === 'resolve' && parts[2]) return handle({ action:'resolveReport', reportId:parts[2], status:parts[3] || 'reviewing', note:parts.slice(4).join(' ') }, actorEmail);
    if (parts[0] === 'ghost' && parts[1] === 'delete' && parts[2]) return handle({ action:'deleteGhostPost', postId:parts[2] }, actorEmail);
    if (parts[0] === 'site' && parts[1] === 'delete' && parts[2]) return handle({ action:'deleteLendingSite', slug:parts[2] }, actorEmail);
    if (parts[0] === 'room' && parts[1] === 'audit' && parts[2]) return handle({ action:'roomAudit', roomId:parts[2] }, actorEmail);
    if (parts[0] === 'audit' && parts[1] === 'archive' && parts[2]) {
      const id = parts[2]; const key = id.startsWith('report:') || id.startsWith('audit:') ? id : `audit:${id}`;
      const item = await getJSON(STORE_NAMES.ADMIN_AUDIT, key);
      if (!item) return json(404, { error:'監査ログが見つかりません' });
      item.archived = true; item.archivedAt = new Date().toISOString(); item.archivedBy = actorEmail;
      await setJSON(STORE_NAMES.ADMIN_AUDIT, key, item);
      await recordAudit(actorEmail, 'auditArchive', 'adminAudit', id, 'ログを削除せずアーカイブ');
      return json(200, { command:raw, output:`監査ログをアーカイブしました: ${id}` });
    }
    let output;
    if (!raw || command === 'help' || command === 'manus help') {
      output = '許可コマンド:\n  help\n  status\n  env status\n  gemini status\n  gemini set-key APIキー\n  reports list\n  ghost tags\n  ghost cleanup\n  ghost tag add タグ | 説明 | 表示順 | on/off\n  ghost tag edit タグID | タグ | 説明 | 表示順 | on/off\n  ghost tag delete タグID\n  official on/off メールアドレス\n  password reset メールアドレス カスタムパスワード\n  ghost id requests\n  ghost id approve 申請ID\n  ghost id reject 申請ID\n  report resolve 通報ID ステータス [メモ]\n  backup export\n  site lock status\n  file list\n  file read キー\n  file write キー JSON\n  file delete キー\n  audit archive ID\n\nこの欄はアプリ専用コマンドのみ対応します。OSのshellや任意のNetlify CLIは実行しません。';
    } else if (command === 'status') {
      const [accounts, posts, rooms, threads] = await Promise.all([readAll(STORE_NAMES.ACCOUNTS), safeReadGhostPosts(), readAll(STORE_NAMES.POCKET_ROOMS), readAll(STORE_NAMES.UCH_THREADS)]);
      const state = await getJSON(STORE_NAMES.SITE_STATE, 'global');
      output = `アプリ状態\nアカウント: ${accounts.length}\nGhost投稿: ${posts.length}\nPocketルーム: ${rooms.length}\nUchスレッド: ${threads.length}\nサイトロック: ${state?.locked === true ? '有効' : '無効'}`;
    } else if (command === 'env status') {
      output = `環境変数状態\nGEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? '設定済み' : '未設定'}\nBLOBS_SITE_ID: ${process.env.BLOBS_SITE_ID ? '設定済み' : 'Netlify自動設定'}\nBLOBS_TOKEN: ${process.env.BLOBS_TOKEN ? '設定済み' : 'Netlify自動設定'}\n値そのものは安全のため表示しません。`;
    } else if (command === 'reports list') {
      const items = (await readAll(STORE_NAMES.ADMIN_AUDIT)).filter((item) => item.kind === 'report').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 20);
      output = items.length ? items.map((item) => `[${item.status || 'open'}] ${item.targetType} / ${item.reason || ''} / ${item.createdAt}`).join('\\n') : '未対応を含む通報はありません。';
    } else if (command === 'ghost tags') {
      const tags = await readAll(STORE_NAMES.GHOST_TAGS);
      output = tags.length ? tags.map((tag) => `#${tag.tag} (${tag.enabled === false ? '無効' : '有効'}) - ${tag.description || '説明なし'}`).join('\\n') : '管理タグはありません。';
    } else if (command === 'backup export') {
      output = 'バックアップカードの「バックアップを出力してロック」ボタンから、JSONをダウンロードしてください。コマンド欄ではバックアップ本文や秘密情報を表示しません。';
    } else if (command === 'site lock status') {
      const state = await getJSON(STORE_NAMES.SITE_STATE, 'global');
      output = state?.locked === true ? `サイトロック: 有効 (${state.lockedAt || '日時不明'})` : 'サイトロック: 無効';
    } else {
      output = `拒否: 未許可のコマンドです。「help」で利用可能なコマンドを確認してください。`;
    }
    await recordAudit(actorEmail, 'adminCommand', 'console', command || 'help', raw.slice(0, 500));
    return json(200, { command: raw, output });
  }

  if (action === 'scheduleLogout') {
    const sessionId = String(payload.sessionId || '').trim();
    if (!sessionId) return json(400, { error:'セッションIDが必要です' });
    const sessionKeys = await listKeys(STORE_NAMES.SESSIONS); let targetKey = null; let target = null;
    for (const key of sessionKeys) { const item = await getJSON(STORE_NAMES.SESSIONS, key); if (item?.sessionId === sessionId) { targetKey = key; target = item; break; } }
    if (!target || target.expiresAt < Date.now()) return json(404, { error:'有効なセッションが見つかりません' });
    const request = { id:newId(), sessionId, targetEmail:target.email, status:'pending', requestedBy:actorEmail, requestedAt:new Date().toISOString(), reason:String(payload.reason || '運営による端末ログアウト').slice(0,300) };
    const isOnline = Number(target.lastSeenAt || 0) > Date.now() - 90 * 1000;
    if (isOnline) { await deleteKey(STORE_NAMES.SESSIONS, targetKey); request.status='executed'; request.executedAt=new Date().toISOString(); }
    await setJSON(STORE_NAMES.SESSION_LOGOUTS, `logout:${sessionId}`, request);
    await recordAudit(actorEmail, isOnline ? 'sessionLogout' : 'sessionLogoutScheduled', 'session', sessionId, `${target.email} / ${request.reason}`);
    return json(200, { ok:true, status:request.status, sessionId, targetEmail:target.email });
  }

  if (action === 'cancelLogoutSchedule') {
    const sessionId = String(payload.sessionId || '').trim(); const key=`logout:${sessionId}`; const request=await getJSON(STORE_NAMES.SESSION_LOGOUTS,key);
    if (!request || request.status !== 'pending') return json(404, { error:'保留中のログアウト予約が見つかりません' });
    request.status='cancelled'; request.cancelledAt=new Date().toISOString(); request.cancelledBy=actorEmail; await setJSON(STORE_NAMES.SESSION_LOGOUTS,key,request); await recordAudit(actorEmail,'sessionLogoutCancel','session',sessionId,'ログアウト予約を取消'); return json(200,{ok:true});
  }

  if (action === 'listBirthDates') {
    const keys = (await listKeys(STORE_NAMES.ACCOUNTS)).sort((a, b) => a.localeCompare(b));
    const limit = 100;
    const offset = Math.max(0, Math.min(Number.parseInt(payload.offset, 10) || 0, Math.max(0, keys.length - 1)));
    const pageKeys = keys.slice(offset, offset + limit);
    const rows = (await Promise.all(pageKeys.map(async (email) => {
      const account = await getJSON(STORE_NAMES.ACCOUNTS, email);
      if (!account) return null;
      return { email, displayName:account.displayName || email.split('@')[0], birthDate:isValidBirthDate(account.birthDate) ? account.birthDate : null, age:getAgeFromBirthDate(account.birthDate), submittedAt:account.birthDateSubmittedAt || null };
    }))).filter(Boolean);
    await recordAudit(actorEmail, 'viewAccountBirthDates', 'accountBirthDate', `${offset}-${offset + rows.length}`, `申告生年月日の閲覧 (${rows.length}件)`);
    const nextOffset = offset + rows.length < keys.length ? offset + rows.length : null;
    return json(200, { rows, total:keys.length, offset, nextOffset, hasPrevious:offset > 0 });
  }

  if (action === 'snapshot') {
    const [accounts, sessions, pendingLogoutRows, posts, sites, rooms, threads, auditItems] = await Promise.all([
      safeReadAll(STORE_NAMES.ACCOUNTS), safeReadAll(STORE_NAMES.SESSIONS), safeReadAll(STORE_NAMES.SESSION_LOGOUTS), safeReadGhostPosts(),
      safeReadAll(STORE_NAMES.LENDING_SITES), safeReadAll(STORE_NAMES.POCKET_ROOMS), safeReadAll(STORE_NAMES.UCH_THREADS),
      safeReadAll(STORE_NAMES.ADMIN_AUDIT)
    ]);
    const safeAccounts = accounts.filter((a) => a && typeof a.email === 'string' && a.email.includes('@'));
    const safeSessions = sessions.filter((s) => s && typeof s === 'object');
    const safePosts = posts.filter((p) => p && typeof p === 'object');
    const safeSites = sites.filter((s) => s && typeof s === 'object');
    const safeRooms = rooms.filter((r) => r && typeof r === 'object');
    const safeThreads = threads.filter((t) => t && typeof t === 'object');
    const accountByEmail = new Map(safeAccounts.map((a) => [a.email, a]));
    const accountRows = await Promise.all(safeAccounts.slice(0, 300).map(async (account) => {
      const profile = await getAccountProfile(account.email);
      return { ...publicAccount(account, account.email), online: profile.online, lastSeenAt: profile.lastSeenAt };
    }));
    accountRows.sort((a, b) => String(a.email).localeCompare(String(b.email)));

    const pendingBySession = new Map(pendingLogoutRows.filter((item) => item && item.status === 'pending' && item.sessionId).map((item) => [item.sessionId, item]));
    const sessionRows = safeSessions.filter((s) => Number(s.expiresAt || 0) >= Date.now() && !pendingBySession.has(s.sessionId)).map((s) => ({
      sessionId: s.sessionId || null,
      email: s.email,
      deviceLabel: s.deviceLabel || '不明なデバイス',
      userAgent: s.userAgent || '',
      createdAt: s.createdAt || null,
      lastSeenAt: s.lastSeenAt || null,
      expiresAt: s.expiresAt,
      ip: s.connectionAudit?.ip || '',
      regionCountry: s.connectionAudit?.country || '',
      regionName: s.connectionAudit?.region || s.connectionAudit?.area || '',
      regionAccuracy: s.connectionAudit?.accuracy || '不明',
      isAdmin: Boolean(accountByEmail.get(s.email) && accountByEmail.get(s.email).isAdmin === true),
      logoutPending: false
    }));
    const pendingRows = [...pendingBySession.values()].map((item) => ({ sessionId:item.sessionId, email:item.targetEmail, status:item.status, logoutPending:true, requestedAt:item.requestedAt, requestedBy:item.requestedBy }));
    sessionRows.push(...pendingRows);

    const postRows = await Promise.all(safePosts.slice(0, 300).map(async (post) => ({ ...post, authorProfile: await getAccountProfile(post.authorEmail) })));
    postRows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const roomRows = safeRooms.map((room) => {
      const messages = Array.isArray(room.messages) ? room.messages : [];
      const memberEmails = Array.isArray(room.memberEmails) ? room.memberEmails : [];
      return {
        id: room.id, type: room.type, title: room.title || (room.type === 'dm' ? '個人チャット' : 'グループ'),
        hostEmail: room.hostEmail || '', memberEmails, messageCount: messages.length,
        deletedMessageCount: messages.filter((m) => m && m.deleted).length, createdAt: room.createdAt || null
      };
    }).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const threadRows = safeThreads.map((thread) => ({
      id: thread.id, title: thread.title, authorEmail: thread.authorEmail || thread.author || '',
      postCount: (thread.posts || []).length, createdAt: thread.createdAt
    })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const safeAuditItems = auditItems.filter((item) => item && typeof item === 'object');
    const reports = safeAuditItems.filter((item) => item.kind === 'report').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const audits = safeAuditItems.filter((item) => item.kind === 'audit').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 100);

    return json(200, { accounts: accountRows, sessions: sessionRows, posts: postRows, sites: safeSites, rooms: roomRows, threads: threadRows, reports, audits,
      stats: { accounts: safeAccounts.length, activeSessions: sessionRows.length, posts: safePosts.length, sites: safeSites.length, rooms: safeRooms.length, threads: safeThreads.length, openReports: reports.filter((r) => r.status === 'open').length } });
  }

  if (action === 'roomAudit') {
    const room = await getJSON(STORE_NAMES.POCKET_ROOMS, payload.roomId);
    if (!room) return json(404, { error: 'ルームが見つかりません' });
    const profiles = {};
    for (const email of (Array.isArray(room.memberEmails) ? room.memberEmails : [])) profiles[email] = await getAccountProfile(email);
    const messages = [];
    for (const message of (Array.isArray(room.messages) ? room.messages : [])) {
      if (!message || typeof message !== 'object') continue;
      const attachment=auditAttachment(message);
      messages.push({
        id:message.id, authorEmail:message.authorEmail, authorName:(room.nicknames||{})[message.authorEmail]||message.authorName,
        text:message.deleted ? (message.deletedText || '') : (message.text || ''),
        deleted:Boolean(message.deleted), deletedAt:message.deletedAt||null, deletedBy:message.deletedBy||null,
        createdAt:message.createdAt||null, replyTo:message.replyTo||null, attachment,
        authorProfile:profiles[message.authorEmail]||await getAccountProfile(message.authorEmail)
      });
    }
    await recordAudit(actorEmail, 'roomAudit', 'pocketRoom', room.id, '運営がチャット監査を実行');
    return json(200, { room: { id: room.id, type: room.type, title: room.title, memberEmails: room.memberEmails, messages } });
  }

  if (action === 'deleteAccount') {
    const targetEmail = String(payload.email || '').trim().toLowerCase();
    const account = await getJSON(STORE_NAMES.ACCOUNTS, targetEmail);
    if (!account) return json(404, { error:'アカウントが見つかりません' });
    if (account.isAdmin === true) return json(403, { error:'運営アカウントは強制削除できません' });
    const reason = String(payload.reason || '').trim().slice(0,500);
    if (!reason) return json(400, { error:'削除理由が必要です' });
    if (String(payload.confirm || '') !== targetEmail) return json(400, { error:'確認欄へ対象メールアドレスを正確に入力してください' });
    for (const key of await listKeys(STORE_NAMES.SESSIONS)) { const session=await getJSON(STORE_NAMES.SESSIONS,key); if (session?.email===targetEmail) await deleteKey(STORE_NAMES.SESSIONS,key); }
    await deleteKey(STORE_NAMES.ACCOUNTS, targetEmail);
    await recordAudit(actorEmail,'deleteAccountForce','account',targetEmail,`運営による強制削除: ${reason}`);
    return json(200,{ok:true,deleted:true,email:targetEmail});
  }

  if (action === 'setOfficial') {
    const targetEmail = String(payload.email || '').trim().toLowerCase();
    const account = await getJSON(STORE_NAMES.ACCOUNTS, targetEmail);
    if (!account) return json(404, { error: 'アカウントが見つかりません' });
    if (account.isAdmin && payload.isOfficial === false) return json(400, { error: '運営アカウントの公認表示は解除できません' });
    account.isOfficial = account.isAdmin === true || payload.isOfficial === true;
    await setJSON(STORE_NAMES.ACCOUNTS, targetEmail, account);
    await recordAudit(actorEmail, 'setOfficial', 'account', targetEmail, `isOfficial=${account.isOfficial}`);
    return json(200, { account: publicAccount(account, targetEmail) });
  }

  if (action === 'setDeputyAdmin') {
    const actor = await getJSON(STORE_NAMES.ACCOUNTS, actorEmail);
    if (!canManageAdminRoles(actor)) return json(403, { error:'副運営の任命・解除は運営アカウントのみ実行できます' });
    const targetEmail = String(payload.email || '').trim().toLowerCase();
    const account = await getJSON(STORE_NAMES.ACCOUNTS, targetEmail);
    if (!account) return json(404, { error:'アカウントが見つかりません' });
    if (account.isAdmin === true) return json(400, { error:'主運営アカウントは副運営に変更できません' });
    account.isDeputyAdmin = payload.isDeputyAdmin === true;
    await setJSON(STORE_NAMES.ACCOUNTS, targetEmail, account);
    await recordAudit(actorEmail, 'setDeputyAdmin', 'account', targetEmail, `isDeputyAdmin=${account.isDeputyAdmin}`);
    return json(200, { account: publicAccount(account, targetEmail) });
  }

  if (action === 'setAdmin') {
    const actor = await getJSON(STORE_NAMES.ACCOUNTS, actorEmail);
    if (!canManageAdminRoles(actor)) return json(403, { error:'運営の任命・解除は運営アカウントのみ実行できます' });
    const targetEmail = String(payload.email || '').trim().toLowerCase();
    if (!targetEmail) return json(400, { error:'対象アカウントが指定されていません' });
    if (targetEmail === actorEmail) return json(400, { error:'自分自身の運営権限は変更できません' });
    const account = await getJSON(STORE_NAMES.ACCOUNTS, targetEmail);
    if (!account) return json(404, { error:'アカウントが見つかりません' });
    const enabled = payload.isAdmin === true;
    account.isAdmin = enabled;
    if (enabled) account.isDeputyAdmin = false;
    await setJSON(STORE_NAMES.ACCOUNTS, targetEmail, account);
    await recordAudit(actorEmail, 'setAdmin', 'account', targetEmail, `isAdmin=${enabled}`);
    return json(200, { account: publicAccount(account, targetEmail) });
  }

  if (action === 'listGhostIdRequests') {
    const requests = [];
    for (const key of await listKeys(STORE_NAMES.GHOST_ID_REQUESTS, 'request:')) { const request = await getJSON(STORE_NAMES.GHOST_ID_REQUESTS, key); if (request) requests.push(request); }
    requests.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    return json(200, { requests });
  }

  if (action === 'reviewGhostIdRequest') {
    const requestId = String(payload.requestId || ''); const request = await getJSON(STORE_NAMES.GHOST_ID_REQUESTS, `request:${requestId}`);
    if (!request) return json(404, { error:'ID変更申請が見つかりません' });
    if (request.status !== 'pending') return json(409, { error:'この申請はすでに処理済みです' });
    if (payload.decision === 'reject') { request.status = 'rejected'; request.reviewedBy = actorEmail; request.reviewedAt = new Date().toISOString(); await setJSON(STORE_NAMES.GHOST_ID_REQUESTS, `request:${requestId}`, request); await recordAudit(actorEmail, 'rejectGhostIdChange', 'ghostIdRequest', requestId, request.requestedHandle); return json(200, { request }); }
    const target = await getJSON(STORE_NAMES.ACCOUNTS, request.requesterEmail); if (!target) return json(404, { error:'申請者アカウントが見つかりません' });
    for (const key of await listKeys(STORE_NAMES.ACCOUNTS)) { if (key === request.requesterEmail) continue; const other = await getJSON(STORE_NAMES.ACCOUNTS, key); if (other?.ghostHandle === request.requestedHandle) return json(409, { error:'申請されたGhost IDは現在使用中です' }); }
    target.ghostHandle = request.requestedHandle; await setJSON(STORE_NAMES.ACCOUNTS, request.requesterEmail, target);
    request.status = 'approved'; request.reviewedBy = actorEmail; request.reviewedAt = new Date().toISOString(); await setJSON(STORE_NAMES.GHOST_ID_REQUESTS, `request:${requestId}`, request); await recordAudit(actorEmail, 'approveGhostIdChange', 'ghostIdRequest', requestId, request.requestedHandle); return json(200, { request });
  }

  if (action === 'resetPassword') {
    const targetEmail = String(payload.email || '').trim().toLowerCase();
    const account = await getJSON(STORE_NAMES.ACCOUNTS, targetEmail);
    if (!account) return json(404, { error: 'アカウントが見つかりません' });
    const customPassword = String(payload.customPassword || '');
    if (customPassword.length < 8 || customPassword.length > 128) return json(400, { error: 'カスタムパスワードは8〜128文字で入力してください' });
    const salt = crypto.randomBytes(16).toString('hex');
    account.salt = salt;
    account.passwordHash = crypto.scryptSync(customPassword, salt, 64).toString('hex');
    await setJSON(STORE_NAMES.ACCOUNTS, targetEmail, account);
    const keys = await listKeys(STORE_NAMES.SESSIONS);
    for (const key of keys) {
      const session = await getJSON(STORE_NAMES.SESSIONS, key);
      if (session && session.email === targetEmail) await deleteKey(STORE_NAMES.SESSIONS, key);
    }
    await recordAudit(actorEmail, 'resetPassword', 'account', targetEmail, '管理者によるパスワード再設定。既存セッションを失効');
    return json(200, { email: targetEmail, ok: true, note: '指定したカスタムパスワードを設定しました。パスワード自体はレスポンスに返しません。' });
  }

  if (action === 'resolveReport') {
    const report = await getJSON(STORE_NAMES.ADMIN_AUDIT, `report:${payload.reportId}`);
    if (!report || report.kind !== 'report') return json(404, { error: '通報が見つかりません' });
    report.status = ['open', 'reviewing', 'resolved', 'dismissed'].includes(payload.status) ? payload.status : 'reviewing';
    report.resolutionNote = String(payload.note || '').slice(0, 1000);
    report.resolvedBy = actorEmail;
    report.resolvedAt = new Date().toISOString();
    await setJSON(STORE_NAMES.ADMIN_AUDIT, `report:${report.id}`, report);
    await recordAudit(actorEmail, 'resolveReport', 'report', report.id, `${report.status}: ${report.resolutionNote}`);
    return json(200, { report });
  }

  if (action === 'deleteGhostPost') {
    const post = await getJSON(STORE_NAMES.GHOST_POSTS, payload.postId);
    if (!post) return json(404, { error: '投稿が見つかりません' });
    await deleteKey(STORE_NAMES.GHOST_POSTS, payload.postId);
    await recordAudit(actorEmail, 'deleteGhostPost', 'ghostPost', payload.postId, '運営による投稿削除');
    return json(200, { ok: true });
  }

  if (action === 'getCoinEarningSites') {
    const config = await getJSON(STORE_NAMES.COIN_EARNING_SITES, 'featured') || { slugs: [] };
    const allSites = await safeReadAll(STORE_NAMES.LENDING_SITES);
    const sites = allSites.filter((site) => Array.isArray(site.coinPrograms) && site.coinPrograms.length).map((site) => ({ slug:site.slug, title:site.title || site.slug, ownerEmail:site.ownerEmail, selected:config.slugs.includes(site.slug) }));
    return json(200, { selected:config.slugs, sites });
  }

  if (action === 'setCoinEarningSites') {
    const requested = Array.isArray(payload.slugs) ? payload.slugs.map((slug) => String(slug).trim().toLowerCase()).filter((slug) => /^[a-z0-9-]{2,40}$/.test(slug)) : [];
    const unique = Array.from(new Set(requested)).slice(0, 50);
    const valid = [];
    for (const slug of unique) { const site = await getJSON(STORE_NAMES.LENDING_SITES, slug); if (site && Array.isArray(site.coinPrograms) && site.coinPrograms.length) valid.push(slug); }
    await setJSON(STORE_NAMES.COIN_EARNING_SITES, 'featured', { slugs:valid, updatedAt:new Date().toISOString(), updatedBy:actorEmail });
    await recordAudit(actorEmail, 'setCoinEarningSites', 'coinEarningSites', 'featured', valid.join(', '));
    return json(200, { ok:true, selected:valid });
  }

  if (action === 'deleteLendingSite') {
    const site = await getJSON(STORE_NAMES.LENDING_SITES, payload.slug);
    if (!site) return json(404, { error: 'サイトが見つかりません' });
    await deleteKey(STORE_NAMES.LENDING_SITES, payload.slug);
    await recordAudit(actorEmail, 'deleteLendingSite', 'lendingSite', payload.slug, `所有者: ${site.ownerEmail}`);
    return json(200, { ok: true });
  }

  return json(400, { error: '不明なactionです' });
}
