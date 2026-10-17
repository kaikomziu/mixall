const crypto = require('crypto');
const { STORE_NAMES, getJSON, setJSON } = require('./store');

const MAX_ENTRIES = 80;
const MAX_TEXT = 6000;

function memoryKey(service, scopeId, botId) {
  const raw = `${String(service)}|${String(scopeId)}|${String(botId)}`;
  return `memory:${crypto.createHash('sha256').update(raw).digest('hex')}`;
}

async function getGeminiMemory(service, scopeId, botId) {
  const key = memoryKey(service, scopeId, botId);
  const memory = await getJSON(STORE_NAMES.GEMINI_MEMORIES, key);
  if (!memory || !Array.isArray(memory.entries)) return { key, service, scopeId:String(scopeId), botId:String(botId), entries:[] };
  return { ...memory, key, entries:memory.entries.slice(-MAX_ENTRIES) };
}

function formatGeminiMemory(memory) {
  if (!memory?.entries?.length) return 'まだ保存された長期記憶はありません。';
  return memory.entries.map((entry) => `[${entry.role === 'model' ? 'Gemini' : 'ユーザー'}] ${String(entry.text || '').slice(0, MAX_TEXT)}`).join('\n').slice(-30000);
}

async function appendGeminiMemory(service, scopeId, botId, entries) {
  const memory = await getGeminiMemory(service, scopeId, botId);
  const additions = (Array.isArray(entries) ? entries : []).map((entry) => ({
    role: entry.role === 'model' ? 'model' : 'user',
    text: String(entry.text || '').trim().slice(0, MAX_TEXT),
    createdAt: new Date().toISOString()
  })).filter((entry) => entry.text);
  if (!additions.length) return memory;
  const updated = {
    format: 'mixall-gemini-memory',
    version: 1,
    service: String(service),
    scopeId: String(scopeId),
    botId: String(botId),
    entries: [...memory.entries, ...additions].slice(-MAX_ENTRIES),
    updatedAt: new Date().toISOString()
  };
  await setJSON(STORE_NAMES.GEMINI_MEMORIES, memory.key, updated);
  return { ...updated, key:memory.key };
}

module.exports = { getGeminiMemory, formatGeminiMemory, appendGeminiMemory };
