// server/remote-check.mjs
// デプロイ済みの mixall-api（本番DB）で、登録・Pocket送受信・端末配送・受領削除をひと通り確かめる。
//   node server/remote-check.mjs [API_BASE]
// テスト用アカウント mixall-check-a / mixall-check-b を作る（終わったら運営画面かSQLで削除してよい）。
const API = (process.argv[2] || 'https://kifnzvktwbomxthzvvgy.supabase.co/functions/v1/mixall-api').replace(/\/$/, '');

async function call(fn, body, { device, ack, query = '' } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (device) headers['x-mixall-device'] = device;
  if (ack) headers['x-mixall-ack'] = String(ack);
  const started = Date.now();
  const res = await fetch(`${API}/${fn}${query}`, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, ms: Date.now() - started };
}

async function account(name) {
  const email = `${name}@bix.3erver`;
  let r = await call('auth', { action: 'login', email, password: 'check-pass-123', device: {} });
  if (r.status !== 200) r = await call('auth', { action: 'register', email, password: 'check-pass-123', displayName: name, humanCheck: true, birthDate: '2000-01-01', device: {} });
  if (!r.data.token) throw new Error(`${name}: ${JSON.stringify(r.data)}`);
  return r.data.token;
}

function check(label, ok, detail = '') {
  console.log(`${ok ? 'OK ' : 'NG '} ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
}

const a = await account('mixall-check-a');
const b = await account('mixall-check-b');
const created = await call('pocket', { action: 'createRoom', token: a, type: 'dm', memberEmails: ['mixall-check-b@bix.3erver'] });
check('ルーム作成', created.status < 300, `${created.ms}ms`);
const roomId = created.data.room?.id;
await call('chat', { action: 'pull', token: b }, { device: 'check-device-b-01' });

const text = `本番チェック ${new Date().toISOString()}`;
const sent = await call('pocket', { action: 'sendMessage', token: a, roomId, text }, { device: 'check-device-a-01' });
check('送信', sent.status === 200, `${sent.ms}ms`);
check('送信者の端末へ本文', Boolean(sent.data.__vault?.items.some((i) => i.fields?.text === text)));

const got = await call('pocket', null, { device: 'check-device-b-01', query: `?token=${b}&roomId=${roomId}` });
const stub = got.data.room?.messages?.at(-1);
check('ルーム取得', got.status === 200, `${got.ms}ms`);
check('サーバーのスタブに本文なし', stub && stub.text === '' && stub.vault === true);
const item = got.data.__vault?.items.find((i) => i.msgId === stub?.id);
check('受信者の端末へ本文', item?.fields?.text === text);

await call('chat', { action: 'pull', token: b }, { device: 'check-device-b-01', ack: got.data.__vault?.maxId });
const again = await call('chat', { action: 'pull', token: b }, { device: 'check-device-b-01' });
check('受領後はキューから消える', !again.data.__vault?.items.some((i) => i.msgId === stub?.id));
