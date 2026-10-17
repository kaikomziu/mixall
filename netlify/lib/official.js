const crypto = require('crypto');
const { STORE_NAMES, getJSON, setJSON, listKeys } = require('./store');
const { callGemini } = require('./gemini');

function newId() { return crypto.randomBytes(10).toString('hex'); }
function cleanName(value) { return String(value || '').trim().replace(/^@/, '').replace(/[^\w\-.ぁ-んァ-ヶ一-龯]/g, '').slice(0, 40); }
function mentionRegExp(name) { return new RegExp(`@${String(name).replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}(?=$|\\s|[、,:：])`, 'i'); }
function listOf(value) { return Array.isArray(value) ? value.map((item) => String(item).trim().toLowerCase()).filter(Boolean).slice(0, 30) : []; }
function timeInRange(value, start, end) {
  if (!/^\d{2}:\d{2}$/.test(String(start || '')) || !/^\d{2}:\d{2}$/.test(String(end || ''))) return true;
  const current = String(value).slice(0, 5); if (!/^\d{2}:\d{2}$/.test(current)) return true;
  return start <= end ? current >= start && current <= end : current >= start || current <= end;
}
function conditionsMatch(conditions, event) {
  const c = conditions && typeof conditions === 'object' ? conditions : {};
  const text = String(event.text || '');
  const lower = text.toLowerCase();
  const email = String(event.authorEmail || '').toLowerCase();
  const fromEmails = listOf(c.fromEmails); if (fromEmails.length && !fromEmails.includes(email)) return false;
  if (c.fromIncludes && !email.includes(String(c.fromIncludes).toLowerCase())) return false;
  for (const item of listOf(c.textIncludes)) if (!lower.includes(item)) return false;
  for (const item of listOf(c.textExcludes)) if (lower.includes(item)) return false;
  const history = String(event.history || '').toLowerCase();
  for (const item of listOf(c.historyIncludes)) if (!history.includes(item)) return false;
  for (const item of listOf(c.historyExcludes)) if (history.includes(item)) return false;
  const historyCount = Number(event.historyMessageCount ?? (event.history ? String(event.history).split('\n').filter(Boolean).length : 0));
  if (Number.isFinite(Number(c.historyMessageCountMin)) && historyCount < Number(c.historyMessageCountMin)) return false;
  if (Number.isFinite(Number(c.historyMessageCountMax)) && historyCount > Number(c.historyMessageCountMax)) return false;
  if (c.textRegex) {
    const pattern = String(c.textRegex).slice(0, 160);
    try { if (!new RegExp(pattern, 'i').test(text)) return false; } catch { return false; }
  }
  const rooms = listOf(c.roomIds); if (rooms.length && !rooms.includes(String(event.roomId || '').toLowerCase())) return false;
  const threads = listOf(c.threadIds); if (threads.length && !threads.includes(String(event.threadId || '').toLowerCase())) return false;
  if (typeof c.hasAttachment === 'boolean' && Boolean(event.hasAttachment) !== c.hasAttachment) return false;
  if (typeof c.isReply === 'boolean' && Boolean(event.isReply) !== c.isReply) return false;
  const status = c.ghostStatus && typeof c.ghostStatus === 'object' ? c.ghostStatus : {};
  const currentStatus = event.ghostStatus && typeof event.ghostStatus === 'object' ? event.ghostStatus : {};
  for (const key of ['contentType', 'title', 'visibility']) if (status[key] !== undefined && String(currentStatus[key] ?? '') !== String(status[key])) return false;
  for (const key of ['hasMedia', 'hasTitle', 'isVideo', 'isShort']) if (typeof status[key] === 'boolean' && Boolean(currentStatus[key]) !== status[key]) return false;
  if (Array.isArray(c.daysOfWeek) && c.daysOfWeek.length) {
    const day = new Date(event.now || Date.now()).getUTCDay();
    if (!c.daysOfWeek.map(Number).includes(day)) return false;
  }
  if (c.timeRangeUtc && !timeInRange(new Date(event.now || Date.now()).toISOString().slice(11, 16), c.timeRangeUtc.start, c.timeRangeUtc.end)) return false;
  return true;
}
function publicOfficial(account) {
  return { id: account.id, name: account.name, handle: account.handle, displayName: account.displayName, icon: account.icon || '公式', enabled: account.enabled !== false, channels: account.channels || [], ruleCount: Array.isArray(account.rules) ? account.rules.length : 0, createdAt: account.createdAt };
}

async function listOfficialAccounts() {
  const rows = [];
  for (const key of await listKeys(STORE_NAMES.OFFICIAL_ACCOUNTS)) {
    const account = await getJSON(STORE_NAMES.OFFICIAL_ACCOUNTS, key);
    if (account && account.id) rows.push(account);
  }
  return rows.sort((a, b) => String(a.displayName).localeCompare(String(b.displayName), 'ja'));
}

async function hasOfficialAutomations(channel) {
  const accounts = await listOfficialAccounts();
  return accounts.some((account) => account.enabled !== false && (account.channels || []).includes(channel) && (account.rules || []).some((rule) => rule && rule.enabled !== false));
}

function ruleMatches(rule, event) {
  if (!rule || rule.enabled === false || rule.channel !== event.channel) return false;
  if (!conditionsMatch(rule.conditions, event)) return false;
  const trigger = rule.trigger || 'mention';
  if (trigger === 'every') return true;
  if (trigger === 'keyword') return rule.keyword && event.text.toLowerCase().includes(String(rule.keyword).toLowerCase());
  return mentionRegExp(event.handle || '').test(event.text);
}

async function createGhostPost(account, text, event) {
  const id = event.jobId && Number.isInteger(event.ruleIndex) ? crypto.createHash('sha256').update(`official-ghost:${event.jobId}:${account.id}:${event.ruleIndex}`).digest('hex').slice(0, 20) : newId();
  const post = { id, authorEmail: `official:${account.id}`, authorName: account.displayName, isBot: true, officialAccountId: account.id, title: null, description: text, text, media: [], contentType: 'text', tags: [], stickerId: null, likes: [], comments: [], replyTo: event.sourceId || null, ...(event.jobId ? { backgroundJobId:event.jobId } : {}), createdAt: new Date().toISOString() };
  await setJSON(STORE_NAMES.GHOST_POSTS, post.id, post);
  return post;
}

async function runOfficialRules(event) {
  const accounts = await listOfficialAccounts();
  const results = [];
  for (const account of accounts) {
    if (account.enabled === false || !(account.channels || []).includes(event.channel)) continue;
    for (const [ruleIndex, rule] of (account.rules || []).entries()) {
      if (!ruleMatches(rule, { ...event, handle: account.handle })) continue;
      let text = String(rule.text || '').slice(0, 5000);
      if (rule.action === 'ai') {
        const prompt = event.text.replace(mentionRegExp(account.handle), '').trim() || '挨拶をしてください。';
        const result = await callGemini({ model: rule.model || 'gemini-2.0-flash', timeoutMs: 20000, body: { systemInstruction: { parts: [{ text: rule.instruction || `あなたは公式アカウント「${account.displayName}」です。日本語で安全に回答してください。` }] }, contents: [{ parts: [{ text: `会話履歴:\n${String(event.history || '').slice(-12000)}\n\n${prompt}` }] }], generationConfig: { maxOutputTokens: 1200, temperature: 0.7 } } });
        text = result.ok ? (result.data.candidates?.[0]?.content?.parts || []).map((part) => part.text || '').join('').trim() : (result.error || 'AIから返信を取得できませんでした。');
      }
      if (!text) continue;
      const result = { account, rule, text };
      result.ruleIndex = ruleIndex;
      if (rule.action === 'ghostPost') result.post = await createGhostPost(account, text, { ...event, ruleIndex });
      results.push(result);
      if (rule.stopAfterMatch !== false) break;
    }
  }
  return results;
}

module.exports = { newId, cleanName, publicOfficial, listOfficialAccounts, hasOfficialAutomations, runOfficialRules, conditionsMatch };
