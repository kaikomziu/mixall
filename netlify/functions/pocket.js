// netlify/functions/pocket.js
// チャット「ぽけっと」: 個人チャット・グループチャット、部屋ごとの表示名変更、
// ロール(主/副官/カスタムロール)管理。通話機能は別フェーズで追加予定。

const crypto = require('crypto');
const { STORE_NAMES, getJSON, setJSON, listKeys } = require('../lib/store');
const { requireSession, requireAdmin, getAccountProfile } = require('../lib/session');
const { createReport } = require('../lib/reports');
const { notifyRecipients } = require('../lib/notifications');
const { callGemini } = require('../lib/gemini');
const { getGeminiMemory, formatGeminiMemory, appendGeminiMemory } = require('../lib/gemini-memory');
const { runOfficialRules, hasOfficialAutomations } = require('../lib/official');
const { enqueueBackgroundTask } = require('../lib/background-jobs');
const { parseSearchQuery } = require('../lib/search');
const { dedupeImageAttachment } = require('../lib/media-dedupe');
const { callAiGateway, operatorContext } = require('../lib/ai-gateway');

function json(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body)
  };
}

const MAX_LEGACY_MEDIA_BYTES = 10 * 1024 * 1024; // 既存dataURL形式の後方互換用

async function normalizePocketMedia(items, email, limit) {
  const normalized=[];
  for (const item of (Array.isArray(items)?items:[]).slice(0,limit)) {
    if (item?.fileId) {
      const fileId=String(item.fileId).trim();
      const manifest=await getJSON(STORE_NAMES.FILE_MANIFESTS,`${fileId}:manifest`);
      if (!manifest?.finalized) return { error:'添付ファイルのアップロードが完了していません', status:400 };
      if (manifest.ownerEmail!==email) return { error:'この添付ファイルを保存する権限がありません', status:403 };
      normalized.push({fileId,name:String(item.name||manifest.fileName||'file').slice(0,160),type:String(item.type||manifest.mimeType||'application/octet-stream').slice(0,120),sizeBytes:Number(manifest.totalBytes)||0});
    } else if (item?.dataUrl && String(item.dataUrl).length<MAX_LEGACY_MEDIA_BYTES) {
      normalized.push({name:String(item.name||'file').slice(0,160),type:String(item.type||'application/octet-stream').slice(0,120),dataUrl:String(item.dataUrl)});
    }
  }
  return {items:normalized};
}

const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash';
function normalizeGeminiModel(model) {
  const value=String(model||'').trim();
  return (!value || value==='gemini-flash-latest' || value==='gemini-2.0-flash' || value==='models/gemini-2.0-flash') ? DEFAULT_GEMINI_MODEL : value;
}
async function generatePocketAiReply(bot, prompt, context = '', locationContext = '') {
  if (bot.botType === 'mixbot') {
    const result = await callAiGateway({
      model:String(bot.model || 'gpt-5-mini'),
      system:String(bot.instruction || 'MixBotとして日本語で簡潔かつ安全に回答してください。').slice(0, 3000),
      user:`${String(locationContext).slice(0,3000)}\n\n会話履歴:\n${String(context).slice(-12000)}\n\n今回のメッセージ:\n${String(prompt).slice(0,6000)}`,
      timeoutMs:20000
    });
    return result.ok ? result.text : (result.error || 'MixBotを利用できません。');
  }
  const model=normalizeGeminiModel(bot.model);
  const result=await callGemini({ model, timeoutMs:20000, body:{systemInstruction:{parts:[{text:String(bot.instruction||'日本語で簡潔かつ安全に回答してください。個人情報や危険な行為を助長しないでください。送信者名と返信先を踏まえて回答してください。').slice(0,2000)}]},contents:[{parts:[{text:`現在の場所（この情報は現在の会話の所属先を示します）:\n${String(locationContext||'サービス: Pocket').slice(0,500)}\n\n会話履歴:\n${String(context||'').slice(-12000)}\n\n今回のメッセージ:\n${String(prompt||'').slice(0,6000)}`}]}],generationConfig:{maxOutputTokens:1200,temperature:0.7}}});
  if(!result.ok) return result.error || 'Gemini APIへの接続に失敗しました。';
  return result.data.candidates?.[0]?.content?.parts?.map(part=>part.text||'').join('').trim() || 'Geminiから返信を取得できませんでした。';
}

async function processPocketBotTask(payload, jobId) {
  const room = await getRoom(String(payload?.roomId || ''));
  if (!room) return;
  const message = room.messages.find((item) => item.id === String(payload?.messageId || '') && !item.deleted);
  if (!message) return;
  const email = message.authorEmail;
  // 本文はサーバーに残らないため、送信時にジョブへ渡された本文を使う
  const text = String(payload?.text ?? message.text ?? '');
  const botProfiles = {};
  for (const memberEmail of room.memberEmails) botProfiles[memberEmail] = await getAccountProfile(memberEmail);
  const visibleOperatorContext = operatorContext(room, botProfiles);
  for (const bot of room.bots.filter((item) => item.enabled !== false)) {
    if (room.messages.some((item) => item.backgroundJobId === jobId && item.botId === bot.id)) continue;
    const mention = new RegExp(`@${String(bot.name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|\\s|[、,:：])`, 'i');
    const match = mention.exec(text);
    let replyMessage = bot.replyMessage || `${bot.name} からの返信です。`;
    let triggerType = bot.triggerType || bot.sourceTriggerType || 'canned';
    let aiSettings = bot;
    if (bot.sourceThreadId && bot.sourceBotId) {
      const sourceBots = await getJSON(STORE_NAMES.UCH_BOTS, bot.sourceThreadId) || [];
      const source = sourceBots.find((item) => item.id === bot.sourceBotId || item.uchId === bot.sourceBotId || ('b' + crypto.createHash('sha256').update(`${bot.sourceThreadId}|${item.id}`).digest('hex').slice(0, 10)) === bot.sourceBotId);
      if (source) {
        triggerType = source.triggerType || triggerType;
        replyMessage = source.replyMessage || source.cannedMessage || source.message || replyMessage;
        aiSettings = { ...bot, model:source.model || bot.model, instruction:source.instruction || bot.instruction };
      }
    }
    const botKind = ['ai','mixbot'].includes(aiSettings.botType) || aiSettings.sourceTriggerType === 'ai' || triggerType === 'ai' ? 'ai' : 'canned';
    const trigger = ['mention','every'].includes(aiSettings.triggerType) ? aiSettings.triggerType : 'mention';
    if (trigger !== 'every' && !match) continue;
    if (botKind === 'ai') {
      const prompt = trigger === 'every' ? text : text.slice(match.index + match[0].length).trim();
      if (!prompt) replyMessage = `@${bot.name} の後に質問を書いてください。`;
      else {
        const replyContext = message.replyTo ? room.messages.find((item) => item.id === message.replyTo) : null;
        const history = `このチャットで確認できる運営区分:\n${visibleOperatorContext}\n\n${room.messages.slice(-24).map((item) => `[${item.authorName || item.authorEmail}] ${item.text || '(添付)'}${item.id === message.replyTo ? ' ←このメッセージへの返信先' : ''}`).join('\n')}`;
        const memory = await getGeminiMemory('pocket', room.id, bot.id);
        const memoryContext = `長期記憶（このPocket部屋のGemini専用。会話の事実として扱ってください）:\n${formatGeminiMemory(memory)}\n\n`;
        replyMessage = await generatePocketAiReply(aiSettings, `${memoryContext}送信者: ${message.authorName || email} (${email})\n返信先: ${replyContext ? `${replyContext.authorName}: ${replyContext.text || '(添付)'}` : 'なし'}\n本文: ${prompt}\n送信本文の計測: 文字数=${[...text].length}、UTF-8バイト数=${Buffer.byteLength(text, 'utf8')}`, history, `サービス: Pocket\n部屋名: ${room.title || '名称未設定'}\n部屋ID: ${room.id}`);
        if (replyMessage && !replyMessage.startsWith('Gemini API')) {
          try { await appendGeminiMemory('pocket', room.id, bot.id, [{ role:'user', text:prompt }, { role:'model', text:replyMessage }]); }
          catch (memoryError) { console.error('Pocket Gemini memory save failed:', memoryError); }
        }
      }
    }
    room.messages.push({ id:newId(), authorEmail:`bot:${bot.id}`, authorName:bot.name, text:replyMessage, attachment:null, botId:bot.id, isBot:true, replyTo:message.id, backgroundJobId:jobId, readBy:[], createdAt:new Date().toISOString() });
  }

  const replyTarget = message.replyTo ? room.messages.find((item) => item.id === message.replyTo) : null;
  const officialReplies = await runOfficialRules({ channel:'pocket', text, authorEmail:email, sourceId:message.id, roomId:room.id, hasAttachment:Boolean(payload?.hasAttachment ?? message.attachment), isReply:Boolean(replyTarget), now:Date.now(), historyMessageCount:room.messages.length, history:room.messages.slice(-24).map((item) => `[${item.authorName || item.authorEmail}] ${item.text || '(添付)'}`).join('\n'), jobId });
  for (const reply of officialReplies) {
    const ruleIndex = Number.isInteger(reply.ruleIndex) ? reply.ruleIndex : 0;
    if (room.messages.some((item) => item.backgroundJobId === jobId && item.officialAccountId === reply.account.id && item.backgroundRuleIndex === ruleIndex)) continue;
    const id = crypto.createHash('sha256').update(`pocket-official:${jobId}:${reply.account.id}:${ruleIndex}`).digest('hex').slice(0, 16);
    room.messages.push({ id, authorEmail:`official:${reply.account.id}`, authorName:reply.account.displayName, text:reply.text, attachment:null, isBot:true, isOfficial:true, officialAccountId:reply.account.id, backgroundRuleIndex:ruleIndex, replyTo:message.id, backgroundJobId:jobId, readBy:[], createdAt:new Date().toISOString() });
  }
  const generatedReplies = room.messages.filter((item) => item.backgroundJobId === jobId);
  const latest = await getRoom(room.id);
  if (!latest || latest.messages.find((item) => item.id === message.id)?.deleted) return;
  for (const reply of generatedReplies) {
    const duplicate = latest.messages.some((item) => item.id === reply.id || (item.backgroundJobId === jobId && item.botId === reply.botId && item.officialAccountId === reply.officialAccountId && item.backgroundRuleIndex === reply.backgroundRuleIndex));
    if (!duplicate) latest.messages.push(reply);
  }
  await setJSON(STORE_NAMES.POCKET_ROOMS, latest.id, latest);
}
exports.processBackgroundTask = processPocketBotTask;
exports.transformForViewer = (...args) => transformForViewer(...args);
exports.getMinefieldSettings = (...args) => getMinefieldSettings(...args);

function newId() {
  return crypto.randomBytes(8).toString('hex');
}

function normalizeEmail(input) {
  return String(input || '').trim().toLowerCase();
}

async function getRoom(roomId) {
  const room = await getJSON(STORE_NAMES.POCKET_ROOMS, roomId);
  if (!room) return null;
  room.memberEmails = Array.isArray(room.memberEmails) ? room.memberEmails : [];
  room.subHosts = Array.isArray(room.subHosts) ? room.subHosts : [];
  room.customRoles = Array.isArray(room.customRoles) ? room.customRoles : [];
  room.nicknames = room.nicknames && typeof room.nicknames === 'object' ? room.nicknames : {};
  room.bots = Array.isArray(room.bots) ? room.bots : [];
  room.threads = Array.isArray(room.threads) ? room.threads : [];
  room.messages = Array.isArray(room.messages) ? room.messages : [];
  room.typing = room.typing && typeof room.typing === 'object' ? room.typing : {};
  room.messages.forEach((message) => { message.readBy = Array.isArray(message.readBy) ? message.readBy : [message.authorEmail].filter(Boolean); });
  return room;
}

async function getMinefieldSettings(email) {
  const saved = await getJSON(STORE_NAMES.MESSAGE_FILTER_SETTINGS, `user:${email}`) || {};
  return { email, enabled:false, instruction:'', version:1, ...saved };
}

async function transformForViewer(message, viewerEmail, room, profiles, settings, isAdmin, options = {}) {
  const raw = String(message.text || '');
  const base = { ...message, text:raw, textChars:[...raw].length, textBytes:Buffer.byteLength(raw, 'utf8') };
  if (!raw || !settings.enabled || message.authorEmail === viewerEmail || isAdmin) return base;
  const cacheKey = `${room.id}:${message.id}:${viewerEmail}:${Number(settings.version) || 1}`;
  // 端末保存チャットでは変換結果もサーバーに残さない（noCache）
  const cached = options.noCache ? null : await getJSON(STORE_NAMES.MESSAGE_FILTER_CACHE, cacheKey);
  if (cached?.displayText !== undefined) return { ...base, text:String(cached.displayText), transformed:true, originalAvailable:true };
  const result = await callAiGateway({
    model:'gemini-2.5-flash',
    system:`あなたはMixAll +の個人表示フィルターです。受信者本人の設定に従い、受信者の画面に表示する文章へ変換してください。設定に該当しない場合は原文をそのまま返してください。説明や引用符は付けず本文だけを返してください。URL、メンション、固有名詞、コード、数値は不要に改変しないでください。\n個人設定:\n${String(settings.instruction || '').slice(0,3000)}\n\nこのチャットで確認できる運営区分:\n${operatorContext(room, profiles)}`,
    user:`表示対象メッセージ:\n${raw.slice(0,12000)}\n\n送信者: ${message.authorName || message.authorEmail}\n計測: 文字数=${[...raw].length}、UTF-8バイト数=${Buffer.byteLength(raw, 'utf8')}`
  });
  const displayText = result.ok && result.text ? result.text.slice(0,12000) : raw;
  if (result.ok && !options.noCache) await setJSON(STORE_NAMES.MESSAGE_FILTER_CACHE, cacheKey, { displayText, createdAt:new Date().toISOString(), model:result.model });
  return { ...base, text:displayText, transformed:result.ok && displayText !== raw, originalAvailable:result.ok && displayText !== raw };
}

async function transformMessagesForViewer(messages, viewerEmail, room, profiles, settings, isAdmin) {
  const result=[];
  for (const message of messages) result.push(await transformForViewer(message, viewerEmail, room, profiles, settings, isAdmin));
  return result;
}

// このメンバーが持つ権限を集約する (host/subHost/customRolesの合成)
function permissionsFor(room, email, isAdmin = false) {
  const isHost = room.hostEmail === email;
  const isSubHost = room.subHosts.includes(email);
  const perms = {
    kick: isHost || isSubHost,
    manageRoles: isHost || isSubHost,
    manageBots: isHost || isSubHost,
    canWrite: true // デフォルトは自由に発言可能
  };

  for (const role of room.customRoles) {
    if (!role.members.includes(email)) continue;
    if (role.permissions.kick) perms.kick = true;
    if (role.permissions.manageRoles) perms.manageRoles = true;
    if (role.permissions.manageBots) perms.manageBots = true;
    // restrictWrite: true のロールが1つでも付与されていれば発言不可(部屋主が制限をかけた場合)
    if (role.permissions.restrictWrite) perms.canWrite = false;
  }
  if (isHost || isAdmin) {
    perms.canWrite = true;
    perms.kick = true;
    perms.manageRoles = true;
    perms.manageBots = true;
  }
  return { isHost, isSubHost, isAdmin, canViewDeleted: isAdmin, ...perms };
}

function roomSummaryFor(room, viewerEmail) {
  const nickname = room.nicknames[viewerEmail];
  const lastMsg = room.messages.length ? room.messages[room.messages.length - 1] : null;
  return {
    id: room.id,
    type: room.type,
    title: room.title,
    myNickname: nickname || null,
    memberCount: room.memberEmails.length,
    lastMessage: lastMsg ? { id: lastMsg.id, vault: lastMsg.vault === true, text: lastMsg.text, authorName: lastMsg.authorName, createdAt: lastMsg.createdAt } : null,
    unreadCount: room.messages.filter((message) => message.authorEmail !== viewerEmail && !(message.readBy || []).includes(viewerEmail)).length,
    createdAt: room.createdAt
  };
}

exports.handler = async (event) => {


  try {
    return await handle(event);
  } catch (err) {
    console.error('pocket function error:', err);
    return json(500, { error: `内部エラー: ${err.message}` });
  }
};

async function handle(event) {
  const method = event.httpMethod;
  const qs = event.queryStringParameters || {};

  if (method !== 'GET' && method !== 'POST') {
    return json(405, { error: '未対応のメソッドです' });
  }

  let payload = {};
  if (method === 'POST') {
    try {
      payload = JSON.parse(event.body || '{}');
    } catch {
      return json(400, { error: '不正なリクエストです' });
    }
  } else {
    payload = qs;
  }

  const token = method === 'GET' ? qs.token : payload.token;
  const email = await requireSession(token);
  if (!email) return json(401, { error: 'ログインが必要です' });
  const isAdmin = Boolean(await requireAdmin(token));
  const isOfficial = Boolean((await getAccountProfile(email, { avatar:false }))?.isOfficial);

  // ---------- GET: ルーム一覧 or 詳細 ----------
  if (method === 'GET') {
    if (qs.roomId) {
      const room = await getRoom(qs.roomId);
      if (!room || !room.memberEmails.includes(email)) {
        return json(404, { error: 'ルームが見つかりません' });
      }
      const perms = permissionsFor(room, email, isAdmin);
      const visibleMessages = room.messages.filter((m) => !m.deleted || isAdmin);
      const limit = Math.max(20, Math.min(100, Number(qs.limit) || 60));
      const beforeIndex = qs.before ? visibleMessages.findIndex((message) => message.id === qs.before) : visibleMessages.length;
      const end = beforeIndex >= 0 ? beforeIndex : visibleMessages.length;
      const start = Math.max(0, end - limit);
      const pageMessages = visibleMessages.slice(start, end);
      const profiles = {};
      for (const memberEmail of room.memberEmails) profiles[memberEmail] = await getAccountProfile(memberEmail);
      for (const message of pageMessages) {
        if (!profiles[message.authorEmail]) profiles[message.authorEmail] = await getAccountProfile(message.authorEmail);
      }
      const settings = await getMinefieldSettings(email);
      const displayMessages = await transformMessagesForViewer(pageMessages, email, room, profiles, settings, isAdmin);
      const messages = displayMessages.map((m) => ({
        ...m,
        authorName: room.nicknames[m.authorEmail] || m.authorName,
        authorProfile: profiles[m.authorEmail]
      }));
      return json(200, {
        room: {
          id: room.id,
          type: room.type,
          title: room.title,
          memberEmails: room.memberEmails,
          hostEmail: room.hostEmail,
          subHosts: room.subHosts,
          customRoles: room.customRoles,
          nicknames: room.nicknames,
          bots: room.bots,
          threads: room.threads,
          profiles,
          messages,
          hasMoreMessages: start > 0,
          typing: Object.fromEntries(Object.entries(room.typing).filter(([, at]) => Number(at) > Date.now() - 7000))
        },
        myPermissions: perms
      });
    }

    const keys = await listKeys(STORE_NAMES.POCKET_ROOMS);
    const rooms = [];
    for (const key of keys) {
      const r = await getRoom(key);
      if (r && r.memberEmails.includes(email)) {
        rooms.push(roomSummaryFor(r, email));
      }
    }
    rooms.sort((a, b) => {
      const at = a.lastMessage ? a.lastMessage.createdAt : a.createdAt;
      const bt = b.lastMessage ? b.lastMessage.createdAt : b.createdAt;
      return new Date(bt) - new Date(at);
    });
    return json(200, { rooms });
  }

  // ---------- POST: 各種アクション ----------
  const { action } = payload;

  if (action === 'getMinefieldSettings') {
    return json(200, { settings: await getMinefieldSettings(email) });
  }
  if (action === 'saveMinefieldSettings') {
    const instruction = String(payload.instruction || '').trim().slice(0, 4000);
    const current = await getMinefieldSettings(email);
    const settings = { email, enabled:payload.enabled === true, instruction, version:Number(current.version || 1) + 1, updatedAt:new Date().toISOString() };
    await setJSON(STORE_NAMES.MESSAGE_FILTER_SETTINGS, `user:${email}`, settings);
    return json(200, { settings });
  }
  if (action === 'getOriginalMessage') {
    const room = await getRoom(payload.roomId);
    if (!room || !room.memberEmails.includes(email)) return json(404, { error:'ルームが見つかりません' });
    const message = room.messages.find((item) => item.id === String(payload.messageId));
    if (!message || message.deleted) return json(404, { error:'メッセージが見つかりません' });
    const text = String(message.text || '');
    return json(200, { messageId:message.id, text, textChars:[...text].length, textBytes:Buffer.byteLength(text, 'utf8') });
  }

  if (action === 'urlPreview') {
    let target;
    try { target = new URL(String(payload.url || '')); } catch (_) { return json(400, { error:'URLが不正です' }); }
    if (!/^https?:$/.test(target.protocol) || /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.)/i.test(target.hostname)) return json(400, { error:'このURLはプレビューできません' });
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(target.href, { headers:{'User-Agent':'MixAllPlus-LinkPreview/1.0'}, signal:controller.signal });
      const html = (await response.text()).slice(0, 500000);
      const meta = (key) => { const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${key}["']`, 'i'); const m=html.match(re); return String(m?.[1] || m?.[2] || '').replace(/&amp;/g,'&').replace(/&quot;/g,'"').trim(); };
      const title = meta('og:title') || (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/<[^>]+>/g,'').trim();
      return json(200, { title:title.slice(0,160), description:meta('og:description').slice(0,300), image:meta('og:image').slice(0,1000), siteName:meta('og:site_name').slice(0,100) });
    } catch (error) { return json(200, { title:target.hostname, description:'', image:'', siteName:target.hostname }); }
    finally { clearTimeout(timer); }
  }

  if (action === 'markRead') {
    const room = await getRoom(payload.roomId);
    if (!room || !room.memberEmails.includes(email)) return json(404, { error: 'ルームが見つかりません' });
    const ids = new Set(Array.isArray(payload.messageIds) ? payload.messageIds.map(String) : []);
    const upTo = payload.upToMessageId ? room.messages.findIndex((message) => message.id === payload.upToMessageId) : room.messages.length - 1;
    room.messages.forEach((message, index) => { if ((ids.size ? ids.has(message.id) : index <= upTo) && !(message.readBy || []).includes(email)) message.readBy.push(email); });
    await setJSON(STORE_NAMES.POCKET_ROOMS, room.id, room);
    return json(200, { ok:true });
  }

  if (action === 'setTyping') {
    const room = await getRoom(payload.roomId);
    if (!room || !room.memberEmails.includes(email)) return json(404, { error: 'ルームが見つかりません' });
    if (payload.active) room.typing[email] = Date.now(); else delete room.typing[email];
    await setJSON(STORE_NAMES.POCKET_ROOMS, room.id, room);
    return json(200, { ok:true });
  }

  // ルーム作成 (DM or グループ)
  if (action === 'createRoom') {
    const type = payload.type === 'group' ? 'group' : 'dm';
    const memberEmails = Array.from(
      new Set([email, ...(Array.isArray(payload.memberEmails) ? payload.memberEmails.map(normalizeEmail) : [])])
    ).filter(Boolean);

    if (type === 'dm' && memberEmails.length !== 2) {
      return json(400, { error: '個人チャットは相手を1人指定してください' });
    }
    if (memberEmails.length < 2) {
      return json(400, { error: 'メンバーが不足しています' });
    }

    // 相手先アカウントの実在確認
    for (const m of memberEmails) {
      if (m === email) continue;
      const acc = await getJSON(STORE_NAMES.ACCOUNTS, m);
      if (!acc) return json(404, { error: `${m} は存在しないアカウントです` });
    }

    const id = newId();
    const room = {
      id,
      type,
      title: type === 'group' ? (payload.title || 'グループ') : null,
      memberEmails,
      hostEmail: email,
      subHosts: [],
      customRoles: [],
      nicknames: {},
      bots: [],
      threads: [],
      messages: [],
      createdAt: new Date().toISOString()
    };
    await setJSON(STORE_NAMES.POCKET_ROOMS, id, room);
    return json(201, { room: roomSummaryFor(room, email) });
  }

  // 親メッセージ内の子チャット（Pocketスレッド）を作成する。
  if (action === 'createThread') {
    const room = await getRoom(payload.roomId);
    if (!room || !room.memberEmails.includes(email)) return json(404, { error:'ルームが見つかりません' });
    const parent = room.messages.find((item) => item.id === payload.parentMessageId && !item.deleted);
    if (!parent) return json(404, { error:'親メッセージが見つかりません' });
    const existing = room.threads.find((item) => item.parentMessageId === parent.id);
    if (existing) return json(200, { thread:existing });
    const thread = { id:newId(), roomId:room.id, parentMessageId:parent.id, title:String(payload.title || 'スレッド').trim().slice(0,80) || 'スレッド', createdBy:email, createdAt:new Date().toISOString() };
    room.threads.push(thread);
    await setJSON(STORE_NAMES.POCKET_ROOMS, room.id, room);
    return json(201,{thread});
  }

  // メッセージ送信 (本文・添付。threadId指定時は子チャットへ送信)
  if (action === 'sendMessage') {
    const room = await getRoom(payload.roomId);
    if (!room || !room.memberEmails.includes(email)) return json(404, { error: 'ルームが見つかりません' });

    const perms = permissionsFor(room, email, isAdmin);
    if (!perms.canWrite) return json(403, { error: 'このルームでは発言が制限されています' });

    const text = (payload.text || '').trim();
    const threadId = payload.threadId ? String(payload.threadId).slice(0,80) : null;
    if (threadId && !room.threads.some((item) => item.id === threadId)) return json(404,{error:'スレッドが見つかりません'});
    // 添付ファイルは /.netlify/functions/files でクライアント側が事前にチャンク分割アップロード済みで、
    // ここでは軽量な参照(fileId/name/type/sizeBytes)だけを受け取る。本文に中身は一切埋め込まない。
    // (メッセージ本体に中身を埋め込むと、ルーム取得の1レスポンスがすぐ6MBの上限を超えてしまうため)
    let attachment = null;
    if (payload.poll) {
      if (room.type !== 'group') return json(400, { error:'投票はグループチャットでのみ作成できます' });
      const question = String(payload.poll.question || '').trim().slice(0, 240);
      const options = Array.from(new Set((Array.isArray(payload.poll.options) ? payload.poll.options : []).map((item) => String(item).trim().slice(0, 80)).filter(Boolean))).slice(0, 10);
      if (!question || options.length < 2) return json(400, { error:'投票の質問と2つ以上の選択肢が必要です' });
      attachment = { isPoll:true, question, options:options.map((label, index) => ({ id:String(index), label, voters:[] })), multiple:Boolean(payload.poll.multiple) };
    } else if (payload.location && Number.isFinite(Number(payload.location.lat)) && Number.isFinite(Number(payload.location.lng))) {
      const lat = Number(payload.location.lat); const lng = Number(payload.location.lng);
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return json(400, { error:'位置情報が不正です' });
      attachment = { isLocation:true, lat, lng, label:String(payload.location.label || '送信した位置').slice(0, 120) };
    } else if (payload.attachment && payload.attachment.shortUrl && /^image\//i.test(String(payload.attachment.type || ''))) {
      const shortUrl = String(payload.attachment.shortUrl).trim();
      if (!/^https:\/\/x\.gd\/[A-Za-z0-9_]+$/.test(shortUrl)) return json(400, { error:'画像の短縮URLが不正です' });
      attachment = {
        name: String(payload.attachment.name || 'image').slice(0, 160),
        type: String(payload.attachment.type).slice(0, 120),
        sizeBytes: Number(payload.attachment.sizeBytes) || 0,
        mediaHash: /^[a-f0-9]{64}$/i.test(String(payload.attachment.mediaHash || '')) ? String(payload.attachment.mediaHash).toLowerCase() : null,
        shortUrl
      };
    } else if (payload.attachment && payload.attachment.fileId) {
      if (payload.attachment.isStamp) {
        const stampKeys = await listKeys(STORE_NAMES.STAMPS);
        let stamp = null;
        for (const key of stampKeys) {
          const candidate = await getJSON(STORE_NAMES.STAMPS, key);
          if (candidate && candidate.fileId === payload.attachment.fileId) { stamp = candidate; break; }
        }
        if (!stamp) return json(404, { error: 'スタンプが見つかりません' });
        const price = Math.max(0, Number(stamp.priceCoins) || 0);
        const owner = await getJSON(STORE_NAMES.STAMP_OWNERS, `${email}:${stamp.id}`);
        if (price > 0 && !owner && !isAdmin && !isOfficial) return json(402, { error: 'この有料スタンプは購入後に送信できます' });
      } else {
        const manifest=await getJSON(STORE_NAMES.FILE_MANIFESTS, `${String(payload.attachment.fileId).trim()}:manifest`);
        if (!manifest?.finalized) return json(400,{error:'添付ファイルのアップロードが完了していません'});
        if (manifest.ownerEmail!==email) return json(403,{error:'この添付ファイルを投稿する権限がありません'});
      }
      attachment = {
        fileId: String(payload.attachment.fileId).slice(0, 80),
        name: String(payload.attachment.name || 'file').slice(0, 160),
        type: String(payload.attachment.type || 'application/octet-stream').slice(0, 120),
        sizeBytes: Number(payload.attachment.sizeBytes) || 0,
        isStamp: payload.attachment.isStamp === true,
        isVoiceMessage: payload.attachment.isVoiceMessage === true,
        durationMs: Math.max(0, Math.min(3600000, Number(payload.attachment.durationMs) || 0)),
        // スタンプは軽量サムネイルを即時表示に使い、裏で高画質版に差し替える
        thumbnailDataUrl: payload.attachment.isStamp && typeof payload.attachment.thumbnailDataUrl === 'string'
          ? payload.attachment.thumbnailDataUrl.slice(0, 130000) : null
      };
      if (!attachment.isStamp && /^image\//i.test(attachment.type)) {
        try { attachment = await dedupeImageAttachment(event, attachment, email); }
        catch (error) { console.warn('Pocket image dedupe skipped; keeping Blob attachment:', error.message); }
      }
    }
    if (!text && !attachment) return json(400, { error: '本文か添付ファイルのどちらかを入力してください' });

    const replyTo = payload.replyTo ? String(payload.replyTo).slice(0, 80) : null;
    const clientChars = Number(payload.textChars);
    const clientBytes = Number(payload.textBytes);
    const textChars = [...text].length;
    const textBytes = Buffer.byteLength(text, 'utf8');
    const message = { id: newId(), authorEmail: email, authorName: room.nicknames[email] || payload.displayName || email, text, textChars, textBytes, clientTextChars:Number.isFinite(clientChars) ? clientChars : null, clientTextBytes:Number.isFinite(clientBytes) ? clientBytes : null, metricsMismatch:(Number.isFinite(clientChars) && clientChars !== textChars) || (Number.isFinite(clientBytes) && clientBytes !== textBytes), attachment, replyTo, threadId: threadId || (replyTo ? replyTo : null), readBy:[email], createdAt: new Date().toISOString() };
    room.messages.push(message);
    const mentionedEmails = Array.from(new Set((text.match(/@[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []).map((value) => value.slice(1).toLowerCase())));
    const replyTarget = replyTo ? room.messages.find((item) => item.id === replyTo) : null;
    await notifyRecipients(room.memberEmails, `pocket:${room.id}`, { type:'pocketMessage', scope:`pocket:${room.id}`, roomId:room.id, messageId:message.id, actorEmail:email, title: room.title || 'Pocket', body: '新しいメッセージがあります', isReply:Boolean(replyTarget), replyToEmail:replyTarget?.authorEmail || null, isMessage:true, mentionedEmails, url:`/Pocket/room.html?id=${encodeURIComponent(room.id)}` });
    await setJSON(STORE_NAMES.POCKET_ROOMS, payload.roomId, room);
    let botPending = false;
    if (room.bots.some((bot) => bot.enabled !== false) || await hasOfficialAutomations('pocket')) {
      const task = { roomId:room.id, messageId:message.id, text, hasAttachment:Boolean(attachment) };
      try {
        await enqueueBackgroundTask(event, 'pocket-bots', task);
        botPending = true;
      } catch (dispatchError) {
        console.error('Pocket bot Background Function dispatch failed; using inline fallback:', dispatchError);
        try { await processPocketBotTask(task, crypto.randomBytes(24).toString('hex')); }
        catch (fallbackError) { console.error('Pocket bot fallback failed:', fallbackError); }
      }
    }
    try { require('../../server/plus').recordMission(email, 'pocket'); } catch (_) { /* デイリーミッション */ }
    return json(200, { ok: true, botPending });
  }

  if (action === 'votePoll') {
    const room = await getRoom(payload.roomId);
    if (!room || !room.memberEmails.includes(email)) return json(404, { error:'ルームが見つかりません' });
    const message = room.messages.find((item) => item.id === payload.messageId && item.attachment?.isPoll);
    if (!message) return json(404, { error:'投票が見つかりません' });
    const selected = new Set((Array.isArray(payload.optionIds) ? payload.optionIds : [payload.optionId]).map(String));
    message.attachment.options.forEach((option) => { option.voters = (option.voters || []).filter((voter) => voter !== email); if (selected.has(option.id)) option.voters.push(email); });
    await setJSON(STORE_NAMES.POCKET_ROOMS, room.id, room);
    return json(200, { ok:true, poll:message.attachment });
  }

  if (['listNotes','saveNote','deleteNote','shareNote','listAlbums','createAlbum','addAlbumImages','deleteAlbum'].includes(action)) {
    const room = await getRoom(payload.roomId);
    if (!room || !room.memberEmails.includes(email)) return json(404,{error:'ルームが見つかりません'});
    room.notes=Array.isArray(room.notes)?room.notes:[]; room.albums=Array.isArray(room.albums)?room.albums:[];
    if(action==='listNotes') return json(200,{notes:room.notes});
    if(action==='shareNote') { const note=room.notes.find(n=>n.id===payload.noteId); if(!note)return json(404,{error:'ノートが見つかりません'}); const message={id:crypto.randomBytes(8).toString('hex'),authorEmail:email,authorName:room.nicknames[email]||email,text:'',attachment:{isNote:true,noteId:note.id,label:'ノート'},readBy:[email],createdAt:new Date().toISOString()}; room.messages.push(message); await setJSON(STORE_NAMES.POCKET_ROOMS,room.id,room); return json(200,{message}); }
    if(action==='listAlbums') return json(200,{albums:room.albums});
    if(action==='deleteAlbum') { room.albums=room.albums.filter(a=>a.id!==payload.albumId); await setJSON(STORE_NAMES.POCKET_ROOMS,room.id,room); return json(200,{albums:room.albums}); }
    if(action==='createAlbum') {
      const result=await normalizePocketMedia(payload.images,email,100); if(result.error)return json(result.status,{error:result.error});
      if(!result.items.length)return json(400,{error:'画像を1枚以上選択してください'});
      const album={id:crypto.randomBytes(8).toString('hex'),title:String(payload.title||'アルバム').slice(0,120),images:result.items.map(x=>({...x,id:crypto.randomBytes(6).toString('hex'),createdAt:new Date().toISOString()})),authorEmail:email,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
      room.albums.unshift(album); await setJSON(STORE_NAMES.POCKET_ROOMS,room.id,room); return json(200,{album,albums:room.albums});
    }
    if(action==='addAlbumImages') {
      const album=room.albums.find(a=>a.id===payload.albumId); if(!album)return json(404,{error:'アルバムが見つかりません'});
      const result=await normalizePocketMedia(payload.images,email,100); if(result.error)return json(result.status,{error:result.error});
      if(!result.items.length)return json(400,{error:'画像を1枚以上選択してください'});
      album.images=[...(album.images||[]),...result.items.map(x=>({...x,id:crypto.randomBytes(6).toString('hex'),createdAt:new Date().toISOString()}))].slice(-200); album.updatedAt=new Date().toISOString(); await setJSON(STORE_NAMES.POCKET_ROOMS,room.id,room); return json(200,{album,albums:room.albums});
    }
    if(action==='deleteNote') { room.notes=room.notes.filter(n=>n.id!==payload.noteId); await setJSON(STORE_NAMES.POCKET_ROOMS,room.id,room); return json(200,{notes:room.notes}); }
    const result=await normalizePocketMedia(payload.media,email,20); if(result.error)return json(result.status,{error:result.error});
    const note={id:crypto.randomBytes(8).toString('hex'),title:String(payload.title||'').slice(0,120),body:String(payload.body||'').slice(0,10000),media:result.items,authorEmail:email,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}; if(!note.title&&!note.body&&!note.media.length)return json(400,{error:'投稿内容を入力してください'}); room.notes.unshift(note); await setJSON(STORE_NAMES.POCKET_ROOMS,room.id,room); return json(200,{note,notes:room.notes});
  }
  if (action === 'search') {
    const room = await getRoom(payload.roomId);
    if (!room || !room.memberEmails.includes(email)) return json(404, { error:'ルームが見つかりません' });
    const query = parseSearchQuery(payload.query);
    const messages = room.messages.filter((item) => !item.deleted && (!query.raw || (() => {
      const author = String(item.authorEmail || item.authorName || '').toLowerCase();
      // 本文は端末にしかないため、語句の絞り込みは端末側（chat-vault.js）で行う
      return query.author.every((x) => author.includes(x));
    })())).slice(-1000);
    const participants = room.memberEmails.map((member) => ({ email:member, name:room.nicknames?.[member] || member })).filter((item) => !query.raw || query.author.every((x) => `${item.email} ${item.name}`.toLowerCase().includes(x)) || query.terms.every((x) => `${item.email} ${item.name}`.toLowerCase().includes(x)));
    return json(200, { messages, participants, parsed:query, vaultSearch:true });
  }
  if (action === 'saveSearchHistory' || action === 'listSearchHistory') {
    const { STORE_NAMES, getJSON, setJSON } = require('../lib/store');
    const key = `user:${email}`; const current = await getJSON(STORE_NAMES.SEARCH_HISTORY, key) || { email, items:[] };
    if (action === 'saveSearchHistory') { const value=String(payload.query||'').trim().slice(0,240); if (value) current.items=[value,...(current.items||[]).filter((x)=>x!==value)].slice(0,30); await setJSON(STORE_NAMES.SEARCH_HISTORY,key,current); }
    return json(200,{items:current.items||[]});
  }
  if (action === 'pinRoom' || action === 'blockMember') {
    const room = await getRoom(payload.roomId);
    if (!room || !room.memberEmails.includes(email)) return json(404, { error:'ルームが見つかりません' });
    if (action === 'pinRoom') { room.pinnedBy = Array.isArray(room.pinnedBy) ? room.pinnedBy : []; if (payload.pinned === false) room.pinnedBy = room.pinnedBy.filter((item) => item !== email); else if (!room.pinnedBy.includes(email)) room.pinnedBy.push(email); }
    else { const target=String(payload.targetEmail||'').toLowerCase(); room.blockedBy = room.blockedBy || {}; room.blockedBy[email] = Array.isArray(room.blockedBy[email]) ? room.blockedBy[email] : []; if (payload.blocked === false) room.blockedBy[email]=room.blockedBy[email].filter((item)=>item!==target); else if (target && !room.blockedBy[email].includes(target)) room.blockedBy[email].push(target); }
    await setJSON(STORE_NAMES.POCKET_ROOMS, room.id, room); return json(200,{ok:true,room});
  }
  if (action === 'exportTxt') {
    const room = await getRoom(payload.roomId); if (!room || !room.memberEmails.includes(email)) return json(404,{error:'ルームが見つかりません'});
    // 本文は端末にしかないため、TXTは端末側で組み立てる
    const messages = room.messages.filter((item)=>!item.deleted).map((item)=>({ id:item.id, vault:item.vault===true, createdAt:item.createdAt, authorName:room.nicknames[item.authorEmail] || item.authorName || item.authorEmail, text:item.text || '' }));
    return json(200,{text:'',messages,vaultExport:true,filename:`pocket-${room.id}.txt`});
  }

  if (action === 'report') {
    const room = await getRoom(payload.roomId);
    if (!room || !room.memberEmails.includes(email)) return json(404, { error: '通報対象のルームが見つかりません' });
    const message = room.messages.find((item) => item.id === payload.messageId && !item.deleted);
    if (!message) return json(404, { error: '通報対象のメッセージが見つかりません' });
    const result = await createReport({
      reporterEmail: email, targetType: 'pocketMessage', targetId: `${room.id}:${message.id}`,
      reason: payload.reason, detail: payload.detail,
      // 本文は通報者の端末から送られたもの（evidence）だけを証拠として保存する
      snapshot: { roomId: room.id, messageId: message.id, authorEmail: message.authorEmail, text: String(payload.evidence?.text || message.text || '').slice(0, 12000), attachment: payload.evidence?.attachment || null, createdAt: message.createdAt, evidenceFromReporter: Boolean(payload.evidence) }
    });
    return json(201, { ok: true, duplicate: result.duplicate, reportId: result.report.id });
  }

  if (action === 'editMessage') {
    const room = await getRoom(payload.roomId);
    if (!room || !room.memberEmails.includes(email)) return json(404, { error: 'ルームが見つかりません' });
    const message = room.messages.find((m) => m.id === payload.messageId && !m.deleted);
    if (!message) return json(404, { error: 'メッセージが見つかりません' });
    if (message.authorEmail !== email && !isAdmin) return json(403, { error: '自分のメッセージのみ編集できます' });
    const text = String(payload.text || '').trim().slice(0, 12000);
    if (!text) return json(400, { error: '本文を入力してください' });
    if (text === String(message.text || '')) return json(200, { ok: true, message });
    message.editHistory = Array.isArray(message.editHistory) ? message.editHistory : [];
    message.editHistory.push({ text: String(message.text || ''), editedAt: message.editedAt || message.createdAt, editedBy: message.editedBy || message.authorEmail });
    message.editHistory = message.editHistory.slice(-20);
    message.text = text; message.editedAt = new Date().toISOString(); message.editedBy = email;
    await setJSON(STORE_NAMES.POCKET_ROOMS, payload.roomId, room);
    return json(200, { ok: true, message });
  }
  // メッセージ削除は本文を監査用に保持し、通常ユーザーの表示からは隠す
  if (action === 'deleteMessage') {
    const room = await getRoom(payload.roomId);
    if (!room || !room.memberEmails.includes(email)) return json(404, { error: 'ルームが見つかりません' });
    const message = room.messages.find((m) => m.id === payload.messageId);
    if (!message) return json(404, { error: 'メッセージが見つかりません' });
    if (!isAdmin && message.authorEmail !== email && room.hostEmail !== email) {
      return json(403, { error: 'このメッセージを削除する権限がありません' });
    }
    if (!message.deleted) {
      message.deleted = true;
      message.deletedAt = new Date().toISOString();
      message.deletedBy = email;
      message.deletedText = message.text;
      message.deletedAttachment = message.attachment;
      message.text = '';
      message.attachment = null;
    }
    await setJSON(STORE_NAMES.POCKET_ROOMS, payload.roomId, room);
    return json(200, { ok: true });
  }

  // 部屋ごとの表示名(自分のニックネーム)変更
  if (action === 'setNickname') {
    const room = await getRoom(payload.roomId);
    if (!room || !room.memberEmails.includes(email)) return json(404, { error: 'ルームが見つかりません' });

    const nickname = (payload.nickname || '').trim();
    if (nickname) {
      room.nicknames[email] = nickname;
    } else {
      delete room.nicknames[email];
    }
    await setJSON(STORE_NAMES.POCKET_ROOMS, payload.roomId, room);
    return json(200, { ok: true, nickname: room.nicknames[email] || null });
  }

  // ルーム名変更 (主または運営)
  if (action === 'renameRoom') {
    const room = await getRoom(payload.roomId);
    if (!room || !room.memberEmails.includes(email)) return json(404, { error: 'ルームが見つかりません' });
    if (room.hostEmail !== email && !isAdmin) return json(403, { error: 'ルーム名は主または運営のみ変更できます' });
    const title = String(payload.title || '').trim().slice(0, 80);
    if (!title) return json(400, { error: 'ルーム名を入力してください' });
    room.title = title;
    await setJSON(STORE_NAMES.POCKET_ROOMS, payload.roomId, room);
    return json(200, { ok: true, title });
  }

  // Uchの既存botをPocketへ追加。元スレッドの設定を参照して利用する。
  if (action === 'importUchBot') {
    const room = await getRoom(payload.roomId);
    if (!room || !room.memberEmails.includes(email)) return json(404, { error: 'ルームが見つかりません' });
    const perms = permissionsFor(room, email, isAdmin);
    if (!perms.manageBots) return json(403, { error: 'botを管理する権限がありません' });
    const sourceThread = await getJSON(STORE_NAMES.UCH_THREADS, payload.sourceThreadId);
    if (!sourceThread || (sourceThread.authorEmail !== email && !isAdmin)) return json(403, { error: '自分が主のUchスレッドまたは運営権限が必要です' });
    const sourceBots = await getJSON(STORE_NAMES.UCH_BOTS, payload.sourceThreadId) || [];
    const source = sourceBots.find((bot) => bot.id === payload.botId || bot.uchId === payload.botId || ('b' + require('crypto').createHash('sha256').update(`${payload.sourceThreadId}|${bot.id}`).digest('hex').slice(0, 10)) === payload.botId);
    if (!source) return json(404, { error: 'Uch botが見つかりません' });
    if (room.bots.some((bot) => bot.sourceThreadId === payload.sourceThreadId && bot.sourceBotId === source.id)) return json(409, { error: 'そのUch botは既に追加されています' });
    const bot = { id:newId(), name:source.name, icon:source.icon || (source.triggerType === 'ai' ? 'AI' : 'BOT'), replyMessage:source.replyMessage || source.cannedMessage || source.message || '', enabled:true, sourceThreadId:payload.sourceThreadId, sourceBotId:source.id, sourceTriggerType:source.triggerType || 'canned', triggerType:source.triggerType || 'canned', model:source.model || DEFAULT_GEMINI_MODEL, instruction:source.instruction || '', createdAt:new Date().toISOString() };
    room.bots.push(bot); await setJSON(STORE_NAMES.POCKET_ROOMS, payload.roomId, room);
    return json(201, { bot });
  }

  // bot追加 (主/副官/運営)。botはメンション時に定型返信する。
  if (action === 'addBot') {
    const room = await getRoom(payload.roomId);
    if (!room || !room.memberEmails.includes(email)) return json(404, { error: 'ルームが見つかりません' });
    const perms = permissionsFor(room, email, isAdmin);
    if (!perms.manageBots) return json(403, { error: 'botを管理する権限がありません' });
    const name = String(payload.name || '').trim().replace(/^@/, '').slice(0, 40);
    const triggerType = ['mention','every'].includes(payload.triggerType) ? payload.triggerType : 'mention';
    const botType = ['ai','mixbot'].includes(payload.botType) ? payload.botType : 'canned';
    const replyMessage = String(payload.replyMessage || '').trim().slice(0, 500);
    if (!name || (botType === 'canned' && !replyMessage)) return json(400, { error: 'bot名と返信文を入力してください' });
    if (room.bots.some((bot) => bot.name.toLowerCase() === name.toLowerCase())) return json(409, { error: '同じ名前のbotが既にあります' });
    const bot = { id: newId(), name, icon: String(payload.icon || (botType === 'ai' ? 'AI' : 'BOT')).slice(0, 4), botType, replyMessage, triggerType, model: normalizeGeminiModel(payload.model), instruction: String(payload.instruction || '').slice(0, 2000), enabled: true, createdAt: new Date().toISOString() };
    room.bots.push(bot);
    await setJSON(STORE_NAMES.POCKET_ROOMS, payload.roomId, room);
    return json(201, { bot });
  }

  if (action === 'removeBot') {
    const room = await getRoom(payload.roomId);
    if (!room || !room.memberEmails.includes(email)) return json(404, { error: 'ルームが見つかりません' });
    const perms = permissionsFor(room, email, isAdmin);
    if (!perms.manageBots) return json(403, { error: 'botを管理する権限がありません' });
    const before = room.bots.length;
    room.bots = room.bots.filter((bot) => bot.id !== payload.botId);
    if (room.bots.length === before) return json(404, { error: 'botが見つかりません' });
    await setJSON(STORE_NAMES.POCKET_ROOMS, payload.roomId, room);
    return json(200, { ok: true, bots: room.bots });
  }

  // 副官の任命/解任 (主のみ)
  if (action === 'setSubHost') {
    const room = await getRoom(payload.roomId);
    if (!room) return json(404, { error: 'ルームが見つかりません' });
    if (room.hostEmail !== email && !isAdmin) return json(403, { error: '主(ホスト)または運営のみ操作できます' });

    const target = normalizeEmail(payload.targetEmail);
    if (!room.memberEmails.includes(target)) return json(400, { error: 'メンバーではありません' });

    if (payload.appoint) {
      if (!room.subHosts.includes(target)) room.subHosts.push(target);
    } else {
      room.subHosts = room.subHosts.filter((e) => e !== target);
    }
    await setJSON(STORE_NAMES.POCKET_ROOMS, payload.roomId, room);
    return json(200, { subHosts: room.subHosts });
  }

  // カスタムロール作成 (主/副官のみ)
  if (action === 'createRole') {
    const room = await getRoom(payload.roomId);
    if (!room || !room.memberEmails.includes(email)) return json(404, { error: 'ルームが見つかりません' });
    const perms = permissionsFor(room, email, isAdmin);
    if (!perms.manageRoles) return json(403, { error: 'ロールを管理する権限がありません' });

    const role = {
      id: newId(),
      name: payload.name || 'ロール',
      color: payload.color || '#5b8cff',
      permissions: {
        kick: !!payload.permKick,
        manageRoles: !!payload.permManageRoles,
        manageBots: !!payload.permManageBots,
        restrictWrite: !!payload.permRestrictWrite
      },
      members: []
    };
    room.customRoles.push(role);
    await setJSON(STORE_NAMES.POCKET_ROOMS, payload.roomId, room);
    return json(201, { role });
  }

  // ロールの付与/解除
  if (action === 'assignRole') {
    const room = await getRoom(payload.roomId);
    if (!room || !room.memberEmails.includes(email)) return json(404, { error: 'ルームが見つかりません' });
    const perms = permissionsFor(room, email, isAdmin);
    if (!perms.manageRoles) return json(403, { error: 'ロールを管理する権限がありません' });

    const role = room.customRoles.find((r) => r.id === payload.roleId);
    if (!role) return json(404, { error: 'ロールが見つかりません' });
    const target = normalizeEmail(payload.targetEmail);
    if (!room.memberEmails.includes(target)) return json(400, { error: 'メンバーではありません' });

    if (payload.assign) {
      if (!role.members.includes(target)) role.members.push(target);
    } else {
      role.members = role.members.filter((e) => e !== target);
    }
    await setJSON(STORE_NAMES.POCKET_ROOMS, payload.roomId, room);
    return json(200, { role });
  }

  // メンバーのキック (主/副官/kick権限を持つロール)
  if (action === 'kickMember') {
    const room = await getRoom(payload.roomId);
    if (!room || !room.memberEmails.includes(email)) return json(404, { error: 'ルームが見つかりません' });
    const perms = permissionsFor(room, email, isAdmin);
    if (!perms.kick) return json(403, { error: 'キックする権限がありません' });

    const target = normalizeEmail(payload.targetEmail);
    if (target === room.hostEmail && !isAdmin) return json(400, { error: '主(ホスト)はキックできません' });

    room.memberEmails = room.memberEmails.filter((e) => e !== target);
    room.subHosts = room.subHosts.filter((e) => e !== target);
    room.customRoles.forEach((r) => { r.members = r.members.filter((e) => e !== target); });
    await setJSON(STORE_NAMES.POCKET_ROOMS, payload.roomId, room);
    return json(200, { ok: true });
  }

  // グループへの招待 (主/副官のみ)
  if (action === 'inviteMember') {
    const room = await getRoom(payload.roomId);
    if (!room || !room.memberEmails.includes(email)) return json(404, { error: 'ルームが見つかりません' });
    if (room.type !== 'group') return json(400, { error: '個人チャットには招待できません' });
    const perms = permissionsFor(room, email, isAdmin);
    if (!perms.manageRoles) return json(403, { error: '招待する権限がありません' });

    const target = normalizeEmail(payload.targetEmail);
    const acc = await getJSON(STORE_NAMES.ACCOUNTS, target);
    if (!acc) return json(404, { error: `${target} は存在しないアカウントです` });

    if (!room.memberEmails.includes(target)) room.memberEmails.push(target);
    await setJSON(STORE_NAMES.POCKET_ROOMS, payload.roomId, room);
    return json(200, { memberEmails: room.memberEmails });
  }

  return json(400, { error: '不明なactionです' });
}
