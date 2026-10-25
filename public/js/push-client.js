// バックグラウンド通知(Web Push)のブラウザ側。通知の許可が出ている端末は、ページを開くたびに購読を自動で最新化する。
window.MixAllPush = (() => {
  const sess = () => { try { return JSON.parse(localStorage.getItem('netrify_session') || 'null'); } catch (_) { return null; } };
  const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const b64uToBytes = (s) => { const p = '='.repeat((4 - s.length % 4) % 4); const b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
  async function call(body) { const s = sess(); if (!s || !s.token) throw new Error('ログインが必要です'); const r = await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, token: s.token }) }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || '通信に失敗しました'); return d; }
  async function reg() { return navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready); }
  async function subscribe() {
    if (!supported()) throw new Error('この端末・ブラウザはバックグラウンド通知に対応していません(iPhoneは「ホーム画面に追加」したアプリで使えます)');
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('通知が許可されていません(ブラウザ・端末の設定で許可してください)');
    const r = await reg();
    const key = (await fetch('/api/push').then((x) => x.json())).publicKey;
    let sub = await r.pushManager.getSubscription();
    if (!sub) sub = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(key) });
    await call({ action: 'subscribe', subscription: sub.toJSON() });
    return true;
  }
  async function unsubscribe() {
    if (!supported()) return;
    const r = await reg(); const sub = await r.pushManager.getSubscription();
    if (sub) { try { await call({ action: 'unsubscribe', endpoint: sub.endpoint }); } catch (_) {} await sub.unsubscribe(); }
  }
  async function isOn() {
    if (!supported() || Notification.permission !== 'granted') return false;
    try { const r = await reg(); const sub = await r.pushManager.getSubscription(); if (!sub) return false; return (await call({ action: 'status', endpoint: sub.endpoint })).subscribed; } catch (_) { return false; }
  }
  // すでに許可済みなら、ログイン中は自動で購読を最新化(トークンや端末の更新に追従)
  async function sync() {
    try { if (!supported() || Notification.permission !== 'granted' || !sess()) return; const r = await reg(); const sub = await r.pushManager.getSubscription(); if (sub) await call({ action: 'subscribe', subscription: sub.toJSON() }); } catch (_) {}
  }
  const test = () => call({ action: 'test' });
  return { supported, subscribe, unsubscribe, isOn, sync, test };
})();
if (document.readyState === 'complete') MixAllPush.sync(); else window.addEventListener('load', () => MixAllPush.sync());
