// MAWSプロキシ画面: /MAWS/?ServerAction=<URL>
//  ・pixivは専用のpixiv風UI(サーバーがデータ取得)で表示 ・それ以外のサイトは /api/px 経由でsandbox iframeに表示
(() => {
  const params = new URLSearchParams(location.search);
  const raw = params.get('ServerAction');
  if (raw === null) return;
  document.documentElement.classList.add('px-mode');
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const style = document.createElement('style');
  style.textContent = `html.px-mode header.top,html.px-mode main{display:none!important}html.px-mode,html.px-mode body{margin:0;height:100%;background:#fff}
#pxRoot{position:fixed;left:0;right:0;top:0;height:100vh;height:100dvh;padding-top:env(safe-area-inset-top);box-sizing:border-box;display:flex;flex-direction:column;background:#fff;color:#1f1f1f;font-family:-apple-system,"Hiragino Sans","Meiryo",sans-serif;z-index:99999}
.pxbar{display:flex;gap:6px;align-items:center;padding:6px 8px;background:#f1f3f5;border-bottom:1px solid #d9dde1}.pxbar input{flex:1;min-width:0;padding:8px 10px;border:1px solid #c5ccd3;border-radius:8px;font-size:15px;background:#fff;color:#111}.pxbar a,.pxbar button{padding:7px 10px;border:1px solid #c5ccd3;border-radius:8px;background:#fff;color:#111;text-decoration:none;font-size:14px;cursor:pointer;white-space:nowrap}
.pxh form button[type=submit]{display:inline-flex!important;align-self:center;width:auto!important;min-height:0!important;height:30px;padding:0 14px!important;border:0;border-radius:15px;background:#0096fa;color:#fff;font-size:.8rem;font-weight:700;flex:none}.pxchips{max-height:78px;overflow-y:auto}.pxchips input{flex:1 1 70px!important;min-width:60px!important;height:24px;font-size:14px!important}.pxchip{max-width:100%}.pxchip button{background:none!important;border:0!important;box-shadow:none!important;width:auto!important;min-height:0!important;height:auto!important;padding:0 5px!important;color:#fff!important;font-size:14px;line-height:1;border-radius:0!important}.pxchip em .mxi{width:12px;height:12px}.pxacct,.pxh a{flex:none}
#pxFrame{flex:1;border:0;width:100%;background:#fff}
.pxh{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:5px 10px;flex:none;background:#fff;border-bottom:1px solid #eee;color:#1f1f1f}.pxh b{font-size:1.2rem;letter-spacing:-1px;cursor:pointer;color:#0096fa;font-weight:800;font-family:Arial,sans-serif}.pxh form{flex:1;display:flex;gap:6px;max-width:680px}.pxh input{flex:1;min-width:0;padding:6px 12px;border:0;border-radius:16px;font-size:13px;background:#f5f5f5;color:#1f1f1f}.pxh input:focus{outline:2px solid #0096fa33;background:#fff}.pxh form button{padding:5px 12px;border:0;border-radius:16px;background:#0096fa;color:#fff;font-size:.8rem;font-weight:700;cursor:pointer;flex:none}.pxchips{flex:1;min-width:0;display:flex;flex-wrap:wrap;align-items:center;gap:4px;background:#f5f5f5;border-radius:16px;padding:3px 8px;cursor:text}.pxchips:focus-within{outline:2px solid #0096fa33;background:#fff}.pxchip em{font-style:normal;cursor:pointer;margin-right:3px;font-size:11px}.pxchip.user{background:#7b5cff!important}.pxchip.not{background:#d9534f!important}.pxchip{display:inline-flex;align-items:center;gap:2px;background:#0096fa;color:#fff;border-radius:12px;padding:2px 3px 2px 10px;font-size:.78rem;font-weight:700}.pxchip button{border:0;background:none;color:#fff;font-size:.95rem;line-height:1;padding:0 5px;cursor:pointer}.pxh .pxchips input{flex:1;min-width:90px;padding:5px 2px;border:0;border-radius:0;background:transparent}.pxh .pxchips input:focus{outline:0;background:transparent}.pxh a,.pxh .pxacct{color:#5c5c5c;font-size:.75rem;text-decoration:none;background:#f5f5f5;border:0;border-radius:14px;padding:5px 9px;cursor:pointer;white-space:nowrap}
.pxnav{display:flex;gap:2px;padding:0 12px;background:#fff;border-bottom:1px solid #eee;overflow-x:auto}.pxnav button{border:0;background:none;padding:7px 10px;color:#858585;font-weight:700;font-size:.8rem;cursor:pointer;border-bottom:3px solid transparent;white-space:nowrap}.pxnav button.on{color:#1f1f1f;border-bottom-color:#0096fa}
.pxbody{flex:1;overflow:auto;padding:10px 10px 40px;background:#fff}.pxin{max-width:1240px;margin:0 auto}.pxtabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.pxtabs button{border:0;background:#f5f5f5;border-radius:16px;padding:6px 14px;cursor:pointer;color:#474747;font-size:.88rem}.pxtabs button.on{background:#0096fa;color:#fff}
.pxgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:12px 8px}.pxt{background:none;border:0;padding:0;text-align:left;cursor:pointer;color:inherit;min-width:0}.pxt .im{position:relative;display:block;aspect-ratio:1;border-radius:8px;overflow:hidden;background:#f5f5f5}.pxt .im img{width:100%;height:100%;object-fit:cover;transition:transform .2s}.pxt:hover .im img{transform:scale(1.04)}.pxt .im i{position:absolute;right:6px;top:6px;background:rgba(0,0,0,.5);color:#fff;font-style:normal;font-size:.7rem;padding:1px 7px;border-radius:10px;font-weight:700}.pxt .im em{position:absolute;left:6px;top:6px;background:#0096fa;color:#fff;font-style:normal;font-size:.72rem;padding:1px 8px;border-radius:10px;font-weight:700}.pxt .im s{position:absolute;left:6px;bottom:6px;background:#ff4060;color:#fff;text-decoration:none;font-size:.68rem;padding:0 7px;border-radius:8px;font-weight:700}.pxt b{display:block;font-size:.76rem;margin-top:4px;color:#1f1f1f;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pxt small{display:block;color:#858585;font-size:.78rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pxhead h1{margin:0;font-size:1.2rem;color:#1f1f1f}.pxhead .cnt{color:#858585;font-size:.95rem;margin:2px 0 12px}
.pxpg{display:flex;gap:6px;justify-content:center;margin:26px 0}.pxpg button{min-width:36px;height:36px;border:0;border-radius:18px;background:#f5f5f5;color:#474747;cursor:pointer;font-weight:700}.pxpg button.on{background:#0096fa;color:#fff}.pxpg button:disabled{opacity:.4;cursor:default}
.pxwork{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:18px;max-width:1240px;margin:0 auto}@media(max-width:860px){.pxwork{grid-template-columns:1fr}}.pxwork .imgs img{max-width:100%;display:block;margin:0 auto 10px;border-radius:4px;background:#f5f5f5}.pxwork h1{font-size:1.25rem;margin:0 0 8px;color:#1f1f1f}
.pxtag{display:inline-block;margin:2px 8px 2px 0;color:#0096fa;cursor:pointer;font-size:.9rem;font-weight:700}.pxtag.r{color:#ff4060}.pxcounts{display:flex;gap:16px;color:#858585;font-size:.88rem;margin:10px 0;align-items:center}.pxcounts b{color:#474747}.pxcounts .lk{color:#ff4060}
.pxauthor{display:flex;gap:10px;align-items:center;padding:10px 0;border-top:1px solid #eee;border-bottom:1px solid #eee;margin:10px 0}.pxauthor .av{width:44px;height:44px;border-radius:50%;background:#d6e9f8;color:#0096fa;display:flex;align-items:center;justify-content:center;font-weight:800;flex:0 0 auto}.pxauthor a{color:#1f1f1f;font-weight:700;text-decoration:none;cursor:pointer}
.pxmeta{color:#858585;font-size:.85rem}.pxerr{color:#c0392b;padding:20px}.pxmore{display:block;margin:20px auto;padding:9px 28px;border:0;border-radius:20px;background:#f5f5f5;color:#474747;cursor:pointer;font-weight:700}
.pxuser{display:flex;gap:14px;align-items:center;margin-bottom:14px}.pxuser img{width:72px;height:72px;border-radius:50%;object-fit:cover}.pxsec{display:flex;justify-content:space-between;align-items:baseline;margin:24px 0 10px}.pxsec h3{margin:0;font-size:1.05rem;color:#1f1f1f}`;
  document.head.appendChild(style);
  const root = document.createElement('div'); root.id = 'pxRoot'; document.body.appendChild(root);

  const normalize = (v) => {
    v = String(v || '').trim(); if (!v) return 'https://www.pixiv.net/';
    if (/^https?:\/\//i.test(v)) return v;
    if (/^[\w-]+(\.[\w-]+)+(\/|$|\?|:)/.test(v) && !/\s/.test(v)) return 'https://' + v;
    return 'https://duckduckgo.com/html/?q=' + encodeURIComponent(v);
  };
  const target = normalize(raw);
  let host = ''; try { host = new URL(target).hostname.toLowerCase(); } catch (_) {}
  const setUrl = (u) => { const p = new URLSearchParams(location.search); p.set('ServerAction', u); history.replaceState(null, '', location.pathname + '?' + p.toString()); };

  if (/(^|\.)pixiv\.net$/.test(host)) return pixivApp(new URL(target));
  return proxyApp(target);

  // ---- 成人向けサイト(FANZA/DMM・Pornhub): 18歳以上+成人確認済みのログインユーザーだけ ----
  const ADULT_RE = /(^|\.)(dmm\.co\.jp|dmm\.com|dmm-extension\.com|pornhub\.com|phncdn\.com|pornhubpremium\.com)$/i;
  async function adultPass() {
    let sess = null; try { sess = window.Netrify && Netrify.getSession(); } catch (_) {}
    if (!sess) { location.href = '/login/?next=' + encodeURIComponent(location.pathname + location.search); return null; }
    const call = async (body) => { const r = await fetch('/api/pixiv', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, token: sess.token }) }); return [r.ok, await r.json().catch(() => ({}))]; };
    let [ok, d] = await call({ action: 'adultPass' });
    if (ok) return d.pass;
    if (d.needQuiz && (await adultQuiz(call))) { [ok, d] = await call({ action: 'adultPass' }); if (ok) return d.pass; }
    if (!d.needQuiz) alert(d.error || '開けません');
    return null;
  }
  function adultQuiz(call) {
    return new Promise(async (resolve) => {
      const [ok, q] = await call({ action: 'quizStart' });
      if (!ok) { alert(q.error || '確認クイズを開始できませんでした'); resolve(false); return; }
      if (q.already) { resolve(true); return; }
      const m = document.createElement('div'); m.style.cssText = 'position:fixed;inset:0;z-index:100001;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:12px';
      m.innerHTML = '<div style="background:#fff;color:#1f1f1f;max-width:520px;width:100%;max-height:90vh;overflow:auto;border-radius:12px;padding:16px;line-height:1.6"><h3 style="margin:0 0 6px">年齢確認クイズ</h3><p style="font-size:.9rem;color:#556">成人向けサイトを開くための確認です。全部の問題に答えてください。</p>' + q.questions.map((x, i) => '<div style="margin:10px 0"><b>Q' + (i + 1) + '. ' + esc(x.text) + '</b>' + x.options.map((o, j) => '<label style="display:block"><input type="radio" name="aq' + i + '" value="' + j + '"> ' + esc(o) + '</label>').join('') + '</div>').join('') + '<p data-msg style="color:#c00"></p><div style="display:flex;gap:6px"><button type="button" data-ok>確認する</button><button type="button" data-cancel>やめる</button></div></div>';
      document.body.appendChild(m);
      m.querySelector('[data-cancel]').onclick = () => { m.remove(); resolve(false); };
      m.querySelector('[data-ok]').onclick = async () => {
        const answers = q.questions.map((_, i) => { const c = m.querySelector('input[name="aq' + i + '"]:checked'); return c ? Number(c.value) : -1; });
        if (answers.includes(-1)) { m.querySelector('[data-msg]').textContent = 'すべての問題に答えてください'; return; }
        if (!confirm('本当によろしいですか？\n\n成人向けの内容が含まれます。18歳以上であり、自分の意思で開きます。')) return;
        const [ok2, r] = await call({ action: 'quizSubmit', quizId: q.quizId, answers, confirm: true });
        if (ok2) { m.remove(); resolve(true); } else { m.querySelector('[data-msg]').textContent = r.error || '確認できませんでした'; setTimeout(() => { m.remove(); resolve(false); }, 2500); }
      };
    });
  }

  function proxyApp(url) {
    root.innerHTML = `<div class="pxbar"><a href="/MAWS/">← MAWS</a><button type="button" data-reload title="再読み込み">⟳</button><input type="text" data-url inputmode="url" autocapitalize="off" spellcheck="false" value="${esc(url)}"><button type="button" data-go>開く</button><a data-orig href="${esc(url)}" target="_blank" rel="noopener noreferrer nofollow" title="元のサイトを直接開く">↗</a></div><iframe id="pxFrame" sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation" referrerpolicy="no-referrer" allow="fullscreen"></iframe>`;
    const frame = root.querySelector('#pxFrame'), input = root.querySelector('[data-url]'), orig = root.querySelector('[data-orig]');
    const open = async (u) => {
      u = normalize(u); input.value = u; orig.href = u; setUrl(u); document.title = u;
      let k = '';
      let h = ''; try { h = new URL(u).hostname; } catch (_) {}
      if (ADULT_RE.test(h)) {
        const pass = await adultPass();
        if (!pass) { frame.removeAttribute('src'); frame.srcdoc = '<meta charset="utf-8"><p style="font-family:sans-serif;padding:24px;line-height:1.7">このサイトは18歳以上の方だけ開けます。<br>ログインして生年月日を登録し、成人確認を済ませてから開き直してください。</p>'; return; }
        k = 'k=' + pass + '&';
      }
      frame.removeAttribute('srcdoc');
      frame.src = '/api/px?' + k + 'b=' + btoa(unescape(encodeURIComponent(u))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    };
    root.querySelector('[data-go]').onclick = () => open(input.value);
    input.onkeydown = (e) => { if (e.key === 'Enter') open(input.value); };
    root.querySelector('[data-reload]').onclick = () => open(input.value);
    window.addEventListener('message', (e) => { if (e.source !== frame.contentWindow || !e.data || typeof e.data.mawsPx !== 'string') return; if (/(^|\.)pixiv\.net$/.test((() => { try { return new URL(e.data.mawsPx).hostname; } catch (_) { return ''; } })())) { location.href = '/MAWS/?ServerAction=' + encodeURIComponent(e.data.mawsPx); return; } input.value = e.data.mawsPx; orig.href = e.data.mawsPx; try { setUrl(e.data.mawsPx); } catch (_) {} });
    open(url);
  }

  function pixivApp(url) {
    const sess = () => { try { return window.Netrify && Netrify.getSession(); } catch (_) { return null; } };
    let r18 = false; try { r18 = localStorage.getItem('mixall-pixiv-r18') === '1'; } catch (_) {}
    const post = async (body) => { const r = await fetch('/api/pixiv', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, token: sess()?.token }) }); const d = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(d.error || '通信に失敗しました'), { data: d }); return d; };
    const api = async (q) => { const t = sess()?.token; const r = await fetch('/api/pixiv?' + new URLSearchParams(r18 && t ? { ...q, r18: 1 } : q), t ? { headers: { 'x-mixall-token': t } } : undefined); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || '取得に失敗しました'); return d; };
    const link = (u) => '/MAWS/?ServerAction=' + encodeURIComponent(u);
    { const de = document.documentElement; const keep = () => { if (de.dataset.design !== 'simple') de.dataset.design = 'simple'; }; keep(); new MutationObserver(keep).observe(de, { attributes: true, attributeFilter: ['data-design'] }); } // pixiv画面はカラフル設定にしない(保存済みの設定は変えない)
    root.innerHTML = `<div class="pxh"><b data-home>pixiv</b><form data-form><div class="pxchips" data-chips><input type="text" data-q placeholder="タグ　@投稿者　-除外" enterkeyhint="search" autocomplete="off" autocapitalize="off"></div><button type="submit" aria-label="検索">検索</button></form><button type="button" class="pxacct" data-acct title="pixivアカウント連携" aria-label="pixivアカウント連携">👤</button><a href="/MAWS/">← MAWS</a></div><div class="pxnav" data-nav></div><div class="pxbody" data-body></div>`;
    const body = root.querySelector('[data-body]');
    const go = (u, push = true) => { if (push) history.pushState(null, '', link(u)); route(new URL(u)); body.scrollTop = 0; };
    window.addEventListener('popstate', () => { const r = new URLSearchParams(location.search).get('ServerAction'); route(new URL(normalize(r))); });
    root.querySelector('[data-home]').onclick = () => go('https://www.pixiv.net/');
    // タグのボックス入力: スペース/カンマで確定してボックス化、空欄でBackspaceすると最後のボックスを削除
    const chipsBox = root.querySelector('[data-chips]'), tagInput = root.querySelector('[data-q]');
    const tags = [];
    const UR = /^(?:@|user:|author:|投稿者:|作者:|ユーザー:)/i, NR = /^(?:[-−!！]|not:|除外:)/i;
    const kindOf = (t) => UR.test(t) ? 'user' : NR.test(t) ? 'not' : 'tag';
    const bare = (t) => t.replace(UR, '').replace(NR, '');
    const drawChips = () => { chipsBox.querySelectorAll('.pxchip').forEach((n) => n.remove()); tags.forEach((t, i) => { const k = kindOf(t); const c = document.createElement('span'); c.className = 'pxchip ' + k; c.innerHTML = '<em data-k="' + i + '" title="タップで種類を切り替え（タグ→投稿者→除外）">' + (k === 'user' ? '👤' : k === 'not' ? '🚫' : '#') + '</em>' + esc(bare(t)) + '<button type="button" aria-label="' + esc(bare(t)) + 'を削除" data-i="' + i + '">×</button>'; chipsBox.insertBefore(c, tagInput); }); };
    const commitTag = () => { const parts = tagInput.value.split(/[\s,、，　]+/).map((x) => x.replace(/^#/, '').trim()).filter(Boolean); parts.forEach((t) => { if (!tags.includes(t) && tags.length < 8) tags.push(t); }); tagInput.value = ''; drawChips(); };
    tagInput.addEventListener('keydown', (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if ((e.key === ' ' || e.key === ',' || e.key === '、' || e.key === '　') && tagInput.value.trim()) { e.preventDefault(); commitTag(); }
      else if (e.key === 'Backspace' && !tagInput.value && tags.length) { tags.pop(); drawChips(); }
    });
    tagInput.addEventListener('input', (e) => { if (!e.isComposing && /[\s,、，　]$/.test(tagInput.value) && tagInput.value.trim()) commitTag(); }); // スマホのキーボードでもスペースで確定
    chipsBox.addEventListener('click', (e) => { const kb = e.target.closest('em[data-k]'); if (kb) { const i = Number(kb.dataset.k), t = tags[i], k = kindOf(t); tags[i] = (k === 'tag' ? '@' : k === 'user' ? '-' : '') + bare(t); drawChips(); return; } const b = e.target.closest('button[data-i]'); if (b) { tags.splice(Number(b.dataset.i), 1); drawChips(); tagInput.focus(); } else tagInput.focus(); });
    root.__setTags = (word) => { tags.length = 0; String(word || '').split(/\s+/).filter(Boolean).slice(0, 8).forEach((t) => tags.push(t)); tagInput.value = ''; drawChips(); };
    root.querySelector('[data-form]').onsubmit = (e) => { e.preventDefault(); commitTag(); const EXRE = /^(?:[-−!！]|not:|除外:)(.+)$/i; const authorTok = tags.find((t) => /^(@|user:|author:|投稿者:|作者:|ユーザー:)/i.test(t)); const exList = tags.map((t) => EXRE.exec(t)).filter(Boolean).map((m) => m[1].trim()).filter(Boolean); const plainTags = tags.filter((t) => t !== authorTok && !EXRE.test(t)); const v = plainTags.join(' ');
      const userMode = (root.querySelector('[data-mode]') || {}).value === 'user';
      if (authorTok || (userMode && v)) { // 投稿者検索: 名前でも数字のIDでも
        const who = (authorTok ? authorTok.replace(/^(@|user:|author:|投稿者:|作者:|ユーザー:)/i, '').trim() : v); if (!who) return;
        const rest = authorTok ? v : '';
        if (/^\d{1,12}$/.test(who)) go('https://www.pixiv.net/users/' + who + (rest ? '?tags=' + encodeURIComponent(rest) : ''));
        else go('https://www.pixiv.net/search_user.php?nick=' + encodeURIComponent(who) + (rest ? '&tags=' + encodeURIComponent(rest) : ''));
        return;
      }
      if (!v && exList.length) { alert('除外タグだけでは検索できません。探したいタグも入力してください。'); return; }
      if (!v) return; const m = /artworks\/(\d{3,12})/.exec(v) || /^(\d{6,12})$/.exec(v); go(m ? 'https://www.pixiv.net/artworks/' + m[1] : 'https://www.pixiv.net/tags/' + encodeURIComponent(v) + '/artworks' + (exList.length ? '?ex=' + encodeURIComponent(exList.join(' ')) : '')); };
    root.addEventListener('click', (e) => { const t = e.target.closest('[data-go]'); if (t && (body.contains(t) || t.closest('[data-nav]'))) { e.preventDefault(); go(t.dataset.go); } });

    // ---- 個人のpixivアカウント連携 / R-18表示(成人確認) ----
    const modal = (html) => { let m = document.getElementById('pxModal'); if (!m) { m = document.createElement('div'); m.id = 'pxModal'; m.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:12px'; document.body.appendChild(m); m.addEventListener('click', (e) => { if (e.target === m) m.remove(); }); } m.innerHTML = '<div style="background:#fff;color:#1f1f1f;max-width:520px;width:100%;max-height:90vh;overflow:auto;border-radius:12px;padding:16px;line-height:1.6">' + html + '</div>'; return m; };
    const closeModal = () => document.getElementById('pxModal')?.remove();
    async function openAcct() {
      if (!sess()) { location.href = '/login/?next=' + encodeURIComponent(location.pathname + location.search); return; }
      let st; try { st = await post({ action: 'status' }); } catch (e) { modal('<p>' + esc(e.message) + '</p>'); return; }
      const m = modal(`<h3 style="margin:0 0 8px">pixivアカウント連携</h3>
        <p style="font-size:.9rem;color:#556">自分のpixivアカウントで見るための連携です。<b>パスワードは預かりません</b>。pixivにログイン済みのブラウザで、Cookie「PHPSESSID」の値(<code>数字_英数字</code>)を貼り付けます。値は暗号化してあなた専用に保存し、いつでも解除・削除できます。他の人のpixivには使われません。</p>
        <p>状態: ${st.usingDefault ? '✅ 既定のpixivセッションを使用中 (pixiv ID ' + esc(st.pixivUserId) + ')。自分のPHPSESSIDを入れて「連携する」で置き換え、「連携を解除」でオフにできます。' : st.usingShared ? ' 共用の回覧用アカウントを使っています（pixivアカウントを登録できない方向けの貸しアカウントです）。できるだけご自身のアカウントを連携してください。' : st.linked ? '✅ 連携中 (pixiv ID ' + esc(st.pixivUserId) + ')' : '連携していません'}</p>
        <input id="pxSess" type="password" autocomplete="off" placeholder="PHPSESSIDの値" style="width:100%;box-sizing:border-box;padding:8px;margin-bottom:6px">
        <div style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" id="pxLink">連携する</button>${st.linked ? '<button type="button" id="pxUnlink">連携を解除</button>' : ''}</div>
        <hr><h4 style="margin:6px 0">R-18の表示</h4>
        ${st.minor ? '<p>18歳未満の方はR-18を表示できません。</p>' : `<label><input type="checkbox" id="pxR18" ${r18 ? 'checked' : ''}> R-18作品を表示する(R-18Gも表示)</label><p style="font-size:.85rem;color:#556">${st.staff ? '運営・副運営・公認は確認クイズなしで使えます。' : st.adult ? '成人確認は済んでいます。' : '初回のみ成人確認のクイズがあります。'} R-18の取得には、上のpixivアカウント連携が必要です。</p>`}
        <p id="pxMsg" style="color:#c00"></p><button type="button" id="pxClose">閉じる</button>`);
      const msg = (t) => { m.querySelector('#pxMsg').textContent = t; };
      m.querySelector('#pxClose').onclick = closeModal;
      m.querySelector('#pxLink').onclick = async () => { try { await post({ action: 'link', phpsessid: m.querySelector('#pxSess').value }); openAcct(); } catch (e) { msg(e.message); } };
      m.querySelector('#pxUnlink')?.addEventListener('click', async () => { if (!confirm('連携を解除して、保存したCookieを削除しますか？')) return; try { await post({ action: 'unlink' }); r18 = false; try { localStorage.removeItem('mixall-pixiv-r18'); } catch (_) {} openAcct(); } catch (e) { msg(e.message); } });
      m.querySelector('#pxR18')?.addEventListener('change', async (ev) => {
        if (!ev.target.checked) { r18 = false; try { localStorage.removeItem('mixall-pixiv-r18'); } catch (_) {} route(new URL(normalize(new URLSearchParams(location.search).get('ServerAction')))); return; }
        ev.target.checked = false;
        if (!st.linked) { msg('先にpixivアカウントを連携してください'); return; }
        if (!st.adult) { const ok = await runQuiz(); if (!ok) return; }
        r18 = true; try { localStorage.setItem('mixall-pixiv-r18', '1'); } catch (_) {} closeModal(); route(new URL(normalize(new URLSearchParams(location.search).get('ServerAction'))));
      });
    }
    async function runQuiz() {
      let q; try { q = await post({ action: 'quizStart' }); } catch (e) { modal('<p>' + esc(e.message) + '</p><button type="button" onclick="document.getElementById(\'pxModal\').remove()">閉じる</button>'); return false; }
      if (q.already) return true;
      return new Promise((resolve) => {
        const m = modal(`<h3 style="margin:0 0 6px">年齢確認クイズ</h3><p style="font-size:.9rem;color:#556">全部の問題に答えてください。</p>${q.questions.map((x, i) => `<div style="margin:10px 0"><b>Q${i + 1}. ${esc(x.text)}</b>${x.options.map((o, j) => `<label style="display:block"><input type="radio" name="pq${i}" value="${j}"> ${esc(o)}</label>`).join('')}</div>`).join('')}<p id="pxQMsg" style="color:#c00"></p><div style="display:flex;gap:6px"><button type="button" id="pxQNext">次へ</button><button type="button" id="pxQCancel">やめる</button></div>`);
        m.querySelector('#pxQCancel').onclick = () => { closeModal(); resolve(false); };
        m.querySelector('#pxQNext').onclick = () => {
          const answers = q.questions.map((_, i) => { const c = m.querySelector(`input[name="pq${i}"]:checked`); return c ? Number(c.value) : -1; });
          if (answers.includes(-1)) { m.querySelector('#pxQMsg').textContent = 'すべての問題に答えてください'; return; }
          if (!confirm('本当によろしいですか？\n\nR-18作品には過激な表現が含まれます。18歳以上であり、自分の意思で表示します。')) return;
          post({ action: 'quizSubmit', quizId: q.quizId, answers, confirm: true }).then(() => { closeModal(); resolve(true); }).catch((e) => { m.querySelector('#pxQMsg').textContent = e.message; setTimeout(() => { closeModal(); resolve(false); }, 2500); });
        };
      });
    }
    root.querySelector('[data-acct]').onclick = openAcct;
    const tile = (x) => `<button type="button" class="pxt" data-go="https://www.pixiv.net/artworks/${esc(x.id)}"><span class="im">${x.thumb ? `<img src="${esc(x.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}${x.rank ? `<em>${x.rank}位</em>` : ''}${x.pages > 1 ? `<i>▤ ${x.pages}</i>` : ''}${x.r18 ? '<s>R-18</s>' : ''}</span><b>${esc(x.title || '無題')}</b><span class="au"${x.userId ? ` data-go="https://www.pixiv.net/users/${esc(x.userId)}"` : ''}>${x.avatar ? `<img src="${esc(x.avatar)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="av">${esc((x.author || '?').slice(0, 1))}</span>`}<small>${esc(x.author)}</small></span></button>`;
    const MODES = [['daily', 'デイリー'], ['weekly', 'ウィークリー'], ['monthly', 'マンスリー'], ['rookie', 'ルーキー'], ['original', 'オリジナル'], ['daily_ai', 'AI生成'], ['male', '男子に人気'], ['female', '女子に人気']];
    const MODES_R18 = [['daily_r18', 'R-18 デイリー'], ['weekly_r18', 'R-18 ウィークリー'], ['male_r18', 'R-18 男子'], ['female_r18', 'R-18 女子']];
    function route(u) {
      document.title = 'pixiv - MAWS'; navTabs();
      const path = decodeURIComponent(u.pathname).replace(/^\/(?:[a-z]{2}\/)(?=artworks|users|tags|ranking)/, '/');
      let m;
      if ((m = /^\/artworks\/(\d{3,12})/.exec(path))) return work(m[1]);
      if ((m = /^\/users\/(\d{1,12})/.exec(path))) return user(m[1], 1, false, u.searchParams.get('tags') || '');
      if (/^\/search_user/.test(path)) return userSearch(u.searchParams.get('nick') || '', u.searchParams.get('tags') || '');
      if ((m = /^\/tags\/([^/]+)/.exec(path))) return search(m[1], 1, 'date_d', false, u.searchParams.get('ex') || '');
      if (/^\/ranking/.test(path)) return ranking(u.searchParams.get('mode') || 'daily');
      if (u.searchParams.get('word')) return search(u.searchParams.get('word'), 1, 'date_d');
      return ranking('daily');
    }
    const pager = (page, total, n) => { const last = Math.min(20, Math.max(page + (n >= 50 ? 1 : 0), total ? Math.ceil(total / 60) : page)); const from = Math.max(1, Math.min(page - 2, last - 4)); const btns = []; btns.push(`<button type="button" data-pg="${page - 1}" ${page <= 1 ? 'disabled' : ''}>‹</button>`); for (let k = from; k <= Math.min(last, from + 4); k++) btns.push(`<button type="button" data-pg="${k}" class="${k === page ? 'on' : ''}">${k}</button>`); btns.push(`<button type="button" data-pg="${page + 1}" ${page >= last ? 'disabled' : ''}>›</button>`); return `<div class="pxpg">${btns.join('')}</div>`; };
    const navTabs = () => { const cur = new URLSearchParams(location.search).get('ServerAction') || ''; const isRank = /ranking/.test(cur) || !cur || /pixiv\.net\/?$/.test(cur); root.querySelector('[data-nav]').innerHTML = [['ホーム', 'https://www.pixiv.net/ranking.php?mode=daily', isRank && !/mode=(daily_r18|weekly_r18|male_r18|female_r18)/.test(cur)], ['ランキング(週間)', 'https://www.pixiv.net/ranking.php?mode=weekly', /mode=weekly/.test(cur)], ['新人(ルーキー)', 'https://www.pixiv.net/ranking.php?mode=rookie', /mode=rookie/.test(cur)]].concat(r18 ? [['R-18', 'https://www.pixiv.net/ranking.php?mode=daily_r18', /_r18/.test(cur)]] : []).map(([l, u, on]) => `<button type="button" class="${on ? 'on' : ''}" data-go="${u}">${l}</button>`).join(''); };
    async function ranking(mode, page = 1, append) {
      if (!append) body.innerHTML = '<p>読み込み中…</p>';
      try {
        const d = await api({ a: 'ranking', mode, p: page });
        const html = d.items.map(tile).join('');
        if (append) { body.querySelector('.pxgrid').insertAdjacentHTML('beforeend', html); body.querySelector('.pxmore')?.remove(); }
        else body.innerHTML = `<div class="pxin"><div class="pxhead"><h1>ランキング</h1></div><div class="pxtabs">${(r18 ? MODES.concat(MODES_R18) : MODES).map(([k, l]) => `<button type="button" class="${k === d.mode ? 'on' : ''}" data-go="https://www.pixiv.net/ranking.php?mode=${k}">${l}</button>`).join('')}</div><div class="pxgrid">${html}</div></div>`;
        if (d.next) { body.insertAdjacentHTML('beforeend', '<button type="button" class="pxmore">もっと見る</button>'); body.querySelector('.pxmore').onclick = () => ranking(mode, page + 1, true); }
      } catch (e) { body.innerHTML = `<p class="pxerr">${esc(e.message)}</p>`; }
    }
    async function search(word, page, order, append, ex = '') {
      if (!append) { body.innerHTML = '<p>読み込み中…</p>'; root.__setTags ? root.__setTags(word + (ex ? ' ' + ex.split(/\s+/).map((t) => '-' + t).join(' ') : '')) : (root.querySelector('[data-q]').value = word); }
      try {
        const d = await api({ a: 'search', q: word, p: page, order, ex });
        const html = d.items.map(tile).join('');
        if (append) { body.querySelector('.pxgrid').insertAdjacentHTML('beforeend', html); body.querySelector('.pxmore')?.remove(); }
        else body.innerHTML = `<div class="pxin"><div class="pxhead"><h1>#${esc(word)}${ex ? ` <small style="font-weight:400;color:#c0392b">除外: ${esc(ex)}</small>` : ''}</h1><div class="cnt">${d.total ? Number(d.total).toLocaleString() + ' 作品' : ''}</div></div><div class="pxtabs"><button type="button" class="${order === 'date_d' ? 'on' : ''}" data-order="date_d">新しい順</button><button type="button" class="${order === 'popular_d' ? 'on' : ''}" data-order="popular_d">人気順</button></div><div class="pxgrid">${html || '<p>見つかりませんでした。</p>'}</div>${pager(page, d.total, d.items.length)}</div>`;
        body.querySelectorAll('[data-order]').forEach((b) => b.onclick = () => search(word, 1, b.dataset.order, false, ex));
        body.querySelectorAll('[data-pg]').forEach((b) => b.onclick = () => { search(word, Number(b.dataset.pg), order, false, ex); body.scrollTop = 0; });
      } catch (e) { body.innerHTML = `<p class="pxerr">${esc(e.message)}</p>`; }
    }
    async function work(id) {
      body.innerHTML = '<p>読み込み中…</p>';
      try {
        const d = await api({ a: 'work', id });
        document.title = (d.title || 'pixiv') + ' - MAWS';
        const nf = (v) => v == null ? '-' : Number(v).toLocaleString();
        body.innerHTML = `<div class="pxwork"><div class="imgs">${d.ugoira ? '<div class="ugwrap"><canvas style="display:none;max-width:100%;cursor:pointer;margin:auto"></canvas><div class="ugstat" style="font-size:.8rem;color:#667;margin:4px 0"></div>' + d.pages.slice(0, 1).map((p) => `<a href="${esc(p.original || p.image)}" target="_blank" rel="noopener"><img src="${esc(p.image)}" alt="" loading="lazy" referrerpolicy="no-referrer"></a>`).join('') + '</div>' : d.pages.map((p) => `<a href="${esc(p.original || p.image)}" target="_blank" rel="noopener"><img src="${esc(p.image)}" alt="" loading="lazy" referrerpolicy="no-referrer"></a>`).join('')}</div><aside><h1>${esc(d.title)}</h1>${d.description ? `<p style="white-space:pre-wrap;overflow-wrap:anywhere;color:#474747;font-size:.92rem">${esc(d.description)}</p>` : ''}<div>${d.tags.map((t) => `<span class="pxtag ${/^R-?18/i.test(t) ? 'r' : ''}" data-go="https://www.pixiv.net/tags/${encodeURIComponent(t)}/artworks">#${esc(t)}</span>`).join('')}</div><div class="pxcounts"><span class="lk">♥ <b>${nf(d.like)}</b></span><span>🔖 <b>${nf(d.bookmark)}</b></span><span>👁 <b>${nf(d.view)}</b></span></div><div class="pxmeta">${d.date ? new Date(d.date).toLocaleString('ja-JP') : ''}</div><div class="pxauthor" style="cursor:pointer" data-go="https://www.pixiv.net/users/${esc(d.userId)}">${d.avatar ? `<img class="avimg" src="${esc(d.avatar)}" alt="" referrerpolicy="no-referrer">` : `<span class="av">${esc((d.author || '?').slice(0, 1))}</span>`}<a>${esc(d.author)}</a></div><p><a href="${esc(d.artworkUrl)}" target="_blank" rel="noopener noreferrer nofollow" style="font-size:.85rem;color:#858585">pixivで開く ↗</a></p></aside></div>${d.related.length ? `<div class="pxin"><div class="pxsec"><h3>関連作品</h3></div><div class="pxgrid">${d.related.map(tile).join('')}</div></div>` : ''}`;
        if (d.ugoira) playUgoira(body.querySelector('.ugwrap'), d.ugoira);
      } catch (e) { body.innerHTML = `<p class="pxerr">${esc(e.message)}</p>`; }
    }
    async function user(id, page, append, tagFilter = '') {
      if (!append) body.innerHTML = '<p>読み込み中…</p>';
      try {
        const d = await api({ a: 'user', id, p: page, tags: tagFilter });
        const html = d.items.map(tile).join('');
        if (append) { body.querySelector('.pxgrid').insertAdjacentHTML('beforeend', html); body.querySelector('.pxmore')?.remove(); }
        else { document.title = d.name + ' - pixiv'; body.innerHTML = `<div class="pxin"><div class="pxuser">${d.avatar ? `<img src="${esc(d.avatar)}" alt="" referrerpolicy="no-referrer">` : ''}<div><h2 style="margin:0">${esc(d.name)}</h2><span class="pxmeta">${tagFilter ? '#' + esc(tagFilter) + ' の作品 ' + d.total + '件' + (d.scanned ? '(新しい順に最大' + d.scanned + '作品から検索)' : '') : 'イラスト ' + d.total + '件'}</span></div></div><p style="white-space:pre-wrap;color:#474747">${esc(d.comment)}</p><div class="pxsec"><h3>イラスト</h3></div><div class="pxgrid">${html}</div></div>`; }
        if (d.page * 30 < d.total) { body.insertAdjacentHTML('beforeend', '<button type="button" class="pxmore">もっと見る</button>'); body.querySelector('.pxmore').onclick = () => user(id, page + 1, true, tagFilter); }
      } catch (e) { body.innerHTML = `<p class="pxerr">${esc(e.message)}</p>`; }
    }
    async function userSearch(nick, tagFilter) {
      body.innerHTML = '<p>投稿者を検索中…</p>';
      try {
        const d = await api({ a: 'userSearch', q: nick });
        body.innerHTML = `<div class="pxin"><div class="pxhead"><h1>投稿者: ${esc(nick)}</h1></div>${d.users.length ? d.users.map((u) => `<button type="button" class="pxt" style="display:flex;gap:10px;align-items:center;width:100%;text-align:left;margin:6px 0;padding:8px" data-go="https://www.pixiv.net/users/${esc(u.id)}${tagFilter ? '?tags=' + encodeURIComponent(tagFilter) : ''}">${u.avatar ? `<img src="${esc(u.avatar)}" alt="" style="width:44px;height:44px;border-radius:50%;object-fit:cover" referrerpolicy="no-referrer">` : ''}<span><b>${esc(u.name)}</b><br><small>ID ${esc(u.id)}${tagFilter ? ' ／ #' + esc(tagFilter) : ''}</small></span></button>`).join('') : '<p class="pxerr">見つかりませんでした。投稿者のユーザーID(数字)を <b>@12345</b> の形で入力すると確実です。</p>'}</div>`;
      } catch (e) { body.innerHTML = `<p class="pxerr">${esc(e.message)}</p>`; }
    }
    // ---- うごイラ(GIFのように動く作品): フレームZIPを読み込んでcanvasで再生 ----
    async function unzipAll(buf) {
      const dv = new DataView(buf), u8 = new Uint8Array(buf); let e = buf.byteLength - 22;
      while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
      if (e < 0) throw new Error('zip');
      const n = dv.getUint16(e + 10, true); let c = dv.getUint32(e + 16, true); const files = {};
      for (let i = 0; i < n; i++) {
        if (dv.getUint32(c, true) !== 0x02014b50) break;
        const method = dv.getUint16(c + 10, true), csize = dv.getUint32(c + 20, true), nl = dv.getUint16(c + 28, true), el = dv.getUint16(c + 30, true), cl = dv.getUint16(c + 32, true), off = dv.getUint32(c + 42, true);
        const name = new TextDecoder().decode(u8.subarray(c + 46, c + 46 + nl)); c += 46 + nl + el + cl;
        const ds = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true); const raw = u8.subarray(ds, ds + csize);
        if (method === 0) files[name] = raw;
        else { const ds2 = new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))); files[name] = new Uint8Array(await ds2.arrayBuffer()); }
      }
      return files;
    }
    async function playUgoira(host, ug) {
      const label = host.querySelector('.ugstat'); const setStat = (t) => { if (label) label.textContent = t; };
      try {
        setStat('うごイラを読み込み中…');
        const r = await fetch(ug.zip); if (!r.ok) throw new Error('zip fetch');
        const files = await unzipAll(await r.arrayBuffer());
        const bmps = await Promise.all(ug.frames.map((f) => createImageBitmap(new Blob([files[f.file]], { type: ug.mime }))));
        const cv = host.querySelector('canvas'); cv.width = bmps[0].width; cv.height = bmps[0].height; const ctx = cv.getContext('2d');
        let i = 0, paused = false, timer = null;
        const tick = () => { ctx.drawImage(bmps[i], 0, 0); const d = ug.frames[i].delay; i = (i + 1) % bmps.length; timer = setTimeout(tick, d); };
        cv.style.display = 'block'; host.querySelector('img')?.remove(); setStat('▶ うごイラ（タップで一時停止）'); tick();
        cv.onclick = () => { paused = !paused; if (paused) { clearTimeout(timer); setStat('⏸ 一時停止中（タップで再生）'); } else { setStat('▶ うごイラ（タップで一時停止）'); tick(); } };
      } catch (_) { setStat('うごイラを再生できませんでした(1コマ目を表示中)'); }
    }
    route(url);
  }
})();
