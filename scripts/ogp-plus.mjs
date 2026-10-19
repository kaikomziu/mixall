// scripts/ogp-plus.mjs
// OGP画像（public/ogp/*.jpg）に描かれた「MixAll」の右に「+」バッジを重ねて「MixAll +」にする。
// 元画像は assets/ogp-original/ に退避し、毎回そこから作り直す（何度実行しても重ならない）。
//   node scripts/ogp-plus.mjs [--preview 出力.png]
// 必要: @resvg/resvg-js, jpeg-js, pngjs（devDependencies）
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

const DIR = 'public/ogp';
const ORIGINAL = 'assets/ogp-original';

// 画像ごとの「+」の位置（中心x, 中心y, 一辺の大きさ, 回転角）。文字の弧に合わせて少し傾ける。
const BADGES = {
  '01-ghost-feed.jpg': [948, 98, 52, 22],
  '02-ghost-video-wide.jpg': [780, 54, 50, 20],
  '03-ghost-video-vertical.jpg': [682, 82, 56, 20],
  '04-ghost-post.jpg': [780, 54, 50, 20],
  '05-ghost-bookmark.jpg': [474, 196, 56, 0],
  '06-ghost-search.jpg': [794, 52, 50, 20],
  '07-pocket-chat.jpg': [790, 108, 56, 20],
  '08-uch-forum.jpg': [760, 90, 48, 20],
  '09-studio-video-edit.jpg': [850, 122, 66, 20],
  '10-login.jpg': [1028, 114, 50, 20],
  '11-signup.jpg': [826, 80, 54, 20],
  '12-custom-game.jpg': [840, 128, 58, 20],
  '13-text-creator.jpg': [802, 78, 54, 20],
  '14-website-creation.jpg': [798, 82, 52, 20],
  '15-calendar.jpg': [760, 72, 48, 20],
  '16-extensions.jpg': [848, 116, 66, 20],
  '16-mail.jpg': [762, 46, 48, 20],
  '17-emergency.jpg': [834, 100, 56, 20],
  '17-tools.jpg': [760, 40, 48, 20],
  '18-pocket-coin.jpg': [760, 36, 48, 20],
  '19-webhook.jpg': [760, 37, 48, 20]
};

function badgeSvg(cx, cy, size, angle) {
  const r = size * 0.3;
  const bar = size * 0.16;
  const len = size * 0.56;
  return `<g transform="translate(${cx} ${cy}) rotate(${angle})">
    <rect x="${-size / 2}" y="${-size / 2}" width="${size}" height="${size}" rx="${r}" fill="#2a2470" opacity="0.35" filter="url(#shadow)"/>
    <rect x="${-size / 2}" y="${-size / 2}" width="${size}" height="${size}" rx="${r}" fill="url(#plusBg)" stroke="#ffffff" stroke-width="${Math.max(2.5, size * 0.06)}"/>
    <rect x="${-size / 2}" y="${-size / 2}" width="${size}" height="${size / 2}" rx="${r}" fill="url(#plusShine)"/>
    <rect x="${-len / 2}" y="${-bar / 2}" width="${len}" height="${bar}" rx="${bar / 2}" fill="#ffffff"/>
    <rect x="${-bar / 2}" y="${-len / 2}" width="${bar}" height="${len}" rx="${bar / 2}" fill="#ffffff"/>
  </g>`;
}

function compose(file, [cx, cy, size, angle]) {
  const src = readFileSync(join(ORIGINAL, file)).toString('base64');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630">
    <defs>
      <linearGradient id="plusBg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#3d7bff"/><stop offset="0.55" stop-color="#9a5bff"/><stop offset="1" stop-color="#ff4f8b"/>
      </linearGradient>
      <linearGradient id="plusShine" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.35"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
      </linearGradient>
      <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${size * 0.12}"/></filter>
    </defs>
    <image width="1200" height="630" xlink:href="data:image/jpeg;base64,${src}"/>
    ${badgeSvg(cx, cy + size * 0.06, size, angle)}
  </svg>`;
  const png = PNG.sync.read(new Resvg(svg).render().asPng());
  return { png, jpg: jpeg.encode({ data: png.data, width: png.width, height: png.height }, 90).data };
}

mkdirSync(ORIGINAL, { recursive: true });
const previewAt = process.argv.indexOf('--preview');
const rendered = [];
for (const [file, badge] of Object.entries(BADGES)) {
  if (!existsSync(join(ORIGINAL, file))) copyFileSync(join(DIR, file), join(ORIGINAL, file));
  const { png, jpg } = compose(file, badge);
  writeFileSync(join(DIR, file), jpg);
  rendered.push({ file, png, badge });
}
console.log(`updated ${rendered.length} images`);

// 確認用: 各画像の「MixAll +」付近を切り出して並べる
if (previewAt > 0) {
  const W = 400, H = 150, cols = 3;
  const out = new PNG({ width: W * cols, height: H * Math.ceil(rendered.length / cols) });
  rendered.forEach(({ png, badge }, i) => {
    const [cx, cy] = badge;
    const x0 = Math.max(0, Math.min(1200 - W, cx - 300)), y0 = Math.max(0, Math.min(630 - H, cy - 75));
    const ox = (i % cols) * W, oy = Math.floor(i / cols) * H;
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const s = ((y0 + y) * 1200 + (x0 + x)) * 4, d = ((oy + y) * out.width + (ox + x)) * 4;
        out.data[d] = png.data[s]; out.data[d + 1] = png.data[s + 1]; out.data[d + 2] = png.data[s + 2]; out.data[d + 3] = 255;
      }
    }
  });
  writeFileSync(process.argv[previewAt + 1], PNG.sync.write(out));
}
