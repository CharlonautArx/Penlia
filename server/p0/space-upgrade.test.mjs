import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('moment media, space privacy and report history on PostgreSQL with the application role', async (t) => {
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
  const image = (await readFile(new URL('../../assets/demo/coffee.jpg', import.meta.url))).toString('base64');
  const thumbnail = (await readFile(new URL('../../assets/demo/pottery.jpg', import.meta.url))).toString('base64');
  const upload = async (who) => (await call(who, '/moment-media', 'POST', {
    clientId: randomUUID(), mime: 'image/jpeg', base64: image, thumbnail,
  }, 201)).media.id;
  const publish = (body, mediaIds = [], scope = 'friends', clientId = randomUUID()) =>
    call(alice, '/moments', 'POST', { clientId, body, scope, mediaIds, location: '上海 · 静安' }, 201);

  let oldPost;
  let afterCutoff;
  let oldPhoto;
  await t.test('20 photos are published once and retain order and independent thumbnails', async () => {
    const mediaIds = [];
    for (let index = 0; index < 21; index++) mediaIds.push(await upload(alice));
    await call(alice, '/moments', 'POST', {
      clientId: randomUUID(), body: '超出上限', scope: 'friends', mediaIds,
    }, 400);
    const order = mediaIds.slice(0, 20).reverse();
    const clientId = randomUUID();
    oldPost = await publish('二十张照片', order, 'friends', clientId);
    oldPhoto = order[0];
    assert.equal((await publish('二十张照片', order, 'friends', clientId)).id, oldPost.id);
    const { moment } = await call(bob, '/moments/' + oldPost.id);
    assert.deepEqual(moment.media.map((media) => media.id), order);
    assert.ok(moment.media.every((media) => media.thumbnail));
    assert.equal(moment.location, '上海 · 静安');
    const path = '/moment-media/' + oldPhoto;
    assert.equal(Buffer.from(await call(bob, path)).toString('base64'), image);
    assert.equal(Buffer.from(await call(bob, path + '?size=thumb')).toString('base64'), thumbnail);
    await call(stranger, path + '?size=thumb', 'GET', undefined, 404);
  });

  await t.test('a 20 MB video can be mixed with pictures and reordered while oversized and duplicate videos are rejected', async () => {
    const clip = await readFile(process.env.PENLIA_P0_VIDEO_FIXTURE);
    const limit = 20 * 1024 * 1024;
    const padded = (size) => {
      const freeBox = Buffer.alloc(size - clip.length);
      freeBox.writeUInt32BE(freeBox.length);
      freeBox.write('free', 4);
      return Buffer.concat([clip, freeBox]);
    };
    const video = (data, expected) => call(alice, '/moment-media', 'POST', {
      clientId: randomUUID(), mime: 'video/mp4', base64: data.toString('base64'),
    }, expected);
    await video(padded(limit + 1), 413);
    const first = await upload(alice), last = await upload(alice);
    const { media: clipMedia } = await video(padded(limit), 201);
    const { media: secondClip } = await video(clip, 201);
    await call(alice, '/moments', 'POST', { scope: 'friends', clientId: randomUUID(), body: '双视频',
      mediaIds: [clipMedia.id, secondClip.id] }, 400);
    const mixed = await publish('混合附件', [first, clipMedia.id, last], 'private');
    const { moment } = await call(alice, '/moments/' + mixed.id);
    assert.deepEqual(moment.media.map(({ id }) => id), [first, clipMedia.id, last]);
    assert.equal(moment.media[1].mime, 'video/mp4');
    const order = [last, first, clipMedia.id];
    await call(alice, '/moments/' + mixed.id, 'PATCH', { scope: 'private', revision: moment.revision, mediaIds: order });
    const updated = (await call(alice, '/moments/' + mixed.id)).moment;
    assert.deepEqual(updated.media.map(({ id }) => id), order);
    assert.equal((await call(alice, '/moment-media/' + clipMedia.id)).byteLength, limit);
    await call(bob, '/moment-media/' + clipMedia.id, 'GET', undefined, 404);
  });

  await t.test('local midnight applies to feed, timeline, detail, comments, media and existing chat shares', async () => {
    afterCutoff = await publish('当天开始');
    const privatePost = await publish('仅自己', [], 'private');
    await call(alice, '/moments/' + oldPost.id + '/forward-permission', 'PUT', { allowed: true });
    const ticket = await call(alice, '/moments/' + oldPost.id + '/share-chat', 'POST', { receiver: bob.user.id });
    const chatPath = '/moment-chat-shares/' + ticket.id;
    await call(bob, chatPath);
    const setTime = (post, time) => pool.query('UPDATE private_moments SET created_at=$2 WHERE id=$1', [post.id, time]);
    await setTime(oldPost, '2026-11-23T15:59:59.999Z');
    await setTime(afterCutoff, '2026-11-23T16:00:00.000Z');
    await setTime(privatePost, '2026-11-23T16:00:00.000Z');
    const setting = '/moment-space-preferences';
    const preference = { mode: 'friends', history: 'custom', date: '2026-11-24', zone: 'Asia/Shanghai' };
    await call(alice, setting, 'PUT', { ...preference, date: '2026-02-30' }, 400);
    await call(alice, setting, 'PUT', preference);
    assert.equal((await call(alice, setting)).privacy.date, preference.date);
    assert.equal((await call(bob, setting)).configured, false);
    for (const query of ['?feed=friends', '?author=' + alice.user.id]) {
      const { moments } = await call(bob, '/moments' + query);
      assert.deepEqual(moments.map(({ id }) => id), [afterCutoff.id]);
    }
    for (const path of ['/moments/' + oldPost.id, '/moments/' + oldPost.id + '/comments',
      '/moment-media/' + oldPhoto, '/moment-media/' + oldPhoto + '?size=thumb', chatPath,
      '/moments/' + privatePost.id]) {
      await call(bob, path, 'GET', undefined, 404);
    }
    await call(bob, '/moments/' + afterCutoff.id);
    await call(alice, '/moments/' + oldPost.id);
    await call(alice, '/moment-media/' + oldPhoto);
    await call(alice, setting, 'PUT', { ...preference, mode: 'self' });
    await call(bob, '/moments/' + afterCutoff.id, 'GET', undefined, 404);
  });

  await t.test('deleting personal report history is scoped and leaves evidence and review untouched', async () => {
    const report = (target) => call(alice, '/p1/reports', 'POST', {
      clientId: randomUUID(), kind: 'boundary', peerId: target.user.id, anchorId: 'peer-1',
      messages: [{ id: 'peer-1', content: '请今晚交付', mine: false }],
    });
    const submitted = [];
    for (const friend of [bob, bob, claire, claire]) submitted.push((await report(friend)).id);
    const path = '/p1/boundary';
    const history = async (user) => (await call(user, path)).reports.map(({ id }) => id);
    await call(bob, path, 'POST', { ids: [submitted[0]] });
    assert.equal((await history(alice)).length, 4);
    assert.deepEqual(await history(bob), []);
    await call(alice, path, 'POST', { ids: [submitted[0]] });
    assert.ok(!(await history(alice)).includes(submitted[0]));
    await call(alice, path, 'POST', { ids: submitted.slice(1, 3) });
    assert.deepEqual(await history(alice), submitted.slice(3));
    await call(alice, path, 'POST', { all: true });
    await call(alice, path, 'POST', { all: true });
    assert.deepEqual(await history(alice), []);
    const { rows } = await pool.query('SELECT provenance,status,evidence FROM p1_reports WHERE id=ANY($1)', [submitted]);
    assert.equal(rows.length, 4);
    assert.ok(rows.every((row) => row.provenance === 'private_pending' && row.status === 'pending'
      && row.evidence.length > 0 && !row.evidence.includes(Buffer.from('请今晚交付'))));
    assert.deepEqual((await call(bob, path)).actions, []);
  });
});
