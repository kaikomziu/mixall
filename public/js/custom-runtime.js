// Customゲーム用の安全なサーバー保存・プロジェクト間通信API。
// アカウント識別子やメールアドレスをゲームコードへ渡す必要はありません。
(function () {
  const api = (body) => {
    const session = window.Netrify?.requireLogin?.() || window.Netrify?.getSession?.();
    if (!session?.token) return Promise.reject(new Error('ログインが必要です'));
    return window.Netrify.api('/.netlify/functions/custom', { token: session.token, ...body });
  };
  window.NetrifyCustom = {
    saveGameData(projectId, key, value) { return api({ action:'saveData', projectId, scope:'game', key, value }); },
    loadGameData(projectId, key) { return api({ action:'loadData', projectId, scope:'game', key }); },
    saveAccountData(projectId, key, value) { return api({ action:'saveData', projectId, scope:'account', key, value }); },
    loadAccountData(projectId, key) { return api({ action:'loadData', projectId, scope:'account', key }); },
    sendProjectMessage(fromProjectId, toProjectId, type, message) { return api({ action:'sendProjectMessage', fromProjectId, toProjectId, type, message }); },
    pollProjectMessages(projectId, since) { return api({ action:'pollProjectMessages', projectId, since }); }
  };
})();
