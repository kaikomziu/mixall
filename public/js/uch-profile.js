(() => {
  const mount = async () => {
    const session = window.Netrify?.getSession?.();
    const main = document.querySelector('main');
    if (!session || !main || document.getElementById('uchProfileEditor')) return;
    const card = document.createElement('section');
    card.className = 'card';
    card.id = 'uchProfileEditor';
    card.innerHTML = '<h3>Uchの名前とID</h3><p class="muted">Uchだけで使う名前です。ぽけっと・Ghostの名前とは別に設定できます。メールアドレスは表示されません。</p><div class="row"><input id="uchNameInput" placeholder="Uchで表示する名前" style="flex:1"><span id="uchIdLabel" class="muted"></span><button type="button" id="uchNameSave">保存</button></div><div id="uchProfileError" class="error"></div>';
    main.insertBefore(card, main.firstChild);
    const input = card.querySelector('#uchNameInput');
    const idLabel = card.querySelector('#uchIdLabel');
    const error = card.querySelector('#uchProfileError');
    try {
      const result = await fetch('/.netlify/functions/uch?profile=me&token=' + encodeURIComponent(session.token));
      const data = await result.json();
      if (!result.ok) throw new Error(data.error || 'Uchプロフィールを取得できませんでした');
      input.value = data.profile?.name || session.displayName || '';
      idLabel.textContent = data.profile?.uchId ? 'ID: @' + data.profile.uchId : '';
    } catch (e) { error.textContent = e.message; }
    card.querySelector('#uchNameSave').onclick = async () => {
      error.textContent = '';
      try {
        const data = await Netrify.api('/.netlify/functions/uch', { action:'saveUchProfile', token:session.token, name:input.value });
        idLabel.textContent = 'ID: @' + data.profile.uchId;
        alert('Uchの名前を保存しました。');
      } catch (e) { error.textContent = e.message; }
    };
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
