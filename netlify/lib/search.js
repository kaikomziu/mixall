function parseSearchQuery(input) {
  const raw = String(input || '').trim();
  const filters = { author: [], tag: [], type: [], room: [], terms: [] };
  const parts = raw.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  for (const part of parts) {
    const value = part.replace(/^"|"$/g, '');
    const match = value.match(/^([\wぁ-んァ-ヶ一-龯]+):(.+)$/);
    if (!match) { if (value) filters.terms.push(value.toLowerCase()); continue; }
    const key = match[1].toLowerCase(); const item = match[2].replace(/^@/, '').toLowerCase();
    if (!item) continue;
    if (key === '投稿者' || key === 'author' || key === 'from' || key === 'user') filters.author.push(item);
    else if (key === 'タグ' || key === 'tag' || key === 'hashtag') filters.tag.push(item.replace(/^#/, ''));
    else if (key === '種類' || key === 'type') filters.type.push(item);
    else if (key === 'room' || key === 'ルーム') filters.room.push(item);
    else filters.terms.push(value.toLowerCase());
  }
  return { raw, ...filters };
}
function matchesSearchQuery(query, item) {
  const author = String(item.authorHandle || item.authorEmail || item.authorName || '').toLowerCase().replace(/^@/, '');
  const tags = (Array.isArray(item.tags) ? item.tags : []).map((tag) => String(tag).toLowerCase().replace(/^#/, ''));
  const haystack = String(item.searchable || '').toLowerCase();
  return query.author.every((value) => author.includes(value)) && query.tag.every((value) => tags.includes(value) || haystack.includes(`#${value}`) || haystack.includes(value)) && query.type.every((value) => String(item.type || '').toLowerCase() === value) && query.terms.every((value) => haystack.includes(value));
}
module.exports = { parseSearchQuery, matchesSearchQuery };
