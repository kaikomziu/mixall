// たまに(ガチでたまに)出るフィードバック欄: ☆☆☆☆☆を押して★にし、理由を書いて送る。
// 出る条件: ログイン中・ログイン画面以外・前回の表示から21日以上・ページを開いて約25秒後に1.2%の確率。「今後出さない」あり。
(function () {
  try {
    if (window.__mxFb || window.self !== window.top) return; window.__mxFb = true;
    const path = location.pathname.toLowerCase();
    if (/^\/(login|register|reset-password|unlock|age\.html|admin|emergency)/.test(path)) return;
    const KEY = 'mx-feedback', now = Date.now();
    let st = {}; try { st = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) {}
    if (st.never || (st.at && now - st.at < 21 * 86400e3)) return;
    const session = window.Netrify?.getSession?.(); if (!session) return;
    const force = /[?&]feedback=1\b/.test(location.search);
    if (!force && Math.random() > 0.012) return;
    setTimeout(() => {
      if (document.getElementById('mxFeedback') || document.querySelector('#callScreen:not([hidden])')) return;
      const save = (p) => { try { localStorage.setItem(KEY, JSON.stringify({ ...st, ...p })); } catch (_) {} };
      const box = document.createElement('div'); box.id = 'mxFeedback'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'フィードバック');
      box.innerHTML = `<style>#mxFeedback{position:fixed;right:12px;bottom:calc(env(safe-area-inset-bottom) + 76px);z-index:99990;width:min(94vw,340px);background:var(--panel,#1c2230);color:var(--text,#fff);border:1px solid var(--accent,#4f8cff);border-radius:16px;padding:14px;box-shadow:0 10px 36px #0006;font-size:.9rem}#mxFeedback h4{margin:0 0 4px;font-size:1rem}#mxFeedback .st{display:flex;gap:2px;margin:6px 0}#mxFeedback .st button{background:none;border:0;font-size:2rem;line-height:1;cursor:pointer;color:#f5b301;padding:0 3px}#mxFeedback textarea{width:100%;box-sizing:border-box;min-height:70px;border-radius:10px;padding:8px;font-size:.9rem}#mxFeedback .r{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}#mxFeedback .r button{border-radius:10px;padding:8px 12px;cursor:pointer}#mxFeedback .x{position:absolute;right:8px;top:6px;background:none;border:0;font-size:1.2rem;cursor:pointer;color:inherit}#mxFeedback small{opacity:.7}</style>
<button type="button" class="x" aria-label="閉じる">×</button><h4>MixAllはどうですか？</h4><small>よければ評価と理由を教えてください（運営だけが読みます）</small>
<div class="st" role="radiogroup" aria-label="評価"></div><textarea placeholder="理由・良かった点・困った点など" maxlength="1500"></textarea><div class="r"><button type="button" class="send">送信</button><button type="button" class="later ghost">あとで</button><button type="button" class="never ghost">今後出さない</button></div><div class="msg" style="min-height:1.1em;margin-top:6px;font-size:.8rem"></div>`;
      document.body.appendChild(box);
      let rating = 0; const wrap = box.querySelector('.st');
      const paint = () => { wrap.innerHTML = ''; for (let i = 1; i <= 5; i++) { const b = document.createElement('button'); b.type = 'button'; b.textContent = i <= rating ? '★' : '☆'; b.setAttribute('aria-label', i + '点'); b.onclick = () => { rating = i; paint(); }; wrap.appendChild(b); } };
      paint();
      const close = (p) => { save({ at: Date.now(), ...p }); box.remove(); };
      box.querySelector('.x').onclick = () => close({}); box.querySelector('.later').onclick = () => close({});
      box.querySelector('.never').onclick = () => close({ never: true });
      box.querySelector('.send').onclick = async () => {
        const msg = box.querySelector('.msg'); if (!rating) { msg.textContent = '★の数を選んでください'; return; }
        try { await Netrify.api('/api/feedback', { action: 'submit', token: session.token, rating, reason: box.querySelector('textarea').value, page: location.pathname }); msg.textContent = 'ありがとうございました！'; save({ at: Date.now() }); setTimeout(() => box.remove(), 1200); }
        catch (e) { msg.textContent = e.message || '送信できませんでした'; }
      };
    }, force ? 500 : 25000);
  } catch (_) {}
})();
