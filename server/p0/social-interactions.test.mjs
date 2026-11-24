import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('threaded activity and chat records on PostgreSQL 17 with the application role', async (t) => {
  assert.equal(process.env.PGHOST, '127.0.0.1');
  assert.equal(process.env.PGDATABASE, 'penlia_p0_test');
  assert.equal(process.env.PGUSER, 'penlia_app');
  assert.match(process.env.PGPORT ?? '', /^55\d{3}$/);
  const { pool } = await import('../db.mjs');
  const { createApiServer } = await import('../http.mjs');
  const server = createApiServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });
  const base = 'http://127.0.0.1:' + server.address().port + '/v1';
  async function call(who, path, method = 'GET', body, expected = 200) {
    const response = await fetch(base + path, {
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
  const post = (who, text, scope = 'friends', mediaIds = []) =>
    call(who, '/moments', 'POST', { clientId: randomUUID(), body: text, scope, mediaIds }, 201);
  const upload = async (who) => {
    const photo = await readFile(new URL('../../assets/demo/coffee.jpg', import.meta.url));
    const { media } = await call(who, '/moment-media', 'POST', {
      clientId: randomUUID(), mime: 'image/jpeg', base64: photo.toString('base64'),
    }, 201);
    return media.id;
  };
  await t.test('thread projection, photo ACL, own moderation and owner moderation', async () => {
    const { id } = await post(alice, '测试评论与权限');
    const endpoint = '/moments/' + id + '/comments';
    await call(bob, endpoint, 'POST', { clientId: randomUUID(), body: '根评论' }, 201);
    const { comments: [parent] } = await call(bob, endpoint);
    const mediaId = await upload(claire);
    const payload = { clientId: randomUUID(), body: '', replyTo: parent.id, mediaId };
    await call(claire, endpoint, 'POST', payload, 201);
    await call(claire, endpoint, 'POST', payload, 201);
    const { comments: [reply, original] } = await call(alice, endpoint);
    assert.equal(original.id, parent.id);
    assert.equal(reply.replyTo, parent.id);
    assert.equal(reply.photo.id, mediaId);
    await call(bob, '/moment-media/' + mediaId);
    await call(stranger, '/moment-media/' + mediaId, 'GET', undefined, 404);
    await call(bob, endpoint + '?id=' + reply.id, 'DELETE', undefined, 404);
    await call(bob, endpoint + '?id=' + parent.id, 'DELETE');
    assert.equal((await call(alice, endpoint)).comments[0].replyTo, null);
    await call(alice, endpoint + '?id=' + reply.id, 'DELETE');
    await call(claire, '/moment-media/' + mediaId, 'GET', undefined, 404);
    const { moment } = await call(alice, '/moments/' + id);
    assert.equal(moment.commentCount, 0);
  });

  await t.test('adding preset members does not change historical visibility, including after ordinary edits', async () => {
    const { group } = await call(alice, '/relationship-groups', 'POST',
      { label: '固定范围', circle: false, memberIds: [bob.user.id] }, 201);
    const { id } = await call(alice, '/moments', 'POST', { clientId: randomUUID(), body: '按发布时的范围',
      scope: 'group', groupId: group.id, mediaIds: [] }, 201);
    await call(bob, '/moments/' + id);
    await call(claire, '/moments/' + id, 'GET', undefined, 404);
    await call(alice, '/relationship-groups/' + group.id, 'PUT',
      { label: '固定范围', circle: false, memberIds: [bob.user.id, claire.user.id] });
    await call(alice, '/moments/' + id, 'PATCH', { scope: 'group', groupId: group.id, revision: 1, body: '改正文' });
    await call(claire, '/moments/' + id, 'GET', undefined, 404);
    await call(bob, '/moments/' + id);
  });

  await t.test('record and attached photos require the intended destination; favorites follow the existing list', async () => {
    const content = [{ kind: 'image', time: 123456, author: 'Bob', body: '', mediaIds: [await upload(alice)] }];
    const payload = { clientId: randomUUID(), peerId: bob.user.id, lines: content };
    const { id } = await call(alice, '/chat-records', 'POST', payload, 201);
    assert.equal((await call(alice, '/chat-records', 'POST', payload, 201)).id, id);
    const { lines } = await call(bob, '/chat-records/' + id);
    assert.equal(lines[0].kind, 'image');
    assert.equal(lines[0].time, 123456);
    assert.equal(lines[0].author, 'Bob');
    assert.equal(lines[0].media[0].id, content[0].mediaIds[0]);
    await call(bob, '/moment-media/' + content[0].mediaIds[0]);
    await call(claire, '/moment-media/' + content[0].mediaIds[0], 'GET', undefined, 404);
    await call(claire, '/chat-records/' + id, 'GET', undefined, 404);
    await call(alice, '/chat-favorites', 'POST', { recordId: id, title: '只有本人的副本可收藏' }, 404);
    const { id: mine } = await call(alice, '/chat-records', 'POST', { clientId: randomUUID(),
      lines: [{ kind: 'text', time: 123456, author: 'Alice', body: '私人收藏' }] }, 201);
    const { id: item } = await call(alice, '/chat-favorites', 'POST', { recordId: mine, title: '聊天收藏' }, 201);
    assert.equal((await call(alice, '/p2/items/' + item)).item.chatRecordId, mine);
    await call(bob, '/p2/items/' + item, 'GET', undefined, 404);
    await call(alice, '/chat-records', 'POST', { clientId: randomUUID(), lines: [
      { kind: 'image', time: 123456, author: 'Alice', body: '', mediaIds: content[0].mediaIds },
    ] }, 404);
  });

  await t.test('group records and quotes validate origin, recipient membership and join time', async () => {
    const { id: group } = await call(alice, '/groups', 'POST', { name: '聊天资料', membersCanInvite: false }, 201);
    const groupPath = '/groups/' + group;
    const { id: first } = await call(alice, groupPath + '/messages', 'POST', { clientId: randomUUID(), content: '初始消息' }, 201);
    await call(alice, groupPath + '/messages', 'POST', { clientId: randomUUID(), content: '引用', replyTo: first }, 201);
    assert.equal((await call(alice, groupPath + '/messages')).messages[0].quote.id, first);
    await call(alice, groupPath + '/messages', 'POST', { clientId: randomUUID(), content: '引用', replyTo: randomUUID() }, 404);
    await call(claire, '/chat-records', 'POST', { clientId: randomUUID(), groupId: group,
      lines: [{ kind: 'text', time: 123456, author: 'Claire', body: '未入群' }] }, 404);
    const { id: recordId } = await call(alice, '/chat-records', 'POST', { clientId: randomUUID(), groupId: group,
      lines: [{ kind: 'text', time: 123456, author: 'Alice', body: '群内聊天记录' }] }, 201);
    await call(alice, groupPath + '/messages', 'POST', { clientId: randomUUID(), recordId }, 201);
    assert.equal((await call(alice, groupPath + '/messages')).messages[0].recordId, recordId);
    await call(bob, '/chat-records/' + recordId, 'GET', undefined, 404);
  });
});
