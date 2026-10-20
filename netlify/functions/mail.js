// netlify/functions/mail.js
// 疑似メール「Mail」: 「ぽけっと」とは完全に独立したデータで動くGmail風スレッド。
// 件名付きのスレッド作成・返信のみのシンプルな仕組み。

const crypto = require('crypto');
const { STORE_NAMES, getJSON, setJSON, listKeys } = require('../lib/store');
const { requireSession, getAccountProfile } = require('../lib/session');
const { createReport } = require('../lib/reports');
const { sendEmailTemplate, emailConfigurationMissing, buildSiteUrl } = require('../lib/email-integration');

function json(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body)
  };
}

function newId() {
  return crypto.randomBytes(8).toString('hex');
}

function normalizeEmail(input) {
  return String(input || '').trim().toLowerCase();
}

function isValidExternalEmail(email) {
  if (email.length > 254 || /[\s<>]/.test(email)) return false;
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(email);
}

function normalizeSubject(input) {
  return String(input || '').replace(/[\r\n\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150) || '(件名なし)';
}

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_EXTERNAL_ATTACHMENT_BYTES = 4 * 1024 * 1024;
function normalizeAttachment(input) {
  if (!input || !input.dataUrl) return null;
  const dataUrl = String(input.dataUrl);
  if (dataUrl.length > MAX_ATTACHMENT_BYTES * 1.4) throw new Error('添付ファイルは10MB程度までです');
  const name=String(input.name || 'file').replace(/[\\/\u0000-\u001f\u007f]/g, '_').slice(0, 160);
  const rawType=String(input.type || 'application/octet-stream').slice(0, 120);
  const type=/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(rawType)?rawType:'application/octet-stream';
  return { name, type, dataUrl };
}

function emailAttachment(attachment) {
  if (!attachment) return [];
  const match=/^data:([^,]*);base64,([a-z0-9+/]+={0,2})$/i.exec(String(attachment.dataUrl || ''));
  if (!match) throw new Error('外部メール添付の形式が不正です');
  const content=match[2];
  const bytes=Buffer.from(content,'base64');
  if (bytes.length>MAX_EXTERNAL_ATTACHMENT_BYTES) throw new Error('Gmailなど外部宛ての添付は1ファイル4MiBまでです');
  if (bytes.toString('base64')!==content) throw new Error('外部メール添付のBase64データが不正です');
  const detectedType=match[1].split(';')[0]||'application/octet-stream';
  return [{content,filename:attachment.name,type:/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(attachment.type)?attachment.type:detectedType}];
}

async function reserveExternalSend(senderEmail, recipientEmail) {
  const key=`mail-outbound:${crypto.createHash('sha256').update(senderEmail).digest('hex').slice(0,32)}`;
  const now=Date.now(),windowMs=24*60*60*1000;
  const record=await getJSON(STORE_NAMES.ACCOUNT_RECOVERY,key)||{events:[]};
  const events=(Array.isArray(record.events)?record.events:[]).filter((item)=>Number(item?.at)>now-windowMs);
  if(events.length>=20)return {allowed:false,retryAt:events[0].at+windowMs};
  const sameRecipient=events.filter((item)=>item.to===recipientEmail);
  if(sameRecipient.length>=5)return {allowed:false,retryAt:sameRecipient[0].at+windowMs};
  events.push({to:recipientEmail,at:now});
  await setJSON(STORE_NAMES.ACCOUNT_RECOVERY,key,{events});
  return {allowed:true};
}

function safeMailUrl(event) {
  try { return buildSiteUrl(event, '/Mail/'); } catch { return ''; }
}

// AgentMailのスレッドとMailのスレッドを結びつける（相手の返信をWebhookで戻すため）
async function linkAgentMail(thread, sent) {
  if (!sent || sent.provider !== 'agentmail' || !sent.threadId) return;
  thread.agentmail = { threadId: sent.threadId, lastMessageId: sent.messageId || thread.agentmail?.lastMessageId || null };
  await setJSON(STORE_NAMES.AGENTMAIL, `thread:${sent.threadId}`, { mailThreadId: thread.id, externalRecipient: thread.externalRecipient, updatedAt: new Date().toISOString() });
}

exports.handler = async (event) => {

  try {
    return await handle(event);
  } catch (err) {
    console.error('mail function error:', err);
    return json(500, { error: `内部エラー: ${err.message}` });
  }
};

async function handle(event) {
  const method = event.httpMethod;
  const qs = event.queryStringParameters || {};

  if (method !== 'GET' && method !== 'POST') return json(405, { error: '未対応のメソッドです' });

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

  // ---------- GET: 受信トレイ一覧 or スレッド詳細 ----------
  if (method === 'GET') {
    if (qs.threadId) {
      const thread = await getJSON(STORE_NAMES.MAIL_THREADS, qs.threadId);
      if (!thread || !thread.memberEmails.includes(email)) return json(404, { error: 'スレッドが見つかりません' });
      const profiles = {};
      for (const memberEmail of thread.memberEmails) profiles[memberEmail] = await getAccountProfile(memberEmail);
      return json(200, { thread: { ...thread, profiles, messages: thread.messages.map((message) => ({ ...message, authorProfile: profiles[message.authorEmail] || null })) } });
    }
    const keys = await listKeys(STORE_NAMES.MAIL_THREADS);
    const threads = [];
    const query = String(qs.q || '').trim().toLowerCase();
    const view = ['inbox', 'sent', 'all'].includes(qs.view) ? qs.view : 'inbox';
    for (const key of keys) {
      const t = await getJSON(STORE_NAMES.MAIL_THREADS, key);
      if (t && t.memberEmails.includes(email)) {
        const last = t.messages[t.messages.length - 1];
        const otherEmail = t.memberEmails.find((m) => m !== email) || email;
        const profile = await getAccountProfile(otherEmail);
        const hasIncoming = (t.messages || []).some((message) => message.authorEmail !== email);
        const hasOutgoing = (t.messages || []).some((message) => message.authorEmail === email);
        const sentByMe = hasOutgoing;
        const searchable = [t.subject, otherEmail, profile.displayName, ...(t.messages || []).map((m) => m.text)].join(' ').toLowerCase();
        // 件名・本文は端末にしかないため、端末保存済みスレッドの語句検索は端末側で絞り込む
        if (query && !searchable.includes(query) && !(t.vault || (t.messages || []).some((m) => m.vault))) continue;
        if (view === 'sent' && !hasOutgoing) continue;
        if (view === 'inbox' && !hasIncoming) continue;
        const lastReadAt = t.readBy && t.readBy[email] ? new Date(t.readBy[email]) : null;
        const unread = !!last && (!lastReadAt || lastReadAt < new Date(last.createdAt));
        threads.push({
          id: t.id,
          subject: t.subject,
          vault: t.vault === true,
          otherEmail,
          otherProfile: profile,
          lastMessage: last ? { id: last.id, vault: last.vault === true, text: last.text, authorEmail: last.authorEmail, createdAt: last.createdAt } : null,
          unread,
          sentByMe,
          externalDelivery: t.externalDelivery || null,
          createdAt: t.createdAt
        });
      }
    }
    threads.sort((a, b) => {
      const at = a.lastMessage ? a.lastMessage.createdAt : a.createdAt;
      const bt = b.lastMessage ? b.lastMessage.createdAt : b.createdAt;
      return new Date(bt) - new Date(at);
    });
    return json(200, { threads });
  }

  // ---------- POST ----------
  const { action } = payload;

  if (action === 'report') {
    const thread = await getJSON(STORE_NAMES.MAIL_THREADS, payload.threadId);
    if (!thread || !thread.memberEmails.includes(email)) return json(404, { error: '通報対象のスレッドが見つかりません' });
    const message = (thread.messages || []).find((item) => item.id === payload.messageId);
    if (!message) return json(404, { error: '通報対象のメールが見つかりません' });
    const result = await createReport({ reporterEmail: email, targetType: 'mailMessage', targetId: `${thread.id}:${message.id}`, reason: payload.reason, detail: payload.detail, snapshot: { threadId: thread.id, messageId: message.id, authorEmail: message.authorEmail, text: String(payload.evidence?.text || message.text || '').slice(0, 12000), subject: String(payload.evidence?.subject || thread.subject || '').slice(0, 300), evidenceFromReporter: Boolean(payload.evidence) } });
    return json(201, { ok: true, duplicate: result.duplicate, reportId: result.report.id });
  }

  // 新規メール送信 (スレッド作成)
  if (action === 'send') {
    const to = normalizeEmail(payload.to);
    if (!to) return json(400, { error: '宛先を入力してください' });
    const toAccount = await getJSON(STORE_NAMES.ACCOUNTS, to);
    const external = !toAccount;
    if (external && to.endsWith('@bix.3erver')) return json(404, { error: `${to} は存在しないMixAll +アカウントです` });
    if (external && !isValidExternalEmail(to)) return json(400, { error: '宛先アドレスの形式が正しくありません' });

    const subject = normalizeSubject(payload.subject);
    const body = (payload.body || '').trim();
    let attachment; try { attachment = normalizeAttachment(payload.attachment); } catch (error) { return json(400, { error:error.message }); }
    if (!body && !attachment) return json(400, { error: '本文か添付ファイルのどちらかを指定してください' });
    if (Buffer.byteLength(body, 'utf8') > 100 * 1024) return json(413, { error: '本文は100KiBまでです' });
    if (external && await emailConfigurationMissing()) return json(503, { error: 'Gmailなど外部宛ての送信設定が未完了です。運営側でメールプロバイダーと認証済み差出人を設定してください。' });

    let attachments=[];
    if(external){
      try{attachments=emailAttachment(attachment);}catch(error){return json(400,{error:error.message});}
      const quota=await reserveExternalSend(email,to);
      if(!quota.allowed){const waitHours=Math.max(1,Math.ceil((quota.retryAt-Date.now())/3600000));return json(429,{error:`外部宛てメールは1日20通、同じ宛先へ5通までです。約${waitHours}時間後に再試行してください。`});}
    }

    const id = newId();
    const createdAt = new Date().toISOString();
    const thread = {
      id,
      subject,
      memberEmails: [email, to],
      ...(external ? { externalRecipient:to, externalDelivery:{status:'sending',updatedAt:createdAt} } : {}),
      readBy: { [email]: new Date().toISOString() },
      messages: [
        {
          id: newId(),
          authorEmail: email,
          authorName: (await getAccountProfile(email)).displayName || email,
          text: body,
          attachment,
          createdAt
        }
      ],
      createdAt
    };
    await setJSON(STORE_NAMES.MAIL_THREADS, id, thread);
    if(external){
      const sender=await getAccountProfile(email);
      try{
        const sent=await sendEmailTemplate(event,{template:'mail-message',to,subject,parameters:{subject,senderName:String(sender.displayName||email).slice(0,80),senderAccount:email,body:body||'（本文はありません。添付ファイルをご確認ください。）',mailUrl:safeMailUrl(event)},attachments});
        thread.externalDelivery={status:'sent',provider:sent?.provider||'netlify-email',updatedAt:new Date().toISOString()};
        await linkAgentMail(thread,sent);
        thread.messages[0].externalDeliveryStatus='sent';
        await setJSON(STORE_NAMES.MAIL_THREADS,id,thread);
      }catch(error){
        thread.externalDelivery={status:'failed',updatedAt:new Date().toISOString()};
        thread.messages[0].externalDeliveryStatus='failed';
        await setJSON(STORE_NAMES.MAIL_THREADS,id,thread);
        if(error.code==='EMAIL_NOT_CONFIGURED')return json(503,{error:'メール送信設定が未完了です。プロバイダーAPIキーと認証済み差出人を確認してください。送信内容は送信済みフォルダーに未送信として保存しました。'});
        return json(502,{error:'Gmailなど外部宛ての送信に失敗しました。送信元ドメイン認証とプロバイダー設定を確認してください。送信内容は送信済みフォルダーに未送信として保存しました。'});
      }
    }
    return json(201, { thread });
  }

  // 返信
  if (action === 'reply') {
    const thread = await getJSON(STORE_NAMES.MAIL_THREADS, payload.threadId);
    if (!thread || !thread.memberEmails.includes(email)) return json(404, { error: 'スレッドが見つかりません' });

    const body = (payload.body || '').trim();
    let attachment; try { attachment = normalizeAttachment(payload.attachment); } catch (error) { return json(400, { error:error.message }); }
    if (!body && !attachment) return json(400, { error: '本文か添付ファイルのどちらかを指定してください' });
    if (Buffer.byteLength(body, 'utf8') > 100 * 1024) return json(413, { error: '本文は100KiBまでです' });

    let externalAttachments=[];
    if(thread.externalRecipient&&thread.externalRecipient!==email){
      if(await emailConfigurationMissing())return json(503,{error:'メール送信設定が未完了です。プロバイダーAPIキーと認証済み差出人を確認してください。'});
      try{externalAttachments=emailAttachment(attachment);}catch(error){return json(400,{error:error.message});}
      const quota=await reserveExternalSend(email,thread.externalRecipient);
      if(!quota.allowed){const waitHours=Math.max(1,Math.ceil((quota.retryAt-Date.now())/3600000));return json(429,{error:`外部宛てメールは1日20通、同じ宛先へ5通までです。約${waitHours}時間後に再試行してください。`});}
    }

    const message={
      id: newId(),
      authorEmail: email,
      authorName: (await getAccountProfile(email)).displayName || email,
      text: body,
      attachment,
      createdAt: new Date().toISOString()
    };
    const externalReply=Boolean(thread.externalRecipient&&thread.externalRecipient!==email);
    if(externalReply){message.externalDeliveryStatus='sending';thread.externalDelivery={status:'sending',updatedAt:message.createdAt};}
    thread.messages.push(message);
    thread.readBy = thread.readBy || {};
    thread.readBy[email] = new Date().toISOString();
    await setJSON(STORE_NAMES.MAIL_THREADS, payload.threadId, thread);
    if(externalReply){
      const sender=await getAccountProfile(email);
      try{
        // 件名はサーバーに残していない（端末保存）ため、端末から送られた件名を使う
        const replySubject=normalizeSubject(`Re: ${String(payload.subject||thread.subject||'').replace(/^(re:\s*)+/i,'')}`);
        const sent=await sendEmailTemplate(event,{template:'mail-message',to:thread.externalRecipient,subject:replySubject,replyToMessageId:thread.agentmail?.lastMessageId||null,parameters:{subject:replySubject,senderName:String(sender.displayName||email).slice(0,80),senderAccount:email,body:body||'（本文はありません。添付ファイルをご確認ください。）',mailUrl:safeMailUrl(event)},attachments:externalAttachments});
        message.externalDeliveryStatus='sent';thread.externalDelivery={status:'sent',provider:sent?.provider||'netlify-email',updatedAt:new Date().toISOString()};
        await linkAgentMail(thread,sent);
      }catch(error){
        message.externalDeliveryStatus='failed';thread.externalDelivery={status:'failed',updatedAt:new Date().toISOString()};
        await setJSON(STORE_NAMES.MAIL_THREADS,payload.threadId,thread);
        if(error.code==='EMAIL_NOT_CONFIGURED')return json(503,{error:'メール送信設定が未完了です。プロバイダーAPIキーと認証済み差出人を確認してください。返信は未送信として保存しました。'});
        return json(502,{error:'Gmailなど外部宛ての返信に失敗しました。送信元ドメイン認証とプロバイダー設定を確認してください。返信は未送信として保存しました。'});
      }
    }
    await setJSON(STORE_NAMES.MAIL_THREADS, payload.threadId, thread);
    return json(200, { thread });
  }

  // 既読にする
  if (action === 'markRead') {
    const thread = await getJSON(STORE_NAMES.MAIL_THREADS, payload.threadId);
    if (!thread || !thread.memberEmails.includes(email)) return json(404, { error: 'スレッドが見つかりません' });
    thread.readBy = thread.readBy || {};
    thread.readBy[email] = new Date().toISOString();
    await setJSON(STORE_NAMES.MAIL_THREADS, payload.threadId, thread);
    return json(200, { ok: true });
  }

  return json(400, { error: '不明なactionです' });
}
