import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('sender-authorized recall with provider receipts and PostgreSQL', async (t) => {
  assert.equal(process.env.PGHOST, '127.0.0.1');
  assert.equal(process.env.PGDATABASE, 'penlia_p0_test');
  assert.equal(process.env.PGUSER, 'penlia_app');
  assert.match(process.env.PGPORT ?? '', /^55\d{3}$/);
  const { pool } = await import('../db.mjs');
  const { createApiServer } = await import('../http.mjs');
  process.env.PENLIA_IM_RECALL_READY = '1';
  const provider = [];
  const server = createApiServer({ recallTransport: async (sender, peer, id) => {
    provider.push({ sender, peer, id });
    return id !== 'transport-failure';
  } }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });
  const base = 'http://127.0.0.1:' + server.address().port + '/v1';
  async function call(who, path, method = 'GET', body, expected = 200) {
    const response = await fetch((path.startsWith('/callbacks/') ? base.slice(0,-3) : base) + path, {
      method, headers: {
        ...(who ? { authorization: 'Bearer ' + who.token } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = response.headers.get('content-type')?.includes('json');
    const data = json ? await response.json() : await response.arrayBuffer();
    assert.equal(response.status, expected, method + ' ' + path + ' ' + (json ? JSON.stringify(data) : ''));
    return data;
  }
  const signup = (suffix) => call(null, '/register', 'POST', {
    username: 'moments_' + suffix, name: suffix, password: 'synthetic-testing-only-69!',
  }, 201);
  const [alice, bob, claire, stranger] = await Promise.all(['alice', 'bob', 'claire', 'stranger'].map(signup));
  for (const friend of [bob, claire]) {
    const invitation = await call(alice, '/friends', 'POST', { userId: friend.user.id, note: '测试好友' });
    await call(friend, '/friends/accept', 'POST', { id: invitation.id });
  }
  const imUser = (account) => 'penlia_' + account.user.id.replaceAll('-', '');
  const publishReceipt = async (id, timestamp, { valid = true, event = 'chat', revoked } = {}) => {
    const callId = process.env.EASEMOB_APP_KEY + '_' + id;
    const signature = createHash('md5').update(callId + process.env.PENLIA_IM_CALLBACK_SECRET + timestamp).digest('hex');
    await call(null, '/callbacks/easemob/after/' + process.env.PENLIA_IM_CALLBACK_PATH_KEY, 'POST', {
      callId, msg_id: id, timestamp, security: valid ? signature : 'a'.repeat(32),
      from: imUser(alice), to: imUser(bob), eventType: 'chat', chat_type: event,
      recall_id: revoked, payload: { ack_message_id: revoked, bodies: [] },
    }, valid ? 200 : 404);
  };
  const recall = (actor, peer, id, status = 200) => call(actor, '/im/recall', 'POST', { peerId: peer.user.id, id, timestamp: Date.now() }, status);

  await t.test('server time and signed provider receipts protect ownership, expiry, retries and both participants', async () => {
    await publishReceipt('unsigned', Date.now(), { valid: false });
    await recall(alice, bob, 'unsigned', 404);
    await publishReceipt('expired', Date.now() - 120_200);
    await recall(alice, bob, 'expired', 409);
    await publishReceipt('current', Date.now() - 1000);
    await recall(bob, alice, 'current', 404);
    await recall(alice, claire, 'current', 404);
    await recall(stranger, bob, 'current', 404);
    const calls = await Promise.all([recall(alice, bob, 'current'), recall(alice, bob, 'current')]);
    assert.deepEqual(calls[0], calls[1]);
    assert.deepEqual(provider, [{ sender: alice.user.id, peer: bob.user.id, id: 'current' }]);
    const { message } = calls[0];
    assert.equal(message.senderId, alice.user.id);
    assert.equal(message.peerId, bob.user.id);
    assert.equal((await call(alice, '/im/recalls')).messages[0].id, 'current');
    assert.equal((await call(bob, '/im/recalls')).messages[0].id, 'current');
    assert.deepEqual((await call(claire, '/im/recalls')).messages, []);
    assert.deepEqual((await call(bob, '/im/recalls?after=' + message.cursor)).messages, []);
    await publishReceipt('transport-failure', Date.now());
    await recall(alice, bob, 'transport-failure', 502);
    assert.deepEqual((await call(alice, '/im/recalls')).messages.map((row) => row.id), ['current']);
    await publishReceipt('sdk-message', Date.now() - 1000);
    await publishReceipt('sdk-recall-event', Date.now(), { event: 'recall', revoked: 'sdk-message' });
    assert.deepEqual((await call(bob, '/im/recalls?after=' + message.cursor)).messages.map((row) => row.id), ['sdk-message']);
  });

  await t.test('group recall removes the message, quoted contents and direct media access for both users', async () => {
    const { id: group } = await call(alice, '/groups', 'POST', { name: '群聊撤回验收', membersCanInvite: true }, 201);
    const path = '/groups/' + group;
    const { id: invitation } = await call(alice, path + '/invites', 'POST', { userId: bob.user.id }, 201);
    await call(bob, '/group-invites/accept', 'POST', { id: invitation });
    const photo = await readFile(new URL('../../assets/demo/coffee.jpg', import.meta.url));
    const { media } = await call(alice, '/moment-media', 'POST', {
      clientId: randomUUID(), mime: 'image/jpeg', base64: photo.toString('base64'),
    }, 201);
    const { id: source } = await call(alice, path + '/messages', 'POST', {
      clientId: randomUUID(), content: '撤回后不可读', mediaIds: [media.id],
    }, 201);
    await call(bob, path + '/messages', 'POST', { clientId: randomUUID(), content: '引用', replyTo: source }, 201);
    await call(bob, '/moment-media/' + media.id);
    await call(bob, path + '/recall', 'POST', { id: source }, 404);
    await call(alice, path + '/recall', 'POST', { id: source });
    await call(alice, path + '/recall', 'POST', { id: source });
    for (const person of [alice, bob]) {
      const { messages } = await call(person, path + '/messages');
      const recalled = messages.find(({ id }) => id === source);
      assert.equal(recalled.recalled, true);
      assert.equal(recalled.content, '');
      assert.deepEqual(recalled.media, []);
      assert.equal(messages[0].quote.body, '消息已撤回');
      await call(person, '/moment-media/' + media.id, 'GET', undefined, 404);
    }
    await call(bob, path + '/messages', 'POST', { clientId: randomUUID(), content: '引用', replyTo: source }, 404);
  });
});
