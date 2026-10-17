// server/smoke-test.js
// メモリKVで mixall-api を動かし、端末保存チャットの基本動作を確かめる。
//   node server/smoke-test.js
process.env.MIXALL_STORE = 'memory';
const assert = require('node:assert/strict');
const { handle } = require('./entry');
const { STORE_NAMES, db } = require('../netlify/lib/store');

const BASE = 'http://localhost/functions/v1/mixall-api';

async function call(fn, body, { device, ack, method = 'POST', query = '' } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (device) headers['x-mixall-device'] = device;
  if (ack) headers['x-mixall-ack'] = String(ack);
  const res = await handle(new Request(`${BASE}/${fn}${query}`, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(body || {}) }));
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function register(name) {
  const r = await call('auth', { action: 'register', email: `${name}@bix.3erver`, password: 'test-pass-123', displayName: name, humanCheck: true, birthDate: '2000-01-01', device: {} });
  assert.ok(r.status < 300, `register ${name}: ${JSON.stringify(r.data)}`);
  const token = r.data.token || r.data.session?.token;
  assert.ok(token, `token for ${name}: ${JSON.stringify(r.data).slice(0, 200)}`);
  return token;
}

(async () => {
  const alice = await register('alice');
  const bob = await register('bob');
  const room = await call('pocket', { action: 'createRoom', token: alice, type: 'dm', memberEmails: ['bob@bix.3erver'] });
  assert.ok(room.status < 300, JSON.stringify(room.data));
  const roomId = room.data.room?.id || room.data.roomId || room.data.id;
  assert.ok(roomId, JSON.stringify(room.data));

  // 端末登録（最初のpullで登録される）
  await call('chat', { action: 'pull', token: alice }, { device: 'alice-phone-1' });
  await call('chat', { action: 'pull', token: bob }, { device: 'bob-laptop-01' });

  const sent = await call('pocket', { action: 'sendMessage', token: alice, roomId, text: 'ひみつの本文' }, { device: 'alice-phone-1' });
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  // 送信者の端末にも同じ応答で本文が届く
  assert.ok(sent.data.__vault.items.some((item) => item.fields.text === 'ひみつの本文'), 'sender device receives body');

  // サーバーのKVには本文が残っていない
  const stored = await require('../netlify/lib/store').getJSON(STORE_NAMES.POCKET_ROOMS, roomId);
  const stub = stored.messages[stored.messages.length - 1];
  assert.equal(stub.text, '');
  assert.equal(stub.vault, true);
  assert.ok(!JSON.stringify(db()._data.get(`${STORE_NAMES.POCKET_ROOMS}\u0000${roomId}`)).includes('ひみつ'), 'no body in KV');
  assert.ok(![...db()._data.values()].some((v) => v.includes('ひみつの本文')), 'no body anywhere in KV (incl. notifications)');

  // 受信者の端末: ルーム取得の応答に本文が同梱される
  const got = await call('pocket', null, { method: 'GET', query: `?token=${bob}&roomId=${roomId}`, device: 'bob-laptop-01' });
  assert.equal(got.status, 200, JSON.stringify(got.data));
  const item = got.data.__vault.items.find((x) => x.msgId === stub.id);
  assert.equal(item.fields.text, 'ひみつの本文');
  // 受領（ack）したら配送キューから消える
  await call('chat', { action: 'pull', token: bob }, { device: 'bob-laptop-01', ack: got.data.__vault.maxId });
  assert.ok(!db()._inbox.some((row) => row.email === 'bob@bix.3erver'), 'bob inbox empty after ack');

  // 編集すると新しい本文が届く
  await call('pocket', { action: 'editMessage', token: alice, roomId, messageId: stub.id, text: '編集後' });
  const after = await call('chat', { action: 'pull', token: bob }, { device: 'bob-laptop-01' });
  assert.ok(after.data.__vault.items.some((x) => x.msgId === stub.id && x.fields.text === '編集後'), 'edit delivered');

  // Mail: 件名と本文が端末へ
  const mail = await call('mail', { action: 'send', token: alice, to: 'bob@bix.3erver', subject: '件名テスト', body: 'メール本文' }, { device: 'alice-phone-1' });
  assert.equal(mail.status, 201, JSON.stringify(mail.data));
  assert.equal(mail.data.thread.subject, '');
  const mailPull = await call('chat', { action: 'pull', token: bob }, { device: 'bob-laptop-01' });
  assert.ok(mailPull.data.__vault.items.some((x) => x.kind === 'thread' && x.fields.subject === '件名テスト'));
  assert.ok(mailPull.data.__vault.items.some((x) => x.fields.text === 'メール本文'));

  // 端末ヘッダーが無ければ同梱しない
  const noDevice = await call('pocket', null, { method: 'GET', query: `?token=${bob}` });
  assert.equal(noDevice.data.__vault, undefined);

  // 定期実行はcron秘密ヘッダーが無いと拒否
  const cron = await call('scheduled-tools-cleanup', {});
  assert.equal(cron.status, 403);

  console.log('smoke test OK');
})().catch((error) => { console.error(error); process.exit(1); });
