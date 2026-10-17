'use strict';

const dns = require('node:dns').promises;
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const path = require('node:path').posix;
const crypto = require('node:crypto');
const { URL } = require('node:url');

const MAX_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024;
const MAX_FILES = 32;
const MAX_HTML_PAGES = 8;
const MAX_REQUESTS = 36;
const MAX_RUNTIME_MS = 24000;
const MAX_REDIRECTS = 2;
const CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 4500;

class PublicSiteError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'PublicSiteError';
    this.statusCode = statusCode;
  }
}

const blockedV4 = new net.BlockList();
[
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]
].forEach(([address, prefix]) => blockedV4.addSubnet(address, prefix, 'ipv4'));

const blockedV6 = new net.BlockList();
[
  ['::', 96], ['::1', 128], ['::ffff:0:0', 96], ['64:ff9b::', 96], ['64:ff9b:1::', 48],
  ['100::', 64], ['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['fc00::', 7],
  ['fe80::', 10], ['fec0::', 10], ['ff00::', 8]
].forEach(([address, prefix]) => blockedV6.addSubnet(address, prefix, 'ipv6'));

function bareHost(hostname) {
  return String(hostname || '').replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
}

function isPublicIp(address) {
  const value = bareHost(address);
  const family = net.isIP(value);
  if (family === 4) return !blockedV4.check(value, 'ipv4');
  if (family === 6) return !blockedV6.check(value, 'ipv6');
  return false;
}

function assertSafeHostName(hostname) {
  const host = bareHost(hostname);
  if (!host || /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|example)$/i.test(host) || host === 'metadata' || host === 'metadata.google.internal') {
    throw new PublicSiteError('ローカル・予約ホスト名は取得できません');
  }
}

function parseAllowedUrl(raw, { allowHttp = false, expectedOrigin = '' } = {}) {
  let url;
  try { url = raw instanceof URL ? new URL(raw.href) : new URL(String(raw || '').trim()); }
  catch { throw new PublicSiteError('有効なサイトURLを入力してください'); }
  const protocols = allowHttp ? ['http:', 'https:'] : ['https:'];
  if (!protocols.includes(url.protocol)) throw new PublicSiteError('取得先には公開HTTPS URLを指定してください');
  if (url.username || url.password) throw new PublicSiteError('ユーザー名・パスワード付きURLは使用できません');
  const expectedPort = url.protocol === 'https:' ? '443' : '80';
  if (url.port && url.port !== expectedPort) throw new PublicSiteError('標準ポート（HTTPS 443 / HTTP 80）以外には接続できません');
  const host = bareHost(url.hostname);
  assertSafeHostName(host);
  if (net.isIP(host) && !isPublicIp(host)) throw new PublicSiteError('非公開・予約済みIPには接続できません');
  if (expectedOrigin && url.origin !== expectedOrigin) throw new PublicSiteError('入力したサイトと別オリジンのURLは取得できません');
  url.hash = '';
  return url;
}

async function resolvePublicAddresses(url) {
  const host = bareHost(url.hostname);
  let records;
  const family = net.isIP(host);
  try {
    records = family ? [{ address: host, family }] : await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    throw new PublicSiteError('サイトの公開DNSを確認できませんでした', 502);
  }
  if (!Array.isArray(records) || !records.length || records.length > 32) throw new PublicSiteError('サイトのDNS応答が不正です', 502);
  if (records.some((record) => !isPublicIp(record.address))) throw new PublicSiteError('非公開・予約済みIPを含むサイトには接続できません');
  return records.sort((a, b) => (a.family === 4 ? 0 : 1) - (b.family === 4 ? 0 : 1));
}

function requestOnce(url, address, { method = 'GET', maxBytes = MAX_FILE_BYTES, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let received = 0;
    const chunks = [];
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(value);
    };
    const host = bareHost(url.hostname);
    const transport = url.protocol === 'https:' ? https : http;
    const options = {
      protocol: url.protocol,
      hostname: host,
      port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
      method,
      path: `${url.pathname || '/'}${url.search || ''}`,
      headers: {
        'User-Agent': 'MixAll-PublicSiteSource/1.0',
        'Accept': 'text/html,application/xhtml+xml,text/css,application/javascript,text/javascript,application/json,application/manifest+json;q=0.9,*/*;q=0.1',
        'Accept-Encoding': 'identity',
        'Connection': 'close'
      },
      lookup: (_hostname, lookupOptions, callback) => {
        if (lookupOptions?.all) callback(null, [{ address: address.address, family: address.family }]);
        else callback(null, address.address, address.family);
      }
    };
    if (url.protocol === 'https:' && !net.isIP(host)) options.servername = host;

    const req = transport.request(options, (res) => {
      const status = Number(res.statusCode || 0);
      const headers = res.headers || {};
      const location = Array.isArray(headers.location) ? headers.location[0] : headers.location;
      const shouldRead = method === 'GET' && status >= 200 && status < 300 && maxBytes > 0;
      if (!shouldRead) {
        res.destroy();
        finish(null, { status, headers, location: location || '', body: Buffer.alloc(0) });
        return;
      }
      const encoding = String(headers['content-encoding'] || 'identity').toLowerCase();
      if (encoding !== 'identity' && encoding !== '') {
        res.destroy();
        finish(new PublicSiteError('圧縮された応答は安全のため取得しません', 502));
        return;
      }
      const declared = Number(headers['content-length']);
      if (Number.isFinite(declared) && declared > maxBytes) {
        res.destroy();
        finish(new PublicSiteError('ファイルがサイズ上限を超えています', 413));
        return;
      }
      res.on('data', (chunk) => {
        received += chunk.length;
        if (received > maxBytes) {
          res.destroy();
          req.destroy();
          finish(new PublicSiteError('ファイルがサイズ上限を超えています', 413));
          return;
        }
        chunks.push(chunk);
      });
      res.once('end', () => finish(null, { status, headers, location: location || '', body: Buffer.concat(chunks, received) }));
      res.once('error', (error) => finish(error));
      res.once('aborted', () => finish(new PublicSiteError('サイト応答が途中で終了しました', 502)));
    });
    const timer = setTimeout(() => req.destroy(new PublicSiteError('サイト応答がタイムアウトしました', 504)), timeoutMs);
    req.setTimeout(timeoutMs, () => req.destroy(new PublicSiteError('サイト応答がタイムアウトしました', 504)));
    req.once('error', (error) => finish(error instanceof PublicSiteError ? error : new PublicSiteError('サイトに接続できませんでした', 502)));
    req.end();
  });
}

async function requestPublicResource(raw, options = {}) {
  const allowHttp = options.allowHttp === true;
  const expectedOrigin = options.expectedOrigin || '';
  const method = String(options.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD'].includes(method)) throw new PublicSiteError('GET/HEAD以外のHTTPメソッドは使用できません');
  const maxBytes = Math.min(MAX_FILE_BYTES, Math.max(0, Number(options.maxBytes ?? MAX_FILE_BYTES)));
  const maxRedirects = Math.min(MAX_REDIRECTS, Math.max(0, Number(options.maxRedirects || 0)));
  let url = parseAllowedUrl(raw, { allowHttp, expectedOrigin });
  let redirects = 0;
  while (true) {
    const addresses = await resolvePublicAddresses(url);
    let response = null;
    let lastError = null;
    for (const address of addresses) {
      try {
        response = await requestOnce(url, address, { method, maxBytes, timeoutMs: options.timeoutMs || REQUEST_TIMEOUT_MS });
        break;
      } catch (error) {
        lastError = error;
        if (error.statusCode === 413) throw error;
      }
    }
    if (!response) throw lastError || new PublicSiteError('サイトに接続できませんでした', 502);
    const isRedirect = response.status >= 300 && response.status < 400 && response.location;
    if (!isRedirect || redirects >= maxRedirects) return { ...response, url };
    let next;
    try { next = new URL(String(response.location), url); }
    catch { throw new PublicSiteError('サイトのリダイレクト先が不正です', 502); }
    url = parseAllowedUrl(next, { allowHttp: false, expectedOrigin: expectedOrigin || url.origin });
    redirects += 1;
  }
}

function mimeType(headers) {
  return String(headers?.['content-type'] || '').split(';')[0].trim().toLowerCase();
}
function isHtmlMime(mime) { return mime === 'text/html' || mime === 'application/xhtml+xml'; }
function isJsMime(mime) { return ['application/javascript', 'text/javascript', 'application/x-javascript', 'application/ecmascript', 'text/ecmascript'].includes(mime); }
function isJsonMime(mime) { return ['application/json', 'application/manifest+json', 'application/source-map+json', 'text/json'].includes(mime); }
function extension(url) { return path.extname(url.pathname).toLowerCase(); }

function decodePathSegments(url) {
  const segments = [];
  for (const part of url.pathname.split('/').filter(Boolean)) {
    let value;
    try { value = decodeURIComponent(part); } catch { throw new PublicSiteError('サイトのパスが不正です'); }
    if (!value || value === '.' || value === '..' || value.includes('/') || value.includes('\\') || /[\u0000-\u001f\u007f]/.test(value) || value.startsWith('.')) {
      throw new PublicSiteError('隠しファイルや不正なパスは取得しません');
    }
    segments.push(value);
  }
  return segments;
}

function archivePath(url, kind) {
  let segments = decodePathSegments(url);
  if (kind === 'page') {
    if (!segments.length || url.pathname.endsWith('/')) segments.push('index.html');
    else {
      const leaf = segments.pop();
      const ext = path.extname(leaf).toLowerCase();
      segments.push(['.html', '.htm'].includes(ext) ? leaf : `${ext ? leaf.slice(0, -ext.length) : leaf}.html`);
    }
  } else if (!segments.length) return '';
  if (url.search) {
    const last = segments.pop();
    const ext = path.extname(last);
    const suffix = crypto.createHash('sha1').update(url.search).digest('hex').slice(0, 8);
    segments.push(`${ext ? last.slice(0, -ext.length) : last}-${suffix}${ext}`);
  }
  return segments.join('/');
}

function resolveSameOrigin(raw, base, origin) {
  const value = String(raw || '').trim().replace(/&amp;/gi, '&').replace(/&#38;/g, '&');
  if (!value || /^(?:#|javascript:|mailto:|tel:|data:|blob:)/i.test(value)) return null;
  let url;
  try { url = new URL(value, base); } catch { return null; }
  url.hash = '';
  if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password) return null;
  try { decodePathSegments(url); } catch { return null; }
  return url;
}

function tagAttributes(tag) {
  const attrs = Object.create(null);
  const body = tag.replace(/^<\w+\b|\s*\/?\s*>$/g, ' ');
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match;
  while ((match = re.exec(body))) attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  return attrs;
}

function looksLikePage(url) {
  const ext = extension(url);
  return !ext || ['.html', '.htm', '.php', '.aspx', '.jsp'].includes(ext);
}
function looksLikeJs(url) { return ['.js', '.mjs', '.cjs'].includes(extension(url)); }
function looksLikeCss(url) { return extension(url) === '.css'; }

function discoverHtml(source, baseUrl, origin, depth) {
  const assets = [];
  const pages = [];
  const tags = /<(script|link|a)\b[^>]*>/gi;
  let match;
  while ((match = tags.exec(source))) {
    const tagName = match[1].toLowerCase();
    const attrs = tagAttributes(match[0]);
    const raw = tagName === 'script' ? attrs.src : attrs.href;
    if (!raw) continue;
    const url = resolveSameOrigin(raw, baseUrl, origin);
    if (!url) continue;
    if (tagName === 'script' && looksLikeJs(url)) assets.push({ url, kind: 'script' });
    if (tagName === 'link') {
      const rel = String(attrs.rel || '').toLowerCase().split(/\s+/);
      if (rel.includes('stylesheet') && looksLikeCss(url)) assets.push({ url, kind: 'style' });
      else if ((rel.includes('modulepreload') || (rel.includes('preload') && attrs.as === 'script')) && looksLikeJs(url)) assets.push({ url, kind: 'script' });
      else if (rel.includes('manifest') && ['.webmanifest', '.json'].includes(extension(url))) assets.push({ url, kind: 'manifest' });
    }
    if (tagName === 'a' && depth < 1 && looksLikePage(url)) pages.push({ url, kind: 'page', depth: depth + 1 });
  }
  return { assets, pages };
}

function discoverImports(source, baseUrl, origin, kind) {
  const found = [];
  let regex;
  if (kind === 'style') regex = /@import\s+(?:url\()?\s*['"]([^'"]+)['"]/gi;
  else regex = /\b(?:import\s*(?:[^'";]*?\sfrom\s*)?|export\s+[^'";]*?\sfrom\s*)['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gi;
  let match;
  while ((match = regex.exec(source))) {
    const raw = match[1] || match[2];
    const url = resolveSameOrigin(raw, baseUrl, origin);
    if (!url) continue;
    if (kind === 'style' && looksLikeCss(url)) found.push({ url, kind: 'style' });
    if (kind === 'script' && looksLikeJs(url)) found.push({ url, kind: 'script' });
  }
  return found;
}

function resourceMatches(kind, mime, url) {
  if (kind === 'page') return isHtmlMime(mime);
  if (kind === 'script') return isJsMime(mime) || (isJsonMime(mime) && extension(url) === '.map');
  if (kind === 'style') return mime === 'text/css';
  if (kind === 'manifest') return isJsonMime(mime);
  return false;
}

async function crawlPublicSite(rawUrl) {
  const root = parseAllowedUrl(rawUrl, { allowHttp: false });
  const origin = root.origin;
  const startedAt = Date.now();
  const queue = [{ url: root, kind: 'page', depth: 0 }];
  const queued = new Set();
  const filePaths = new Set();
  const files = [];
  const warnings = [];
  let totalBytes = 0;
  let requests = 0;
  let htmlPages = 0;

  const enqueue = (item) => {
    const url = item.url instanceof URL ? item.url : new URL(item.url);
    if (url.origin !== origin || url.protocol !== 'https:') return;
    const key = `${item.kind}:${url.href}`;
    if (queued.has(key) || queue.length + requests >= MAX_REQUESTS) return;
    if (item.kind === 'page' && htmlPages + queue.filter((entry) => entry.kind === 'page').length >= MAX_HTML_PAGES) return;
    queued.add(key);
    queue.push({ ...item, url });
  };
  queued.add(`page:${root.href}`);

  while (queue.length && requests < MAX_REQUESTS && Date.now() - startedAt < MAX_RUNTIME_MS && files.length < MAX_FILES && totalBytes < MAX_TOTAL_BYTES) {
    const batch = [];
    while (queue.length && batch.length < CONCURRENCY && requests + batch.length < MAX_REQUESTS && files.length + batch.length < MAX_FILES) {
      const task = queue.shift();
      if (task.kind === 'page' && htmlPages + batch.filter((item) => item.kind === 'page').length >= MAX_HTML_PAGES) continue;
      batch.push(task);
    }
    if (!batch.length) break;
    requests += batch.length;
    const responses = await Promise.all(batch.map(async (task) => {
      try {
        const response = await requestPublicResource(task.url, {
          allowHttp: false, expectedOrigin: origin, maxRedirects: MAX_REDIRECTS,
          maxBytes: Math.min(MAX_FILE_BYTES, MAX_TOTAL_BYTES - totalBytes), timeoutMs: REQUEST_TIMEOUT_MS
        });
        return { task, response };
      } catch (error) { return { task, error }; }
    }));

    for (const item of responses) {
      if (Date.now() - startedAt >= MAX_RUNTIME_MS) { warnings.push('実行時間の上限に達したため、取得を途中で終了しました。'); break; }
      if (item.error) {
        if (item.error.statusCode === 413) warnings.push('サイズ上限を超えたファイルを除外しました。');
        else warnings.push('取得できない公開ファイルを一部除外しました。');
        continue;
      }
      const { task, response } = item;
      if (response.status !== 200) { warnings.push('HTTP 200以外の応答を一部除外しました。'); continue; }
      const mime = mimeType(response.headers);
      if (!resourceMatches(task.kind, mime, response.url)) { warnings.push('対象外のファイル形式を一部除外しました。'); continue; }
      const bytes = response.body.length;
      if (!bytes) { warnings.push('空のファイルを一部除外しました。'); continue; }
      if (bytes > MAX_FILE_BYTES || totalBytes + bytes > MAX_TOTAL_BYTES) { warnings.push('合計サイズ上限に達したため、以降のファイルを除外しました。'); queue.length = 0; break; }
      let relPath;
      try { relPath = archivePath(response.url, task.kind); }
      catch { warnings.push('不正なパスのファイルを除外しました。'); continue; }
      if (!relPath || filePaths.has(relPath)) continue;
      filePaths.add(relPath);
      const content = response.body.toString('utf8');
      files.push({ path: relPath, content, bytes, type: mime });
      totalBytes += bytes;

      if (task.kind === 'page') {
        htmlPages += 1;
        const discovered = discoverHtml(content, response.url, origin, task.depth);
        discovered.assets.forEach(enqueue);
        discovered.pages.forEach(enqueue);
      } else if (task.kind === 'style' || task.kind === 'script') {
        discoverImports(content, response.url, origin, task.kind).forEach(enqueue);
      }
    }
  }
  if (queue.length || requests >= MAX_REQUESTS || files.length >= MAX_FILES || Date.now() - startedAt >= MAX_RUNTIME_MS) {
    warnings.push('件数・時間上限に達したため、公開ファイルの一部のみを取得しました。');
  }
  if (!files.some((file) => file.path.endsWith('.html'))) throw new PublicSiteError('公開HTMLを取得できませんでした。ログインが必要なページや対象外の形式では利用できません', 502);

  const payload = { origin, entryPath: root.pathname || '/', fileCount: files.length, totalBytes, requestCount: requests, warnings: [...new Set(warnings)], files };
  while (Buffer.byteLength(JSON.stringify(payload), 'utf8') > 3.5 * 1024 * 1024 && payload.files.length > 1) {
    const removed = payload.files.pop();
    payload.totalBytes -= removed.bytes;
    payload.fileCount = payload.files.length;
    payload.warnings.push('応答データ上限のため、一部ファイルをZIPに含めませんでした。');
  }
  return payload;
}

module.exports = {
  PublicSiteError,
  isPublicIp,
  parseAllowedUrl,
  resolvePublicAddresses,
  requestPublicResource,
  crawlPublicSite
};
