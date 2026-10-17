// public/js/auth.js
// 疑似メールアカウントのログイン状態をブラウザ側で保持する共通モジュール。
// セッショントークン自体はサーバー(Netlify Blobs)で検証されるため、
// ここではトークンの保存・付与のみを担当する。

const Netrify = (() => {
  const STORAGE_KEY = 'netrify_session';
  const ACCOUNTS_KEY = 'netrify_accounts';
  const checkedAgeTokens = new Set();

  function verifyServerAgeStatus(session) {
    if (!session || !session.token || checkedAgeTokens.has(session.token)) return;
    const token = session.token;
    checkedAgeTokens.add(token);
    fetch('/.netlify/functions/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getBirthDate', token })
    }).then(async (response) => {
      let data = {};
      try { data = await response.json(); } catch {}
      let current = null;
      try { current = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch {}
      if (!current || current.token !== token) return;
      // 年齢入力画面でこのリクエスト後に登録が完了した場合、古い未登録レスポンスで成功状態を戻さない。
      if (current.hasBirthDate === true && session.hasBirthDate !== true) return;
      if (!response.ok) {
        if (response.status === 401 || response.status === 404) invalidateSession('ログイン状態が無効になりました。ログイン画面へ移動します。');
        else checkedAgeTokens.delete(token);
        return;
      }
      const hasBirthDate = data.hasBirthDate === true || Boolean(data.birthDate);
      const updated = { ...current, age:data.age ?? null, hasBirthDate };
      setSession(updated);
      if (!hasBirthDate && window.location.pathname.toLowerCase() !== '/age.html') {
        const next = window.location.pathname + window.location.search + window.location.hash;
        window.location.replace('/age.html?next=' + encodeURIComponent(next));
      }
    }).catch(() => {
      // 一時的な通信障害では年齢未確認と断定せず、次のgetSession()で再試行する。
      checkedAgeTokens.delete(token);
    });
  }

  function getSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const session = raw ? JSON.parse(raw) : null;
      if (session && !session.token) {
        clearSession();
        return null;
      }
      if (session) verifyServerAgeStatus(session);
      return session;
    } catch {
      return null;
    }
  }

  function setSession(session) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    const accounts = listAccounts().filter((item) => item.email !== session.email); accounts.unshift(session); localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts.slice(0, 8)));
  }

  function clearSession() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function redirectToLogin() {
    const path = window.location.pathname.toLowerCase();
    if (path === '/login/' || path === '/login/index.html' || path === '/register/' || path === '/register/index.html') return;
    const next = window.location.pathname + window.location.search + window.location.hash;
    window.location.replace('/login/?next=' + encodeURIComponent(next));
  }

  function invalidateSession(message) {
    clearSession();
    if (message) window.alert(message);
    redirectToLogin();
  }

  function listAccounts() { try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]').filter((item) => item && item.email && item.token); } catch { return []; } }
  function switchAccount(email) { const target=listAccounts().find((item)=>item.email===email); if(!target) return false; setSession(target); window.location.reload(); return true; }
  function forgetAccount(email) { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(listAccounts().filter((item)=>item.email!==email))); }

  async function api(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    const rawText = await res.text();
    let data = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      // JSONで返ってこなかった場合(502のHTML応答など)は、原文をそのまま見せる
      if (!res.ok) throw new Error(`エラー (${res.status}): ${rawText.slice(0, 300) || '(本文なし)'}`);
    }
    if (!res.ok) {
      const current = getSession();
      if (res.status === 401 && current && current.token && body && body.token) {
        try {
          const noticeResponse = await fetch('/.netlify/functions/auth', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'consumeLogoutNotice', token:current.token }) });
          const notice = await noticeResponse.json();
          if (notice.notified) {
            invalidateSession(notice.message || '運営によりログアウトさせられました。');
          } else {
            invalidateSession('ログイン状態が無効になりました。ログイン画面へ移動します。');
          }
        } catch (_) {
          invalidateSession('ログイン状態を確認できません。ログイン画面へ移動します。');
        }
      }
      throw new Error(data.error || `エラー (${res.status})`);
    }
    return data;
  }

  function deviceInfo() {
    const ua = navigator.userAgent || '';
    const platform = navigator.userAgentData && navigator.userAgentData.platform ? navigator.userAgentData.platform : (navigator.platform || '不明な環境');
    return { label: `${platform} / ${ua.includes('Mobile') ? 'モバイル' : 'ブラウザ'}`, userAgent: ua };
  }

  async function register({ email, password, displayName, humanCheck, birthDate }) {
    const data = await api('/.netlify/functions/auth', { action: 'register', email, password, displayName, humanCheck, birthDate, device: deviceInfo() });
    setSession({ email: data.email, token: data.token, age:data.age, hasBirthDate:data.hasBirthDate === true, displayName: displayName || data.email.split('@')[0], isAdmin: data.isAdmin === true, isDeputyAdmin: data.isDeputyAdmin === true, isOfficial: data.isOfficial === true });
    return data;
  }

  async function login({ email, password }) {
    const data = await api('/.netlify/functions/auth', { action: 'login', email, password, device: deviceInfo() });
    setSession({ email: data.email, token: data.token, age:data.age, hasBirthDate:data.hasBirthDate === true, displayName: data.displayName, isAdmin: data.isAdmin === true, isDeputyAdmin: data.isDeputyAdmin === true, isOfficial: data.isOfficial === true });
    return data;
  }

  async function changePassword({ currentPassword, newPassword }) {
    const s = getSession();
    if (!s) throw new Error('ログインが必要です');
    return api('/.netlify/functions/auth', { action: 'changePassword', token: s.token, currentPassword, newPassword });
  }

  async function suggestEmail() {
    const data = await api('/.netlify/functions/auth', { action: 'suggest' });
    return data.email;
  }

  async function checkEmail(email) {
    const data = await api('/.netlify/functions/auth', { action: 'checkEmail', email });
    return data.available;
  }

  async function listSessions() {
    const s = getSession();
    if (!s) throw new Error('ログインが必要です');
    return api('/.netlify/functions/auth', { action: 'listSessions', token: s.token });
  }

  async function revokeSession(sessionId) {
    const s = getSession();
    if (!s) throw new Error('ログインが必要です');
    const data = await api('/.netlify/functions/auth', { action: 'revokeSession', token: s.token, sessionId });
    if (data.revokedCurrent) invalidateSession('この端末のログインを解除しました。');
    return data;
  }

  async function logout() {
    const s = getSession();
    if (!s) return { ok: true, alreadyLoggedOut: true };
    try {
      return await api('/.netlify/functions/auth', { action: 'logout', token: s.token });
    } finally {
      clearSession();
    }
  }

  function requireLogin() {
    const s = getSession();
    if (!s) {
      window.location.href = '/login/?next=' + encodeURIComponent(window.location.pathname + window.location.search);
      return null;
    }
    return s;
  }

  return {
    getSession, setSession, clearSession, listAccounts, switchAccount, forgetAccount, register, login, changePassword,
    suggestEmail, checkEmail, listSessions, revokeSession, logout, requireLogin, api
  };
})();
window.Netrify = Netrify;
