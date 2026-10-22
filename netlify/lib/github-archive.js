// netlify/lib/github-archive.js
// 重いファイル類（添付ファイルの断片・運営ファイル）を、Supabase から非公開の GitHub リポジトリへ移す。
// Supabase には「どこに置いたか」だけの小さな目印（スタブ）を残し、読むときに GitHub から取ってくる。
//
// 設定（mixall-config の env）:
//   MIXALL_GH_DATA_TOKEN  対象リポジトリだけに Contents の読み書き権限を付けた fine-grained token
//   MIXALL_GH_DATA_REPO   例: kaikomziu/mixall-data（非公開）
//   MIXALL_GH_DATA_BRANCH 省略時 main
const crypto = require('crypto');

const STUB_FIELD = '__archived';
const CACHE_LIMIT_BYTES = 24 * 1024 * 1024;
const cache = new Map(); // path -> { value, bytes }
let cacheBytes = 0;

function config() {
  const token = String(process.env.MIXALL_GH_DATA_TOKEN || '');
  const repo = String(process.env.MIXALL_GH_DATA_REPO || '');
  const branch = String(process.env.MIXALL_GH_DATA_BRANCH || 'main');
  return { token, repo, branch, enabled: Boolean(token && /^[\w.-]+\/[\w.-]+$/.test(repo)) };
}

function isStub(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && value[STUB_FIELD] && value[STUB_FIELD].path);
}

function pathFor(storeName, key) {
  const hash = crypto.createHash('sha256').update(`${storeName}\u0000${key}`).digest('hex');
  return `${storeName}/${hash.slice(0, 2)}/${hash}.json`;
}

async function gh(method, path, { body, raw } = {}) {
  const { token, repo } = config();
  const response = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'mixall-api',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const error = new Error(`GitHub ${method} ${response.status}: ${text.slice(0, 200)}`);
    error.status = response.status;
    throw error;
  }
  return raw ? response.text() : response.json();
}

function remember(path, value, bytes) {
  if (bytes > CACHE_LIMIT_BYTES / 4) return;
  cache.delete(path);
  cache.set(path, { value, bytes });
  cacheBytes += bytes;
  for (const [oldPath, entry] of cache) {
    if (cacheBytes <= CACHE_LIMIT_BYTES) break;
    cache.delete(oldPath);
    cacheBytes -= entry.bytes;
  }
}

// 値を GitHub に置き、Supabase に残すスタブを返す
async function archive(storeName, key, value) {
  const { repo, branch } = config();
  const path = pathFor(storeName, key);
  const text = JSON.stringify(value);
  let sha;
  try { sha = (await gh('GET', `${path}?ref=${encodeURIComponent(branch)}`)).sha; } catch (error) { if (error.status !== 404) throw error; }
  const result = await gh('PUT', path, { body: { message: `archive ${storeName}`, content: Buffer.from(text, 'utf8').toString('base64'), branch, ...(sha ? { sha } : {}) } });
  return { [STUB_FIELD]: { repo, branch, path, sha: result?.content?.sha || null, bytes: Buffer.byteLength(text, 'utf8'), at: new Date().toISOString() } };
}

// スタブから元の値を取り出す
async function restore(stub) {
  const info = stub[STUB_FIELD];
  const hit = cache.get(info.path);
  if (hit) { cache.delete(info.path); cache.set(info.path, hit); return structuredClone(hit.value); }
  if (!config().enabled) throw new Error('GitHubのデータ置き場が設定されていません');
  const text = await gh('GET', `${info.path}?ref=${encodeURIComponent(info.branch || config().branch)}`, { raw: true });
  const value = JSON.parse(text);
  remember(info.path, value, text.length);
  return structuredClone(value);
}

// 元データが消されたら GitHub 側も消す（履歴には残る）
async function remove(stub) {
  const info = stub[STUB_FIELD];
  cache.delete(info.path);
  if (!config().enabled) return;
  try {
    const current = await gh('GET', `${info.path}?ref=${encodeURIComponent(info.branch || config().branch)}`);
    await gh('DELETE', info.path, { body: { message: 'remove archived file', sha: current.sha, branch: info.branch || config().branch } });
  } catch (error) { if (error.status !== 404) console.error('[github-archive] delete failed:', error.message); }
}

module.exports = { config, isStub, archive, restore, remove, pathFor, STUB_FIELD };
