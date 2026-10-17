// public/js/avatar.js
// カスタムのアバター設定(この端末に保存)と、そこからSVGを組み立てる共通ロジック。
// ルーム一覧のプレビューと、実際のワールド内表示の両方で同じ関数を使う。

const NetrifyAvatar = (() => {
  const KEY = 'netrify_avatar';
  const DEFAULT = { skin: '#f1c27d', hair: '#2c2c2c', outfit: '#5b8cff', eyes: '#2c2c2c', hairStyle: 'short' };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? { ...DEFAULT, ...JSON.parse(raw) } : { ...DEFAULT };
    } catch {
      return { ...DEFAULT };
    }
  }

  function save(avatar) {
    localStorage.setItem(KEY, JSON.stringify(avatar));
  }

  function hairPath(style, hairColor) {
    if (style === 'bald') return '';
    if (style === 'long') return `<path d="M20 40 Q50 5 80 40 L80 75 Q70 55 65 75 L65 45 Q50 35 35 45 L35 75 Q30 55 20 75 Z" fill="${hairColor}" />`;
    if (style === 'bun') return `<circle cx="50" cy="18" r="10" fill="${hairColor}" /><path d="M20 42 Q50 8 80 42 L78 55 Q50 25 22 55 Z" fill="${hairColor}" />`;
    // short (default)
    return `<path d="M18 42 Q50 6 82 42 L80 52 Q50 22 20 52 Z" fill="${hairColor}" />`;
  }

  // シンプルな正面向きアバターSVGを文字列で返す。sizeはピクセル。
  function renderSVG(avatar, size) {
    const a = { ...DEFAULT, ...avatar };
    return `
      <svg viewBox="0 0 100 100" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="55" r="30" fill="${a.skin}" />
        <circle cx="40" cy="52" r="4" fill="${a.eyes}" />
        <circle cx="60" cy="52" r="4" fill="${a.eyes}" />
        <path d="M40 66 Q50 72 60 66" stroke="${a.eyes}" stroke-width="2" fill="none" stroke-linecap="round" />
        <path d="M25 85 Q50 68 75 85 L75 100 L25 100 Z" fill="${a.outfit}" />
        ${hairPath(a.hairStyle, a.hair)}
      </svg>
    `;
  }

  return { load, save, renderSVG, DEFAULT };
})();
