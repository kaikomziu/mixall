// MixAll ツール追加パック: ブラウザだけで動く(サーバー・外部通信なし)便利ツール。#toolGrid の先頭に差し込む。
(function () {
  const grid = document.getElementById('toolGrid'); if (!grid) return;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const copy = (t, btn) => navigator.clipboard.writeText(t).then(() => { if (btn) { const o = btn.textContent; btn.textContent = '✓ コピーしました'; setTimeout(() => (btn.textContent = o), 1200); } }).catch(() => {});
  const R = 'width:100%;box-sizing:border-box';
  const TOOLS = [];
  const add = (id, title, keys, html, init) => TOOLS.push({ id, title, keys, html, init });

  // 1) パスワード・UUID生成
  add('x-password', 'パスワード・UUID生成', 'パスワード 乱数 uuid 生成 安全', `<div class="row"><label>長さ <input type="number" data-len value="16" min="6" max="128" style="width:5em"></label><label><input type="checkbox" data-up checked> 大文字</label><label><input type="checkbox" data-lo checked> 小文字</label><label><input type="checkbox" data-nu checked> 数字</label><label><input type="checkbox" data-sy> 記号</label></div><div class="row"><button type="button" data-gen>パスワード生成</button><button type="button" class="secondary" data-uuid>UUID生成</button></div><input readonly data-out style="${R}" placeholder="ここに表示"><button type="button" class="secondary" data-cp>コピー</button><p class="muted">端末内の安全な乱数(crypto)で作ります。送信・保存はしません。</p>`, (el) => {
    const q = (s) => el.querySelector(s);
    q('[data-gen]').onclick = () => { let set = ''; if (q('[data-up]').checked) set += 'ABCDEFGHJKLMNPQRSTUVWXYZ'; if (q('[data-lo]').checked) set += 'abcdefghijkmnopqrstuvwxyz'; if (q('[data-nu]').checked) set += '23456789'; if (q('[data-sy]').checked) set += '!@#$%^&*()-_=+[]{};:,.?'; if (!set) return; const n = Math.max(6, Math.min(128, Number(q('[data-len]').value) || 16)); const a = new Uint32Array(n); crypto.getRandomValues(a); q('[data-out]').value = Array.from(a, (v) => set[v % set.length]).join(''); };
    q('[data-uuid]').onclick = () => { q('[data-out]').value = crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = crypto.getRandomValues(new Uint8Array(1))[0] & 15; return (c === 'x' ? r : (r & 3) | 8).toString(16); }); };
    q('[data-cp]').onclick = (e) => copy(q('[data-out]').value, e.target);
  });

  // 2) ハッシュ・エンコード
  add('x-hash', 'ハッシュ・Base64・URLエンコード', 'ハッシュ sha256 sha1 base64 エンコード デコード urlエンコード md', `<textarea data-in rows="3" style="${R}" placeholder="文字を入力"></textarea><div class="row"><button type="button" data-h="SHA-256">SHA-256</button><button type="button" data-h="SHA-1">SHA-1</button><button type="button" data-h="SHA-512">SHA-512</button><button type="button" class="secondary" data-b64e>Base64化</button><button type="button" class="secondary" data-b64d>Base64戻す</button><button type="button" class="secondary" data-ue>URL化</button><button type="button" class="secondary" data-ud>URL戻す</button></div><textarea data-out rows="3" readonly style="${R}"></textarea>`, (el) => {
    const q = (s) => el.querySelector(s), out = q('[data-out]'), inp = () => q('[data-in]').value;
    el.querySelectorAll('[data-h]').forEach((b) => (b.onclick = async () => { const d = await crypto.subtle.digest(b.dataset.h, new TextEncoder().encode(inp())); out.value = Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, '0')).join(''); }));
    q('[data-b64e]').onclick = () => { out.value = btoa(String.fromCharCode(...new TextEncoder().encode(inp()))); };
    q('[data-b64d]').onclick = () => { try { out.value = new TextDecoder().decode(Uint8Array.from(atob(inp().trim()), (c) => c.charCodeAt(0))); } catch (_) { out.value = '変換できません(Base64ではありません)'; } };
    q('[data-ue]').onclick = () => { out.value = encodeURIComponent(inp()); };
    q('[data-ud]').onclick = () => { try { out.value = decodeURIComponent(inp()); } catch (_) { out.value = '変換できません'; } };
  });

  // 3) 日付計算
  add('x-date', '日付計算(日数・加減・曜日・和暦)', '日付 日数 計算 曜日 和暦 西暦 年齢 誕生日 カウントダウン', `<div class="row"><label>開始 <input type="date" data-a></label><label>終了 <input type="date" data-b></label><button type="button" data-diff>日数を数える</button></div><div class="row"><label>基準日 <input type="date" data-c></label><label><input type="number" data-n value="30" style="width:5em"> 日</label><button type="button" data-add>後の日付</button><button type="button" class="secondary" data-sub>前の日付</button></div><p data-res class="muted" style="white-space:pre-wrap"></p>`, (el) => {
    const q = (s) => el.querySelector(s), today = new Date().toISOString().slice(0, 10);
    q('[data-a]').value = today; q('[data-b]').value = today; q('[data-c]').value = today;
    const DOW = '日月火水木金土', era = (d) => { const y = d.getFullYear(), t = +d; const E = [[new Date('2019-05-01'), '令和', 2019], [new Date('1989-01-08'), '平成', 1989], [new Date('1926-12-25'), '昭和', 1926], [new Date('1912-07-30'), '大正', 1912]]; for (const [s, n, y0] of E) if (t >= +s) { const k = y - y0 + 1; return n + (k === 1 ? '元' : k) + '年'; } return ''; };
    const fmt = (d) => `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${DOW[d.getDay()]}) ${era(d)}`;
    q('[data-diff]').onclick = () => { const a = new Date(q('[data-a]').value), b = new Date(q('[data-b]').value); if (isNaN(a) || isNaN(b)) return; const days = Math.round((b - a) / 86400000); let y = b.getFullYear() - a.getFullYear(), m = b.getMonth() - a.getMonth(), dd = b.getDate() - a.getDate(); if (dd < 0) { m--; dd += new Date(b.getFullYear(), b.getMonth(), 0).getDate(); } if (m < 0) { y--; m += 12; } q('[data-res]').textContent = `${Math.abs(days)}日(${Math.floor(Math.abs(days) / 7)}週${Math.abs(days) % 7}日)${days < 0 ? ' ※終了が前' : ''}\n${y}年${m}か月${dd}日\n開始: ${fmt(a)}\n終了: ${fmt(b)}`; };
    const mv = (s) => { const c = new Date(q('[data-c]').value); if (isNaN(c)) return; c.setDate(c.getDate() + s * (Number(q('[data-n]').value) || 0)); q('[data-res]').textContent = fmt(c); };
    q('[data-add]').onclick = () => mv(1); q('[data-sub]').onclick = () => mv(-1);
  });

  // 4) 単位変換
  const UNITS = { 長さ: { m: 1, km: 1000, cm: 0.01, mm: 0.001, inch: 0.0254, feet: 0.3048, yard: 0.9144, mile: 1609.344 }, 重さ: { kg: 1, g: 0.001, mg: 1e-6, t: 1000, lb: 0.45359237, oz: 0.028349523 }, 面積: { 'm²': 1, 'km²': 1e6, 'ha': 1e4, 'a': 100, '坪': 3.305785, '畳': 1.62, 'acre': 4046.856 }, 体積: { L: 1, mL: 0.001, 'm³': 1000, '合': 0.18039, '升': 1.8039, 'gal(US)': 3.785412, 'cup(US)': 0.2365882 }, データ量: { B: 1, KB: 1024, MB: 1048576, GB: 1073741824, TB: 1099511627776 }, 時間: { 秒: 1, 分: 60, 時間: 3600, 日: 86400, 週: 604800 }, 速度: { 'm/s': 1, 'km/h': 0.277778, 'mph': 0.44704, 'knot': 0.514444 } };
  add('x-unit', '単位変換', '単位 変換 長さ 重さ 温度 面積 坪 畳 データ量 速度 体積', `<div class="row"><select data-k>${Object.keys(UNITS).concat(['温度']).map((k) => `<option>${k}</option>`).join('')}</select><input type="number" data-v value="1" step="any" style="width:8em"><select data-f></select><span>→</span><select data-t></select></div><p data-res style="font-size:1.2rem;font-weight:700"></p><details><summary>すべての単位に変換</summary><div data-all class="muted" style="white-space:pre-wrap"></div></details>`, (el) => {
    const q = (s) => el.querySelector(s);
    const fill = () => { const k = q('[data-k]').value, us = k === '温度' ? ['℃', '℉', 'K'] : Object.keys(UNITS[k]); q('[data-f]').innerHTML = us.map((u) => `<option>${u}</option>`).join(''); q('[data-t]').innerHTML = us.map((u, i) => `<option ${i === 1 ? 'selected' : ''}>${u}</option>`).join(''); calc(); };
    const toBase = (k, u, v) => k === '温度' ? (u === '℃' ? v : u === '℉' ? (v - 32) * 5 / 9 : v - 273.15) : v * UNITS[k][u];
    const fromBase = (k, u, b) => k === '温度' ? (u === '℃' ? b : u === '℉' ? b * 9 / 5 + 32 : b + 273.15) : b / UNITS[k][u];
    const n = (x) => Number(x.toPrecision(10)).toString();
    const calc = () => { const k = q('[data-k]').value, v = Number(q('[data-v]').value), b = toBase(k, q('[data-f]').value, v); q('[data-res]').textContent = isFinite(b) ? `${n(fromBase(k, q('[data-t]').value, b))} ${q('[data-t]').value}` : ''; const us = k === '温度' ? ['℃', '℉', 'K'] : Object.keys(UNITS[k]); q('[data-all]').textContent = us.map((u) => `${n(fromBase(k, u, b))} ${u}`).join('\n'); };
    q('[data-k]').onchange = fill; ['[data-v]', '[data-f]', '[data-t]'].forEach((s) => (q(s).oninput = calc)); fill();
  });

  // 5) 割り勘
  add('x-warikan', '割り勘・端数調整', '割り勘 わりかん 会計 飲み会 端数 幹事', `<div class="row"><label>合計 <input type="number" data-sum value="12000" style="width:7em">円</label><label>人数 <input type="number" data-n value="5" min="1" style="width:4em">人</label><label>切り上げ <select data-r><option value="1">1円</option><option value="10">10円</option><option value="100" selected>100円</option><option value="500">500円</option></select></label></div><p data-res style="font-size:1.1rem;font-weight:700"></p><p class="muted" data-sub></p>`, (el) => {
    const q = (s) => el.querySelector(s);
    const calc = () => { const s = Number(q('[data-sum]').value) || 0, n = Math.max(1, Number(q('[data-n]').value) || 1), r = Number(q('[data-r]').value); const per = Math.ceil(s / n / r) * r; q('[data-res]').textContent = `1人 ${per.toLocaleString()}円`; q('[data-sub]').textContent = `集金 ${(per * n).toLocaleString()}円 / 幹事の差額 ${(per * n - s).toLocaleString()}円(多めに集まる分)。ちょうどで割ると1人 ${(s / n).toFixed(1)}円`; };
    el.querySelectorAll('input,select').forEach((x) => (x.oninput = calc)); calc();
  });

  // 6) くじ・ダイス・ルーレット
  add('x-dice', 'くじ・ダイス・ルーレット', 'くじ ダイス サイコロ ルーレット 抽選 ランダム 順番 チーム分け コイン', `<textarea data-list rows="4" style="${R}" placeholder="候補を1行に1つ(例: 田中/佐藤/鈴木)"></textarea><div class="row"><button type="button" data-pick>1つ選ぶ</button><button type="button" class="secondary" data-shuffle>順番をシャッフル</button><label>チーム数 <input type="number" data-team value="2" min="2" style="width:4em"></label><button type="button" class="secondary" data-teams>チーム分け</button></div><div class="row"><label><input type="number" data-nd value="2" min="1" max="20" style="width:4em">個の<input type="number" data-sd value="6" min="2" style="width:4em">面ダイス</label><button type="button" data-roll>振る</button><button type="button" class="secondary" data-coin>コイン</button></div><p data-res style="font-size:1.2rem;font-weight:700;white-space:pre-wrap"></p>`, (el) => {
    const q = (s) => el.querySelector(s), ri = (n) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
    const items = () => q('[data-list]').value.split('\n').map((x) => x.trim()).filter(Boolean), sh = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = ri(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const out = (t) => (q('[data-res]').textContent = t);
    q('[data-pick]').onclick = () => { const l = items(); out(l.length ? '🎯 ' + l[ri(l.length)] : '候補を入力してください'); };
    q('[data-shuffle]').onclick = () => { const l = items(); out(l.length ? sh(l).map((x, i) => `${i + 1}. ${x}`).join('\n') : '候補を入力してください'); };
    q('[data-teams]').onclick = () => { const l = sh(items()), n = Math.max(2, Number(q('[data-team]').value) || 2); if (!l.length) return out('候補を入力してください'); const t = Array.from({ length: n }, () => []); l.forEach((x, i) => t[i % n].push(x)); out(t.map((m, i) => `チーム${i + 1}: ${m.join('、')}`).join('\n')); };
    q('[data-roll]').onclick = () => { const n = Math.min(20, Number(q('[data-nd]').value) || 1), s = Math.max(2, Number(q('[data-sd]').value) || 6); const r = Array.from({ length: n }, () => ri(s) + 1); out(`🎲 ${r.join(' + ')} = ${r.reduce((a, b) => a + b, 0)}`); };
    q('[data-coin]').onclick = () => out(ri(2) ? '🪙 表' : '🪙 裏');
  });

  // 7) テキスト差分
  add('x-diff', 'テキスト差分(違いを見つける)', '差分 diff 比較 違い 変更点 文章 コード', `<div class="row"><textarea data-a rows="5" style="flex:1;min-width:140px" placeholder="変更前"></textarea><textarea data-b rows="5" style="flex:1;min-width:140px" placeholder="変更後"></textarea></div><button type="button" data-go>比べる</button><div data-res style="font-family:monospace;white-space:pre-wrap;margin-top:8px"></div>`, (el) => {
    const q = (s) => el.querySelector(s);
    q('[data-go]').onclick = () => {
      const a = q('[data-a]').value.split('\n'), b = q('[data-b]').value.split('\n'), n = a.length, m = b.length; const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
      for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
      let i = 0, j = 0, html = '', add = 0, del = 0;
      while (i < n || j < m) { if (i < n && j < m && a[i] === b[j]) { html += `<div>  ${esc(a[i])}</div>`; i++; j++; } else if (j < m && (i === n || L[i][j + 1] >= L[i + 1][j])) { html += `<div style="background:rgba(40,180,90,.22)">+ ${esc(b[j])}</div>`; j++; add++; } else { html += `<div style="background:rgba(230,70,70,.22)">- ${esc(a[i])}</div>`; i++; del++; } }
      q('[data-res]').innerHTML = `<p class="muted">追加 ${add}行 / 削除 ${del}行</p>` + html;
    };
  });

  // 8) 世界時計
  const ZONES = [['東京', 'Asia/Tokyo'], ['ソウル', 'Asia/Seoul'], ['北京・上海', 'Asia/Shanghai'], ['シンガポール', 'Asia/Singapore'], ['バンコク', 'Asia/Bangkok'], ['ドバイ', 'Asia/Dubai'], ['ロンドン', 'Europe/London'], ['パリ・ベルリン', 'Europe/Paris'], ['モスクワ', 'Europe/Moscow'], ['ニューヨーク', 'America/New_York'], ['シカゴ', 'America/Chicago'], ['ロサンゼルス', 'America/Los_Angeles'], ['ホノルル', 'Pacific/Honolulu'], ['シドニー', 'Australia/Sydney']];
  add('x-clock', '世界時計・時差', '世界時計 時差 タイムゾーン 海外 会議 ニューヨーク ロンドン', `<div class="row"><label>日本の時刻を指定 <input type="datetime-local" data-t></label><button type="button" class="secondary" data-now>いま</button></div><div data-res style="margin-top:6px"></div>`, (el) => {
    const q = (s) => el.querySelector(s), pad = (n) => String(n).padStart(2, '0');
    const setNow = () => { const d = new Date(Date.now() + 9 * 3600e3); q('[data-t]').value = d.toISOString().slice(0, 16); draw(); };
    const draw = () => { const v = q('[data-t]').value; if (!v) return; const t = new Date(v + ':00+09:00'); q('[data-res]').innerHTML = ZONES.map(([n, z]) => { const f = new Intl.DateTimeFormat('ja-JP', { timeZone: z, month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(t); const off = (new Date(t.toLocaleString('en-US', { timeZone: z })) - new Date(t.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))) / 3600e3; return `<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--border);padding:4px 0"><span>${n}</span><span><b>${esc(f)}</b> <small class="muted">(日本${off >= 0 ? '+' : ''}${off}時間)</small></span></div>`; }).join(''); };
    q('[data-t]').oninput = draw; q('[data-now]').onclick = setNow; setNow();
  });

  // 9) テキスト変換
  add('x-textconv', 'テキスト変換(全角半角・大小文字・整形)', '全角 半角 カナ ひらがな 大文字 小文字 重複 並べ替え 空白 改行 整形', `<textarea data-in rows="4" style="${R}" placeholder="変換したい文章"></textarea><div class="row" style="flex-wrap:wrap"><button type="button" data-c="zen">英数→全角</button><button type="button" data-c="han">英数→半角</button><button type="button" data-c="kata">ひらがな→カタカナ</button><button type="button" data-c="hira">カタカナ→ひらがな</button><button type="button" data-c="up">大文字</button><button type="button" data-c="lo">小文字</button><button type="button" data-c="trim">行頭・行末の空白を削除</button><button type="button" data-c="blank">空行を削除</button><button type="button" data-c="uniq">重複行を削除</button><button type="button" data-c="sort">行を並べ替え</button><button type="button" data-c="num">行番号を付ける</button></div><textarea data-out rows="4" readonly style="${R}"></textarea><button type="button" class="secondary" data-cp>結果をコピー</button>`, (el) => {
    const q = (s) => el.querySelector(s);
    const F = { zen: (s) => s.replace(/[A-Za-z0-9]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xFEE0)).replace(/ /g, '　'), han: (s) => s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/　/g, ' '), kata: (s) => s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60)), hira: (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)), up: (s) => s.toUpperCase(), lo: (s) => s.toLowerCase(), trim: (s) => s.split('\n').map((x) => x.trim()).join('\n'), blank: (s) => s.split('\n').filter((x) => x.trim()).join('\n'), uniq: (s) => Array.from(new Set(s.split('\n'))).join('\n'), sort: (s) => s.split('\n').sort((a, b) => a.localeCompare(b, 'ja')).join('\n'), num: (s) => s.split('\n').map((x, i) => `${i + 1}. ${x}`).join('\n') };
    el.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => { q('[data-out]').value = F[b.dataset.c](q('[data-in]').value); }));
    q('[data-cp]').onclick = (e) => copy(q('[data-out]').value, e.target);
  });

  // 10) 税・割引計算
  add('x-tax', '消費税・割引・割合の計算', '消費税 税込 税抜 割引 割合 パーセント 値引き 計算 8% 10%', `<div class="row"><label>金額 <input type="number" data-p value="1000" style="width:8em">円</label><label>税率 <select data-r><option value="10">10%</option><option value="8">8%(軽減)</option><option value="0">0%</option></select></label></div><div class="row"><label>割引 <input type="number" data-d value="20" style="width:5em">%</label><label><input type="radio" name="x-tx-m" value="ex" checked> 金額は税抜</label><label><input type="radio" name="x-tx-m" value="in"> 金額は税込</label></div><p data-res style="white-space:pre-wrap;font-weight:700"></p>`, (el) => {
    const q = (s) => el.querySelector(s);
    const calc = () => { const p = Number(q('[data-p]').value) || 0, r = Number(q('[data-r]').value) / 100, d = Number(q('[data-d]').value) || 0, inc = el.querySelector('input[type=radio]:checked').value === 'in'; const ex = inc ? p / (1 + r) : p, tin = inc ? p : p * (1 + r); const disc = (v) => v * (1 - d / 100); q('[data-res]').textContent = `税抜 ${Math.round(ex).toLocaleString()}円 / 税額 ${Math.round(tin - ex).toLocaleString()}円 / 税込 ${Math.round(tin).toLocaleString()}円\n${d}%引き → 税抜 ${Math.round(disc(ex)).toLocaleString()}円 / 税込 ${Math.round(disc(tin)).toLocaleString()}円(${Math.round(tin - disc(tin)).toLocaleString()}円おトク)`; };
    el.querySelectorAll('input,select').forEach((x) => (x.oninput = calc)); calc();
  });

  // 11) コントラスト比チェック
  add('x-contrast', '文字色のコントラスト比チェック', '色 コントラスト 見やすさ アクセシビリティ wcag 文字色 背景色 読みやすい', `<div class="row"><label>文字色 <input type="color" data-f value="#222222"></label><label>背景色 <input type="color" data-b value="#ffffff"></label></div><div data-prev style="padding:14px;border-radius:10px;border:1px solid var(--border);margin:8px 0">サンプル文字 The quick brown fox 123</div><p data-res style="font-weight:700"></p>`, (el) => {
    const q = (s) => el.querySelector(s);
    const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const calc = () => { const f = q('[data-f]').value, b = q('[data-b]').value, l1 = lum(f), l2 = lum(b), r = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); const p = q('[data-prev]'); p.style.color = f; p.style.background = b; q('[data-res]').textContent = `コントラスト比 ${r.toFixed(2)} : 1  通常文字 ${r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : '不合格'} / 大きい文字 ${r >= 4.5 ? 'AAA' : r >= 3 ? 'AA' : '不合格'}`; };
    el.querySelectorAll('input').forEach((x) => (x.oninput = calc)); calc();
  });

  // 12) ストップウォッチ・カウントダウン
  add('x-stopwatch', 'ストップウォッチ・カウントダウン', 'ストップウォッチ タイマー カウントダウン ラップ 時間 計測', `<div data-disp style="font-size:2.2rem;font-weight:800;font-variant-numeric:tabular-nums">00:00.0</div><div class="row"><button type="button" data-ss>スタート</button><button type="button" class="secondary" data-lap>ラップ</button><button type="button" class="secondary" data-rs>リセット</button></div><ol data-laps class="muted"></ol><hr><div class="row"><label>タイマー <input type="number" data-m value="3" min="0" style="width:4em">分<input type="number" data-s value="0" min="0" max="59" style="width:4em">秒</label><button type="button" data-ts>開始</button></div><p data-td style="font-size:1.4rem;font-weight:700"></p>`, (el) => {
    const q = (s) => el.querySelector(s); let t0 = 0, acc = 0, run = false, raf = 0, tt = 0, tEnd = 0;
    const fmt = (ms) => { const s = ms / 1000; return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}.${Math.floor((s * 10) % 10)}`; };
    const tick = () => { q('[data-disp]').textContent = fmt(acc + (run ? Date.now() - t0 : 0)); raf = requestAnimationFrame(tick); };
    q('[data-ss]').onclick = () => { if (!run) { run = true; t0 = Date.now(); q('[data-ss]').textContent = 'ストップ'; cancelAnimationFrame(raf); tick(); } else { acc += Date.now() - t0; run = false; q('[data-ss]').textContent = 'スタート'; } };
    q('[data-lap]').onclick = () => { if (run || acc) q('[data-laps]').insertAdjacentHTML('beforeend', `<li>${fmt(acc + (run ? Date.now() - t0 : 0))}</li>`); };
    q('[data-rs]').onclick = () => { run = false; acc = 0; cancelAnimationFrame(raf); q('[data-disp]').textContent = '00:00.0'; q('[data-ss]').textContent = 'スタート'; q('[data-laps]').innerHTML = ''; };
    q('[data-ts]').onclick = () => { clearInterval(tt); tEnd = Date.now() + ((Number(q('[data-m]').value) || 0) * 60 + (Number(q('[data-s]').value) || 0)) * 1000; tt = setInterval(() => { const left = tEnd - Date.now(); if (left <= 0) { clearInterval(tt); q('[data-td]').textContent = '⏰ 時間です！'; try { navigator.vibrate && navigator.vibrate([300, 150, 300]); new (window.AudioContext || window.webkitAudioContext)().resume(); } catch (_) {} return; } q('[data-td]').textContent = fmt(left).slice(0, 5); }, 200); };
  });

  // 差し込み(既存の並び順の先頭に)
  const frag = document.createDocumentFragment();
  TOOLS.forEach((t) => {
    if (document.getElementById(t.id)) return;
    const d = document.createElement('details'); d.className = 'card tool-card'; d.id = t.id; d.dataset.title = t.title + ' ' + t.keys;
    d.innerHTML = `<summary><h2>${esc(t.title)}</h2></summary><div class="x-body" style="display:grid;gap:8px;margin-top:8px">${t.html}</div>`;
    frag.appendChild(d);
    let ready = false; d.addEventListener('toggle', () => { if (d.open && !ready) { ready = true; try { t.init(d.querySelector('.x-body')); } catch (e) { console.error(e); } } });
  });
  grid.prepend(frag);
  const hash = decodeURIComponent(location.hash.slice(1)); const hit = hash && document.getElementById(hash); if (hit && hit.id.startsWith('x-')) { hit.open = true; setTimeout(() => hit.scrollIntoView({ block: 'start' }), 80); }
})();
