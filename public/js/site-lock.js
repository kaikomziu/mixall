(() => {
  if (location.pathname === '/admin' || location.pathname.startsWith('/admin/')) return;
  fetch('/.netlify/functions/site-state', { cache: 'no-store' })
    .then((response) => response.json())
    .then((state) => {
      if (!state.locked) return;
      document.documentElement.innerHTML = `<head><meta charset="UTF-8"><title>保護ロック中</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0f1115;color:#e6e8ec;font-family:system-ui,sans-serif"><main style="max-width:560px;padding:32px;text-align:center"><h1>サイトは保護ロック中です</h1><p>${String(state.message || 'データ保護のため、現在このサイトは停止しています。').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]))}</p><p style="color:#9aa1ad">運営アカウントは管理画面からロックを解除できます。</p></main></body>`;
    })
    .catch(() => {});
})();
