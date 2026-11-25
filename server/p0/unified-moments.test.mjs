import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('unified moments and persistent status on PostgreSQL 17 with the application role', async (t) => {
  assert.equal(process.env.PGHOST, '127.0.0.1');
  assert.equal(process.env.PGDATABASE, 'penlia_moments_test');
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
  const { id } = await post(alice, '来自生活的照片', 'friends', [await upload(alice)]);
  const link = '/moments/' + id;
  await t.test('archived IDs reconcile only against the signed-in author', async () => {
    const { moment } = await call(alice, link);
    const keys = [id, moment.clientId, randomUUID()];
    assert.deepEqual(await call(alice, '/moments/resolve-ids', 'POST', { keys }), {
      identities: [{ id, clientId: moment.clientId }],
    });
    assert.deepEqual(await call(bob, '/moments/resolve-ids', 'POST', { keys }), { identities: [] });
    assert.equal((await call(bob, link)).moment.clientId, null);
  });
  await t.test('likes and comments are persistent, retry-safe and limited to authorized readers', async () => {
    assert.deepEqual(await call(bob, link + '/like', 'PUT', { liked: true }), { liked: true, likeCount: 1 });
    assert.deepEqual(await call(bob, link + '/like', 'PUT', { liked: true }), { liked: true, likeCount: 1 });
    const comment = { clientId: randomUUID(), body: '好看的窗边。' };
    await call(bob, link + '/comments', 'POST', comment, 201);
    await call(bob, link + '/comments', 'POST', comment, 201);
    const { moment } = await call(claire, link);
    assert.equal(moment.likeCount, 1);
    assert.equal(moment.commentCount, 1);
    assert.equal(moment.liked, false);
    assert.equal((await call(claire, link + '/comments')).comments[0].body, comment.body);
    await call(stranger, link + '/comments', 'GET', undefined, 404);
    await call(stranger, link + '/like', 'PUT', { liked: true }, 404);
    await call(stranger, link, 'GET', undefined, 404);
    assert.deepEqual(await call(bob, link + '/like', 'PUT', { liked: false }), { liked: false, likeCount: 0 });
    await call(alice, link, 'PATCH', { revision: 1, scope: 'selected', memberIds: [claire.user.id] });
    await call(bob, link, 'GET', undefined, 404);
    await call(bob, link + '/comments', 'GET', undefined, 404);
    await call(bob, '/moment-media/' + moment.media[0].id, 'GET', undefined, 404);
    assert.equal((await call(claire, link + '/comments')).comments.length, 0);
    await call(claire, '/moment-media/' + moment.media[0].id);
    await call(alice, link, 'DELETE');
    await call(claire, link, 'GET', undefined, 404);
    await call(claire, '/moment-media/' + moment.media[0].id, 'GET', undefined, 404);
  });
  await t.test('more than 20 pins page stably, leave original timestamps intact and do not affect the friends feed', async () => {
    const authors = [];
    for (let index = 0; index < 23; index++) authors.push((await post(alice, '历史 ' + index)).id);
    const unpinned = (await post(alice, '保持最新')).id;
    const tiedAt = '2024-01-05T09:01:13.222Z';
    await pool.query('UPDATE private_moments SET created_at=$2 WHERE id=ANY($1::uuid[])', [authors, tiedAt]);
    for (const item of authors) await call(alice, '/moments/' + item + '/pin', 'PUT', { pinned: true });
    await call(bob, '/moments/' + authors[0] + '/pin', 'PUT', { pinned: false }, 404);
    const timeline = '/moments?order=pinned&author=' + alice.user.id;
    const first = await call(alice, timeline);
    const second = await call(alice, timeline + '&before=' + encodeURIComponent(first.next));
    const result = [...first.moments, ...second.moments];
    const sorted = [...authors].sort().reverse();
    assert.deepEqual(result.map((item) => item.id), [...sorted, unpinned]);
    assert.ok(result.slice(0, 23).every((item) => item.pinned && item.createdAt === tiedAt));
    assert.equal((await call(alice, '/moments/count')).count, 24);
    const bobOwn = await post(bob, '我自己的');
    const friends = await call(bob, '/moments?feed=friends&order=pinned');
    assert.equal(friends.moments[0].id, unpinned);
    assert.ok(friends.moments.every((item) => item.id !== bobOwn.id && item.pinned === null));
    await call(alice, '/moments/' + sorted[0] + '/pin', 'PUT', { pinned: false });
    assert.equal((await call(alice, timeline)).moments[0].id, sorted[1]);
  });
  await t.test('manual lifetime, legacy reads and removal of media access on clearing', async () => {
    const image = await upload(alice);
    await call(alice, '/p2/status', 'POST', {
      caption: '给有权限的好友 ☕', expiresAt: null, mediaIds: [image], scope: 'selected', memberIds: [bob.user.id],
    });
    const path = '/p2/status/' + alice.user.id;
    const status = (await call(bob, path + '?lifetime=1')).status;
    assert.equal(status.expiresAt, null);
    assert.equal(status.caption, '给有权限的好友 ☕');
    assert.equal((await call(bob, path)).status.persistent, true);
    assert.equal((await call(claire, path + '?lifetime=1')).status, null);
    await call(claire, '/moment-media/' + image, 'GET', undefined, 404);
    await call(bob, '/moment-media/' + image);
    await call(alice, '/p2/status', 'POST', {
      caption: '旧客户端', expiresAt: new Date(Date.now() + 3600000).toISOString(), revision: 1,
    }, 409);
    await call(alice, '/p2/status', 'POST', { caption: '仅自己', expiresAt: null, mediaIds: [image], revision: 1 });
    assert.equal((await call(bob, path + '?lifetime=1')).status, null);
    await call(bob, '/moment-media/' + image, 'GET', undefined, 404);
    await call(alice, '/p2/status', 'DELETE');
    await call(alice, '/moment-media/' + image, 'GET', undefined, 404);
  });
  await t.test('the mixed feed uses publish time and preserves owner and friend permissions', async () => {
    const privatePhoto = await upload(claire);
    const ownPrivate = (await post(claire, '私密动态', 'private', [privatePhoto])).id;
    const newest = (await post(bob, '好友的新动态')).id;
    const limited = (await call(claire, '/moments', 'POST', {
      clientId: randomUUID(), body: '部分好友', scope: 'selected', memberIds: [bob.user.id], mediaIds: [],
    }, 201)).id;
    const all = (await post(claire, '全部好友')).id;
    await pool.query('UPDATE private_moments SET created_at=$2 WHERE id=$1', [ownPrivate, '2025-02-12T18:30:00Z']);
    await call(claire, '/moments/' + ownPrivate + '/pin', 'PUT', { pinned: true });
    const first = await call(claire, '/moments');
    assert.deepEqual(first.moments.slice(0, 3).map((entry) => entry.id), [all, limited, newest]);
    assert.equal(first.moments.find((entry) => entry.id === ownPrivate)?.visibility, 'self');
    const bobFeed = (await call(bob, '/moments')).moments;
    const selection = bobFeed.find((entry) => entry.id === limited);
    assert.equal(selection.visibility, 'partial');
    assert.equal(selection.scope, null);
    assert.equal(selection.memberIds, null);
    assert.equal(bobFeed.find((entry) => entry.id === all)?.visibility, 'friends');
    assert.equal(bobFeed.some((entry) => entry.id === ownPrivate), false);
    assert.equal((await call(alice, '/moments')).moments.some((entry) => entry.id === limited), false);
    await call(bob, '/moments/' + ownPrivate, 'GET', undefined, 404);
    await call(bob, '/moment-media/' + privatePhoto, 'GET', undefined, 404);
  });
  await t.test('an attachment edit at the 20-photo limit is ordered, atomic and private', async () => {
    const first = await Promise.all(Array.from({ length: 20 }, () => upload(claire)));
    const { id } = await post(claire, '', 'friends', first);
    const path = '/moments/' + id;
    const replacement = await upload(claire);
    const foreign = await upload(bob);
    const removed = first[3];
    const expected = [first[19], ...first.filter((id) => id !== removed && id !== first[19]), replacement];
    const idsOf = async (who, endpoint = path) => (await call(who, endpoint)).moment.media.map((item) => item.id);
    await call(claire, path, 'PATCH', { revision: 1, scope: 'friends', mediaIds: [first[0], foreign] }, 404);
    await call(claire, path, 'PATCH', { revision: 1, scope: 'friends', mediaIds: [first[0], first[0]] }, 400);
    await call(claire, path, 'PATCH', { revision: 1, scope: 'friends', mediaIds: [] }, 400);
    await call(bob, path, 'PATCH', { revision: 1, scope: 'friends', mediaIds: [] }, 404);
    assert.deepEqual(await idsOf(bob), first);
    await call(claire, path, 'PATCH', { revision: 1, scope: 'selected', memberIds: [bob.user.id], mediaIds: expected });
    assert.deepEqual(await idsOf(claire), expected);
    assert.deepEqual(await idsOf(bob), expected);
    for (const endpoint of ['/moments', '/moments?author=' + claire.user.id + '&order=pinned']) {
      const { moments } = await call(claire, endpoint);
      assert.deepEqual(moments.find((moment) => moment.id === id).media.map((item) => item.id), expected);
    }
    await call(claire, path, 'PATCH', { revision: 1, scope: 'friends', mediaIds: first }, 409);
    await call(bob, '/moment-media/' + removed, 'GET', undefined, 404);
    await call(alice, '/moment-media/' + replacement, 'GET', undefined, 404);
    await call(bob, '/moment-media/' + replacement);
  });
});
