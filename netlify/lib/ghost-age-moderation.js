const crypto = require('crypto');
const { STORE_NAMES, getJSON, setJSON, deleteKey, listKeys } = require('./store');

const TERM_PREFIX = 'age:signature:term:';
const IMAGE_PREFIX = 'age:signature:image:';
const MAX_REVIEW_IMAGE_BYTES = 1536 * 1024;

function normalizedTerm(value) {
  return String(value || '').trim().toLocaleLowerCase('ja').replace(/\s+/g, ' ').slice(0, 80);
}
function normalizedText(value) {
  return String(value || '').toLocaleLowerCase('ja').replace(/\s+/g, ' ');
}

async function imageBytes(item) {
  if (item?.kind === 'image' && typeof item.dataUrl === 'string') {
    const match = item.dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i);
    if (!match) return null;
    const bytes = Buffer.from(match[2], 'base64');
    return bytes.length <= MAX_REVIEW_IMAGE_BYTES ? { bytes, mimeType:match[1] } : null;
  }
  if (item?.kind !== 'imageBlob' || !item.fileId) return null;
  const fileId = String(item.fileId).replace(/[^a-zA-Z0-9_-]/g, '');
  const meta = await getJSON(STORE_NAMES.GHOST_POSTS, `media:${fileId}:meta`);
  if (!meta || meta.complete !== true || !String(meta.mimeType || '').startsWith('image/') || Number(meta.sizeBytes) > MAX_REVIEW_IMAGE_BYTES) return null;
  const parts = [];
  for (let index = 0; index < Number(meta.totalChunks || 0); index += 1) {
    const chunk = await getJSON(STORE_NAMES.GHOST_POSTS, `media:${fileId}:chunk:${index}`);
    if (!chunk?.data) return null;
    parts.push(String(chunk.data));
  }
  const bytes = Buffer.from(parts.join(''), 'base64');
  if (bytes.length > MAX_REVIEW_IMAGE_BYTES) return null;
  return { bytes, mimeType:meta.mimeType };
}

async function getReviewImages(media) {
  const images = [];
  let bytesUsed = 0;
  let incomplete = false;
  for (let index = 0; index < (Array.isArray(media) ? media.length : 0); index += 1) {
    const item = media[index];
    if (!['image', 'imageBlob'].includes(item?.kind)) { incomplete = true; continue; }
    if (images.length >= 4) { incomplete = true; continue; }
    const image = await imageBytes(item);
    if (!image || bytesUsed + image.bytes.length > MAX_REVIEW_IMAGE_BYTES) { incomplete = true; continue; }
    bytesUsed += image.bytes.length;
    images.push({ index, mimeType:image.mimeType, data:image.bytes.toString('base64'), sha256:crypto.createHash('sha256').update(image.bytes).digest('hex') });
  }
  return { images, incomplete };
}

async function trimSignaturePrefix(prefix, maxItems = 50) {
  const keys = await listKeys(STORE_NAMES.GHOST_MODERATION, prefix);
  const rows = [];
  for (const key of keys) rows.push({ key, row:await getJSON(STORE_NAMES.GHOST_MODERATION, key) });
  rows.sort((a, b) => String(a.row?.updatedAt || a.row?.createdAt || '').localeCompare(String(b.row?.updatedAt || b.row?.createdAt || '')));
  for (const item of rows.slice(0, Math.max(0, rows.length - maxItems))) await deleteKey(STORE_NAMES.GHOST_MODERATION, item.key);
}

async function rememberAgeSignatures({ postId, categories = [], terms = [], imageHashes = [] }) {
  const now = new Date().toISOString();
  const safeCategories = [...new Set(categories.filter((item) => ['inm', 'sexual', 'other'].includes(item)))];
  for (const raw of terms.slice(0, 12)) {
    const term = normalizedTerm(raw);
    if (term.length < 2) continue;
    const id = crypto.createHash('sha256').update(term).digest('hex').slice(0, 24);
    const key = `${TERM_PREFIX}${id}`;
    const previous = await getJSON(STORE_NAMES.GHOST_MODERATION, key);
    await setJSON(STORE_NAMES.GHOST_MODERATION, key, { term, categories:[...new Set([...(previous?.categories || []), ...safeCategories])], examplePostIds:[...new Set([...(previous?.examplePostIds || []), postId])].slice(-5), createdAt:previous?.createdAt || now, updatedAt:now });
  }
  for (const sha256 of [...new Set(imageHashes)].slice(0, 8)) {
    if (!/^[a-f0-9]{64}$/i.test(sha256)) continue;
    const key = `${IMAGE_PREFIX}${sha256}`;
    const previous = await getJSON(STORE_NAMES.GHOST_MODERATION, key);
    await setJSON(STORE_NAMES.GHOST_MODERATION, key, { sha256, categories:[...new Set([...(previous?.categories || []), ...safeCategories])], examplePostIds:[...new Set([...(previous?.examplePostIds || []), postId])].slice(-5), createdAt:previous?.createdAt || now, updatedAt:now });
  }
  await trimSignaturePrefix(TERM_PREFIX);
  await trimSignaturePrefix(IMAGE_PREFIX);
}

async function findKnownAgeSignatures(text, media) {
  const categories = new Set();
  const matches = [];
  const normalizedContent = normalizedText(text);
  for (const key of await listKeys(STORE_NAMES.GHOST_MODERATION, TERM_PREFIX)) {
    const row = await getJSON(STORE_NAMES.GHOST_MODERATION, key);
    if (!row?.term || !normalizedContent.includes(row.term)) continue;
    for (const category of row.categories || []) categories.add(category);
    matches.push({ type:'term', value:row.term });
  }
  const imageKeys = await listKeys(STORE_NAMES.GHOST_MODERATION, IMAGE_PREFIX);
  if (imageKeys.length) {
    const hashes = new Set(imageKeys.map((key) => key.slice(IMAGE_PREFIX.length)));
    for (const item of media || []) {
      const image = await imageBytes(item);
      if (!image) continue;
      const sha256 = crypto.createHash('sha256').update(image.bytes).digest('hex');
      if (!hashes.has(sha256)) continue;
      const row = await getJSON(STORE_NAMES.GHOST_MODERATION, `${IMAGE_PREFIX}${sha256}`);
      for (const category of row?.categories || []) categories.add(category);
      matches.push({ type:'image', value:sha256 });
    }
  }
  return { categories:[...categories], matches };
}

module.exports = { TERM_PREFIX, IMAGE_PREFIX, MAX_REVIEW_IMAGE_BYTES, getReviewImages, rememberAgeSignatures, findKnownAgeSignatures, normalizedTerm };
