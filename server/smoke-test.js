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

  // ---- MixAll+ 追加機能 ----
  const plus = (body) => call('plus', body);
  // ログインボーナス: 1日1回、Coinが増える
  const d1 = await plus({ action: 'claimDaily', token: alice });
  assert.equal(d1.status, 200, JSON.stringify(d1.data));
  assert.ok(d1.data.claimed > 0 && d1.data.balance === d1.data.claimed);
  const d2 = await plus({ action: 'claimDaily', token: alice });
  assert.equal(d2.data.already, true);
  // デイリーミッション: Pocketで送った分は達成済み（バックグラウンドで記録されるので少し待つ）
  await new Promise((r) => setTimeout(r, 50));
  const daily = await plus({ action: 'daily', token: alice });
  assert.ok(daily.data.missions.find((m) => m.id === 'pocket').done, 'pocket mission done');
  const mission = await plus({ action: 'claimMission', token: alice, id: 'pocket' });
  assert.equal(mission.status, 200, JSON.stringify(mission.data));
  assert.equal((await plus({ action: 'claimMission', token: alice, id: 'ghost' })).status, 400);
  // 未読バッジ
  const badges = await plus({ action: 'badges', token: bob });
  assert.ok(badges.data.chat >= 1, JSON.stringify(badges.data));
  // ミュート
  const mutes = await plus({ action: 'saveMutes', token: bob, mutes: { users: ['Alice@bix.3erver', 'alice@bix.3erver'], words: ['ネタバレ'] } });
  assert.deepEqual(mutes.data.mutes.users, ['alice@bix.3erver']);
  // ストーリー: 作成・一覧・既読・削除
  const story = await plus({ action: 'createStory', token: alice, text: 'きょうのひとこと' });
  assert.equal(story.status, 201, JSON.stringify(story.data));
  const stories = await plus({ action: 'stories', token: bob });
  assert.equal(stories.data.authors.length, 1);
  assert.equal(stories.data.authors[0].email, undefined, '他人のメールアドレスは出さない');
  await plus({ action: 'viewStory', token: bob, id: story.data.id });
  assert.equal((await plus({ action: 'stories', token: alice })).data.authors[0].stories[0].views, 1);
  assert.equal((await plus({ action: 'deleteStory', token: bob, id: story.data.id })).status, 403);
  // 端末の引き継ぎ: 預けて、ログインなしのIDで受け取る
  const tr = await plus({ action: 'transferCreate', token: alice, data: 'QUJD'.repeat(10), iv: 'aXZpdml2aXZpdml2' });
  assert.equal(tr.status, 200, JSON.stringify(tr.data));
  const got2 = await plus({ action: 'transferGet', id: tr.data.id });
  assert.equal(got2.data.data, 'QUJD'.repeat(10));
  // お知らせ: 一般ユーザーは設定できない
  assert.equal((await plus({ action: 'setAnnouncement', token: bob, text: 'x' })).status, 403);
  assert.equal((await plus({ action: 'announcement' })).data.announcement, null);
  // プロフィールの追加設定
  const prof = await plus({ action: 'saveProfileExtras', token: alice, color: '#ff4f8b', link: 'https://example.com' });
  assert.equal(prof.data.extras.color, '#ff4f8b');
  assert.ok(prof.data.extras.badges.some((b) => b.id === 'new'));

  // ---- MixAll+ 第2弾 ----
  const gp = await call('ghost', { action: 'createPost', token: alice, text: 'どれが好き？', contentType: 'text' });
  assert.equal(gp.status, 201, JSON.stringify(gp.data));
  const pid = gp.data.post.id;
  const poll = await plus({ action: 'createPoll', token: alice, postId: pid, poll: { options: ['いぬ', 'ねこ', ''] } });
  assert.equal(poll.data.poll.options.length, 2);
  assert.equal((await plus({ action: 'createPoll', token: bob, postId: pid, poll: { options: ['a', 'b'] } })).status, 403);
  const vote = await plus({ action: 'votePoll', token: bob, postId: pid, optionId: 'o1' });
  assert.equal(vote.data.poll.options[1].count, 1); assert.equal(vote.data.poll.myVote, 'o1');
  const react = await plus({ action: 'react', token: bob, target: `post:${pid}`, emoji: '🔥' });
  assert.deepEqual(react.data.counts, { '🔥': 1 });
  const extras = await plus({ action: 'postExtras', token: alice, postIds: [pid] });
  assert.equal(extras.data.polls[pid].total, 1); assert.equal(extras.data.polls[pid].myVote, null);
  assert.ok(!JSON.stringify(extras.data).includes('bob@'), '投票者・リアクションした人のメールは出さない');
  // Coinショップ: 残高が足りないと買えない／買うと装備される
  assert.equal((await plus({ action: 'buy', token: bob, id: 'title-hero' })).status, 400);
  await plus({ action: 'claimDaily', token: bob });
  const coinsNow = (await plus({ action: 'shop', token: bob })).data.balance;
  assert.ok(coinsNow >= 12);
  require('../netlify/lib/store').setJSON(STORE_NAMES.COINS, 'bob@bix.3erver', 100);
  await new Promise((r) => setTimeout(r, 10));
  const bought = await plus({ action: 'buy', token: bob, id: 'title-hero' });
  assert.equal(bought.status, 200, JSON.stringify(bought.data));
  assert.equal(bought.data.balance, 60); assert.equal(bought.data.equipped.title, 'title-hero');
  // 予約投稿: 期限が来たら公開される
  const sched = await plus({ action: 'schedulePost', token: alice, at: Date.now() + 61000, post: { text: '予約した投稿', contentType: 'text' }, poll: { options: ['はい', 'いいえ'] } });
  assert.equal(sched.status, 200, JSON.stringify(sched.data));
  const { STORES } = require('./plus2');
  const sk = (await require('../netlify/lib/store').listKeys(STORES.SCHEDULED))[0];
  const job = await require('../netlify/lib/store').getJSON(STORES.SCHEDULED, sk);
  job.at = Date.now() - 1; await require('../netlify/lib/store').setJSON(STORES.SCHEDULED, sk, job);
  assert.equal(await require('./plus2').publishScheduled(), 1);
  const feedAfter = await call('ghost', null, { method: 'GET', query: `?token=${alice}&limit=10` });
  assert.ok(feedAfter.data.posts.some((p) => p.text === '予約した投稿'), 'scheduled post published');
  // ブックマークのメモ
  const note = await plus({ action: 'saveNote', token: alice, postId: pid, note: 'あとで読む' });
  assert.equal(note.data.notes[pid].text, 'あとで読む');
  // 運営からの警告: 一般ユーザーは送れない
  assert.equal((await plus({ action: 'sendWarning', token: bob, email: 'alice@bix.3erver', body: 'x' })).status, 403);

  // ---- AgentMail: 外部宛て送信 → 相手の返信をWebhookで取り込む ----
  const crypto = require('crypto');
  const store = require('../netlify/lib/store');
  const whsec = `whsec_${Buffer.from('test-webhook-secret-123456').toString('base64')}`;
  await store.setJSON(STORE_NAMES.ADMIN_SECRETS, 'email:settings', { provider: 'agentmail', providerApiKey: 'am_test', from: 'agent-3097@agentmail.to', webhookSecret: whsec });
  const realFetch = globalThis.fetch;
  const amCalls = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://api.agentmail.to/')) {
      amCalls.push({ url: String(url), body: JSON.parse(init.body || '{}') });
      return new Response(JSON.stringify({ message_id: `<m${amCalls.length}@agentmail.to>`, thread_id: 'th-1' }), { status: 200 });
    }
    return realFetch(url, init);
  };
  const ext = await call('mail', { action: 'send', token: alice, to: 'friend@example.com', subject: 'こんにちは', body: '外部への本文' }, { device: 'alice-phone-1' });
  assert.equal(ext.status, 201, JSON.stringify(ext.data));
  assert.ok(amCalls[0].url.endsWith('/inboxes/agent-3097%40agentmail.to/messages/send'), amCalls[0].url);
  assert.equal(amCalls[0].body.subject, 'こんにちは');
  assert.ok(amCalls[0].body.text.includes('外部への本文') && amCalls[0].body.text.includes('alice@bix.3erver'));
  const extId = ext.data.thread.id;
  const hook = async (payload, secret = whsec) => {
    const raw = JSON.stringify(payload); const id = `msg_${crypto.randomBytes(6).toString('hex')}`; const ts = String(Math.floor(Date.now() / 1000));
    const sig = crypto.createHmac('sha256', Buffer.from(secret.replace(/^whsec_/, ''), 'base64')).update(`${id}.${ts}.${raw}`).digest('base64');
    const res = await handle(new Request(`${BASE}/agentmail-webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': `v1,${sig}` }, body: raw }));
    return { status: res.status, data: await res.json() };
  };
  const inbound = { type: 'event', event_type: 'message.received', event_id: 'ev-1', message: { thread_id: 'th-1', message_id: '<r1@example.com>', from: 'Friend <friend@example.com>', subject: 'Re: こんにちは', text: 'お返事です！\n\nOn Mon, Oct 20, 2026 alice wrote:\n> 外部への本文' } };
  assert.equal((await hook(inbound, `whsec_${Buffer.from('wrong-secret').toString('base64')}`)).status, 401, 'bad signature rejected');
  assert.equal((await hook(inbound)).status, 200);
  assert.equal((await hook(inbound)).data.duplicate, true, 'retries are deduplicated');
  const spoof = await hook({ ...inbound, event_id: 'ev-2', message: { ...inbound.message, from: 'evil@example.com' } });
  assert.equal(spoof.data.ignored, true, 'other senders ignored');
  const extPull = await call('chat', { action: 'pull', token: alice }, { device: 'alice-phone-1' });
  assert.ok(extPull.data.__vault.items.some((x) => x.fields.text === 'お返事です！'), 'inbound reply delivered to device without quote');
  const extThread = await store.getJSON(STORE_NAMES.MAIL_THREADS, extId);
  assert.equal(extThread.messages.length, 2);
  assert.equal(extThread.messages[1].text, '', 'inbound body not kept on server');
  // 返信はAgentMailのreply APIで同じスレッドに
  const rep = await call('mail', { action: 'reply', token: alice, threadId: extId, subject: 'こんにちは', body: 'ありがとう' });
  assert.equal(rep.status, 200, JSON.stringify(rep.data));
  assert.ok(amCalls[1].url.includes('/messages/%3Cr1%40example.com%3E/reply'), amCalls[1].url);
  globalThis.fetch = realFetch;

  // ---- GitHub のデータ置き場: 移した後も getJSON で元の値が読め、削除するとあちらも消える ----
  process.env.MIXALL_GH_DATA_TOKEN = 'github_pat_test'; process.env.MIXALL_GH_DATA_REPO = 'kaikomziu/mixall-data';
  const repoFiles = new Map(); const ghCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (!u.startsWith('https://api.github.com/repos/kaikomziu/mixall-data/contents/')) return realFetch(url, init);
    const path = decodeURIComponent(u.split('/contents/')[1].split('?')[0]);
    ghCalls.push(`${init.method || 'GET'} ${path}`);
    if ((init.method || 'GET') === 'PUT') { const body = JSON.parse(init.body); repoFiles.set(path, Buffer.from(body.content, 'base64').toString('utf8')); return new Response(JSON.stringify({ content: { sha: 'sha1' } })); }
    if (init.method === 'DELETE') { repoFiles.delete(path); return new Response('{}'); }
    if (!repoFiles.has(path)) return new Response('{}', { status: 404 });
    return new Response(/raw/.test(init.headers?.Accept || '') ? repoFiles.get(path) : JSON.stringify({ sha: 'sha1' }));
  };
  const gha = require('../netlify/lib/github-archive');
  const big = { data: 'x'.repeat(50000) };
  await store.setJSON(STORE_NAMES.FILE_CHUNKS, 'f1:chunk:0', big);
  const stubbed = await gha.archive(STORE_NAMES.FILE_CHUNKS, 'f1:chunk:0', big);
  await store.db().set(STORE_NAMES.FILE_CHUNKS, 'f1:chunk:0', stubbed);
  assert.ok(!JSON.stringify(await store.db().get(STORE_NAMES.FILE_CHUNKS, 'f1:chunk:0')).includes('xxxx'), 'DBには目印だけ');
  assert.equal((await store.getJSON(STORE_NAMES.FILE_CHUNKS, 'f1:chunk:0')).data.length, 50000, 'GitHubから元の値を復元');
  await store.deleteKey(STORE_NAMES.FILE_CHUNKS, 'f1:chunk:0');
  assert.equal(repoFiles.size, 0, 'GitHub側も削除');
  globalThis.fetch = realFetch;

  console.log('smoke test OK');
})().catch((error) => { console.error(error); process.exit(1); });
