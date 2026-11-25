import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('friend invitations and personal report records use server authorization', async (t) => {
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
      method,
      headers: {
        ...(who ? { authorization: 'Bearer ' + who.token } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = response.headers.get('content-type')?.includes('json');
    const data = json ? await response.json() : Buffer.from(await response.arrayBuffer());
    assert.equal(response.status, expected, method + ' ' + path + ' ' + (json ? JSON.stringify(data) : ''));
    return data;
  }

  const signup = (name) => call(null, '/register', 'POST', {
    username: 'invite_' + name.toLowerCase(), name, password: 'synthetic-test-password-only!',
  }, 201);
  const [alice, bob, stranger] = await Promise.all(['Alice', 'Bob', 'Stranger'].map(signup));
  const photo = (await readFile(new URL('../../assets/demo/person-1.jpg', import.meta.url))).toString('base64');

  await t.test('requests prioritize pending rows and sort each status group by the original application time', async () => {
    const receiver = await signup('Sorter');
    const people = await Promise.all(['Older', 'Newer', 'Accepted', 'Rejected'].map(signup));
    const results = [];
    for (const person of people) results.push(await call(person, '/friends', 'POST', { userId: receiver.user.id }));
    const [older, newer, accepted, rejected] = results;
    await call(receiver, '/friends/accept', 'POST', { id: accepted.id });
    await call(receiver, '/friends/decline', 'POST', { id: rejected.id });
    await pool.query(`UPDATE friendships f SET requested_at=now()-make_interval(days=>v.days)
      FROM unnest($1::uuid[],$2::integer[]) v(id,days) WHERE f.id=v.id`,
      [results.map(({ id }) => id), [7, 5, 1, 2]]);
    const { requests } = await call(receiver, '/friend-requests');
    assert.deepEqual(requests.map(({ id }) => id), [newer.id, older.id, accepted.id, rejected.id]);
    assert.deepEqual(requests.map(({ status }) => status), ['pending', 'pending', 'accepted', 'declined']);
    const { requests: outgoing } = await call(people[0], '/friend-requests');
    assert.equal(outgoing[0].requestedAt, requests[1].requestedAt);
    assert.equal(outgoing[0].outgoing, true);
  });

  await t.test('opaque credentials can be issued, rotated and revoked under the server clock', async () => {
    await call(bob, '/friends/code', 'POST', { days: 1.1 }, 400);
    await call(bob, '/friends/code', 'POST', { days: 31 }, 400);
    await call(bob, '/me', 'PATCH', { name: 'Bob', bio: '原有签名' });
    const first = await call(bob, '/friends/code', 'POST', { days: 30 });
    assert.match(first.code, /^penlia:add:[A-Za-z0-9_-]{32}$/);
    assert.ok(Math.abs(Date.parse(first.expiresAt) - Date.now() - 30 * 86400000) < 30000);
    const found = (await call(alice, '/people/code', 'POST', { code: first.code })).person;
    assert.deepEqual(found, { id: bob.user.id, name: 'Bob', bio: '原有签名', region: '', avatar: null, isFriend: false });
    await call(bob, '/me/public-intro', 'GET', undefined, 404);
    await call(bob, '/me', 'PATCH', { region: '上海', avatar: photo });
    await call(bob, '/privacy', 'PATCH', { profilePolicy: 'private', version: 0 });
    const visible = (await call(alice, '/people/code', 'POST', { code: first.code })).person;
    assert.equal(visible.bio, '原有签名');
    assert.equal(visible.region, '上海');
    assert.equal(visible.avatar, photo);
    assert.equal((await call(stranger, '/friends/code/status', 'POST', { code: first.code })).expiresAt, null);
    const second = await call(bob, '/friends/code', 'POST', { days: 2 });
    assert.notEqual(second.code, first.code);
    assert.equal((await call(alice, '/people/code', 'POST', { code: first.code })).person, null);
    await call(alice, '/friends', 'POST', { code: first.code, userId: bob.user.id }, 404);
    await call(bob, '/friends/code', 'DELETE');
    await call(alice, '/friends', 'POST', { code: second.code }, 404);
    const third = await call(bob, '/friends/code', 'POST', { days: 1 });
    await pool.query("UPDATE friend_codes SET expires_at=now()-interval '1 minute' WHERE user_id=$1", [bob.user.id]);
    await call(alice, '/friends', 'POST', { code: third.code }, 404);
  });

  await t.test('a valid invitation produces a private request and only the recipient can accept it', async () => {
    const { code } = await call(bob, '/friends/code', 'POST', { days: 7 });
    await call(alice, '/me', 'PATCH', { name: 'Alice', bio: '个人简介', region: '杭州', avatar: photo });
    await call(alice, '/privacy', 'PATCH', { profilePolicy: 'private', version: 0 });
    const privateMoment = await call(alice, '/moments', 'POST', { clientId: randomUUID(), scope: 'private', body: '私有内容', mediaIds: [] }, 201);
    const application = await call(alice, '/friends', 'POST', { code, note: '我们在展览见过。' });
    await call(bob, '/friends/code', 'DELETE');
    const incoming = (await call(bob, '/friend-requests')).requests.find((row) => row.id === application.id);
    const outgoing = (await call(alice, '/friend-requests')).requests.find((row) => row.id === application.id);
    assert.equal(incoming.outgoing, false);
    assert.equal(outgoing.outgoing, true);
    assert.equal(incoming.status, 'pending');
    assert.equal(incoming.friendId, null);
    const path = '/friend-requests/' + application.id;
    const profile = await call(bob, path);
    assert.equal(profile.verificationMessage, '我们在展览见过。');
    assert.equal(profile.person.bio, '个人简介');
    assert.equal(profile.person.region, '杭州');
    assert.equal(profile.person.avatar, photo);
    await call(bob, '/moments/' + privateMoment.id, 'GET', undefined, 404);
    await call(alice, '/me', 'PATCH', { name: 'Alice 更新', avatar: null });
    const newest = (await call(bob, path)).person;
    assert.equal(newest.name, 'Alice 更新');
    assert.equal(newest.avatar, null);
    assert.equal(profile.person.username, undefined);
    const pending = (await call(bob, '/friends')).relationships.find(({ id }) => id === application.id);
    assert.equal(pending.username, '');
    await call(alice, path, 'GET', undefined, 404);
    await call(stranger, path, 'GET', undefined, 404);
    await call(bob, '/people/' + alice.user.id, 'GET', undefined, 404);
    await call(alice, '/friends/accept', 'POST', { id: application.id }, 404);
    await call(bob, '/friends/accept', 'POST', { id: application.id });
    assert.equal((await call(bob, path)).status, 'accepted');
    assert.equal((await call(bob, '/people/' + alice.user.id)).user.id, alice.user.id);
    const decline = await call(stranger, '/friends', 'POST', { userId: bob.user.id, note: '测试拒绝' });
    await call(bob, '/friends/decline', 'POST', { id: decline.id });
    for (const who of [bob, stranger]) {
      const item = (await call(who, '/friend-requests')).requests.find(({ id }) => id === decline.id);
      assert.equal(item.status, 'declined');
      assert.equal(item.friendId, null);
    }
  });

  await t.test('handle changes preserve original login, relationships, old posts and QR ownership', async () => {
    const moment = await call(alice, '/moments', 'POST', { clientId: randomUUID(), body: '原稿内容', scope: 'friends', mediaIds: [] }, 201);
    const active = await call(alice, '/friends/code', 'POST', { days: 30 });
    const oldUsername = (await call(alice, '/me')).user.username;
    await call(alice, '/me', 'PATCH', { username: 'invalid-handle' }, 400);
    await call(alice, '/me', 'PATCH', { username: bob.user.username }, 409);
    const edited = await call(alice, '/me', 'PATCH', { username: 'updated_handle', name: '实时昵称' });
    assert.equal(edited.user.id, alice.user.id);
    assert.equal(edited.user.username, 'updated_handle');
    assert.ok(Date.parse(edited.user.nextHandleChangeAt) > Date.now() + 360 * 86400000);
    await call(alice, '/me', 'PATCH', { username: 'another_handle' }, 409);
    const auth = (username) => call(null, '/login', 'POST', { username, password: 'synthetic-test-password-only!' });
    assert.equal((await auth(oldUsername)).user.id, alice.user.id);
    assert.equal((await auth('updated_handle')).user.id, alice.user.id);
    await call(null, '/register', 'POST', { username: 'updated_handle', name: '冲突', password: 'synthetic-test-password-only!' }, 409);
    assert.equal((await call(stranger, '/people/code', 'POST', { code: active.code })).person.id, alice.user.id);
    assert.equal((await call(bob, '/people?username=updated_handle')).person.id, alice.user.id);
    const after = (await call(bob, '/moments/' + moment.id)).moment;
    assert.equal(after.author, '实时昵称');
    assert.equal(after.authorUsername, 'updated_handle');
    assert.equal(after.body, '原稿内容');
    await pool.query("UPDATE users SET handle_updated_at=clock_timestamp()-interval '1 year'-interval '1 second' WHERE id=$1", [alice.user.id]);
    assert.equal((await call(alice, '/me', 'PATCH', { username: 'another_handle' })).user.username, 'another_handle');
  });

  await t.test('only selected report evidence is persisted and hidden records cannot be reopened', async () => {
    const input = {
      clientId: randomUUID(), peerId: bob.user.id, kind: 'boundary', anchorId: 'reply-2',
      messages: [
        { id: 'context-1', content: '我先下线了。', mine: true, sentAt: '2026-11-25T07:24:00Z' },
        { id: 'reply-2', content: '今晚还要提交表格。', mine: false, sentAt: '2026-11-25T07:25:00Z' },
      ],
      explanation: '选中的两条消息提供必要上下文。', photos: [photo],
    };
    const report = await call(alice, '/p1/reports', 'POST', input);
    assert.equal((await call(alice, '/p1/reports', 'POST', input)).id, report.id);
    const other = await call(alice, '/p1/reports', 'POST', { ...input, kind: 'spam', clientId: randomUUID() });
    const history = await call(alice, '/p1/boundary');
    assert.deepEqual(history.reports.map(({ id }) => id), [report.id]);
    const detailPath = '/p1/boundary/' + report.id;
    const detail = await call(alice, detailPath);
    assert.equal(detail.target, 'Bob');
    assert.equal(detail.status, 'pending');
    assert.equal(detail.explanation, input.explanation);
    assert.deepEqual(detail.lines.map(({ id, content, author }) => ({ id, content, author })),
      input.messages.map(({ id, content, mine }) => ({ id, content, author: mine ? '我' : 'Bob' })));
    await call(alice, '/p1/boundary/' + other.id, 'GET', undefined, 404);
    await call(bob, detailPath, 'GET', undefined, 404);
    const asset = '/p1/boundary-media/' + report.id + '/' + detail.photos[0].id;
    assert.equal((await call(alice, asset)).toString('base64'), photo);
    await call(bob, asset, 'GET', undefined, 404);
    assert.deepEqual((await call(bob, '/p1/boundary')).actions, []);
    await call(alice, '/p1/boundary', 'POST', { ids: [report.id] });
    await call(alice, detailPath, 'GET', undefined, 404);
    await call(alice, asset, 'GET', undefined, 404);
    assert.deepEqual((await call(alice, '/p1/boundary')).reports, []);
    const persisted = await pool.query('SELECT id,status FROM p1_reports WHERE id=$1', [report.id]);
    assert.equal(persisted.rows[0].status, 'pending');
  });
});
