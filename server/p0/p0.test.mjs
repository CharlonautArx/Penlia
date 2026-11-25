import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { isResting, defaults } from './access.mjs';
import { keyedDigest } from '../phone/policy.mjs';

test('weekly quiet hours use the recipient time zone, cross midnight and handle DST', () => {
  const value = { ...defaults, quietHours: { Mon: ['22:30', '08:00'], Sun: ['21:00', '08:00'] } };
  assert.equal(isResting(value, new Date('2026-11-23T14:30:00Z')), true);
  assert.equal(isResting(value, new Date('2026-11-24T00:00:00Z')), false);
  assert.equal(isResting(value, new Date('2026-11-23T23:59:59Z')), true);
  assert.equal(isResting(value, new Date('2026-11-24T15:10:00Z')), false);
  const summer = { ...value, zone: 'America/New_York', quietHours: { Sat: ['23:00', '03:30'] } };
  assert.equal(isResting(summer, new Date('2026-03-08T07:10:00Z')), true);
  assert.equal(isResting(summer, new Date('2026-03-08T07:35:00Z')), false);
  assert.equal(isResting({ ...value, muteIndefinitely: true }, new Date('2026-11-24T15:10:00Z')), true);
});

test('P0 over loopback HTTP and real PostgreSQL with the restricted application role', async (t) => {
  if (
    process.env.PGHOST !== '127.0.0.1' ||
    process.env.PGDATABASE !== 'penlia_p0_test' ||
    process.env.PGUSER !== 'penlia_app' ||
    !process.env.PENLIA_P0_TEST_ADMIN_PASSWORD ||
    !/^55\d{3}$/.test(process.env.PGPORT ?? '')
  ) {
    throw new Error('Run against the isolated loopback penlia_p0_test database');
  }
  const { pool } = await import('../db.mjs');
  const { createApiServer } = await import('../http.mjs');
  const { default: pg } = await import('pg');
  const admin = new pg.Pool({ user: 'postgres', password: process.env.PENLIA_P0_TEST_ADMIN_PASSWORD, ssl: false });
  const http = createApiServer().listen(0, '127.0.0.1');
  await once(http, 'listening');
  t.after(async () => {
    await new Promise((resolve) => http.close(resolve));
    await pool.end();
    await admin.end();
  });
  const base = 'http://127.0.0.1:' + http.address().port;
  const password = 'long_synthetic_password_here';
  async function ask(path, { method = 'GET', body, token, headers = {} } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...headers,
        ...(token ? { authorization: 'Bearer ' + token } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data =
      method === 'HEAD'
        ? undefined
        : response.headers.get('content-type')?.includes('json')
          ? await response.json()
          : Buffer.from(await response.arrayBuffer());
    return { status: response.status, data, headers: response.headers };
  }
  const call = (who, path, method = 'GET', body) => ask('/v1' + path, { method, body, token: who?.token });
  const register = async (username, name) => {
    const value = await call(null, '/register', 'POST', { username, name, password });
    assert.equal(value.status, 201, JSON.stringify(value.data));
    return value.data;
  };
  const a = await register('alice_p0', '青禾');
  const b = await register('bobo_p0', '小满');
  const c = await register('chacha_p0', '书晴');
  const d = await register('dodo_p0', '冬雨');
  let friendId;

  function webhook(from, to, { ext = {}, bodies = [{ type: 'txt', msg: '测试' }], invalid = false,
    timestamp = Date.now(), callId = process.env.EASEMOB_APP_KEY + '_' + randomUUID() } = {}) {
    const security = createHash('md5')
      .update(callId + process.env.PENLIA_IM_CALLBACK_SECRET + timestamp)
      .digest('hex');
    const im = (who) => 'penlia_' + who.user.id.replaceAll('-', '');
    return ask('/callbacks/easemob/' + process.env.PENLIA_IM_CALLBACK_PATH_KEY, {
      method: 'POST',
      body: {
        callId,
        timestamp,
        chat_type: 'chat',
        security: invalid ? 'a'.repeat(32) : security,
        from: im(from),
        to: im(to),
        payload: { bodies, ext },
      },
    });
  }

  async function prefs(who, input) {
    const current = await call(who, '/privacy');
    assert.equal(current.status, 200, JSON.stringify(current.data));
    return call(who, '/privacy', 'PATCH', { version: current.data.settings.version, ...input });
  }
  async function friend(from, to) {
    const result = await call(from, '/friends', 'POST', { userId: to.user.id, note: '线下认识' });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    assert.equal((await call(to, '/friends/accept', 'POST', { id: result.data.id })).status, 200);
    return result.data.id;
  }

  await t.test(
    'friend consent, request note, rejection, QR rotation, invisible social graph, privacy race',
    async () => {
      assert.deepEqual((await call(a, '/people?username=bobo_p0')).data.person, {
        id: b.user.id,
        username: 'bobo_p0',
        name: '小满',
        bio: '',
      });
      const asked = await call(a, '/friends', 'POST', { userId: b.user.id, note: '参加过同一场读书会' });
      assert.equal(asked.status, 200, JSON.stringify(asked.data));
      assert.equal((await call(a, '/friends/accept', 'POST', { id: asked.data.id })).status, 404);
      assert.equal((await call(c, '/friends/accept', 'POST', { id: asked.data.id })).status, 404);
      const list = (await call(b, '/friends')).data.relationships;
      assert.equal(list[0].verificationMessage, '参加过同一场读书会');
      assert.equal((await call(b, '/friends/decline', 'POST', { id: asked.data.id })).status, 200);
      assert.equal((await call(a, '/im/contact', 'POST', { userId: b.user.id })).status, 403);
      assert.deepEqual((await webhook(a, b)).data, { valid: false });
      assert.equal((await call(a, '/friends', 'POST', { userId: b.user.id })).status, 429);
      await admin.query("UPDATE friendships SET updated_at=now()-interval '2 days' WHERE id=$1", [asked.data.id]);
      friendId = await friend(a, b);
      assert.equal((await webhook(a, b)).data.valid, true);
      assert.deepEqual((await webhook(a, b, { invalid: true })).data, { valid: false });
      assert.deepEqual((await webhook(a, b, { bodies: [{ type: 'cmd', action: 'typing' }] })).data, { valid: false });
      const first = (await call(b, '/friends/code', 'POST')).data.code;
      assert.equal((await call(a, '/people/code', 'POST', { code: first })).data.person.id, b.user.id);
      const second = (await call(b, '/friends/code', 'POST')).data.code;
      assert.equal((await call(a, '/people/code', 'POST', { code: first })).data.person, null);
      assert.equal((await call(a, '/people/code', 'POST', { code: second })).data.person.id, b.user.id);
      assert.equal((await prefs(b, { addPolicy: 'none' })).status, 200);
      assert.equal((await call(a, '/people/code', 'POST', { code: second })).data.person, null);
      assert.equal((await call(c, '/friends', 'POST', { userId: b.user.id })).status, 404);
      assert.equal((await call(c, '/people/' + b.user.id)).status, 404);
      assert.equal((await call(c, '/people/' + b.user.id + '/mutual')).status, 404);
      await prefs(b, { addPolicy: 'anyone' });
      const version = (await call(b, '/privacy')).data.settings.version;
      await prefs(b, { profilePolicy: 'private' });
      assert.equal((await call(b, '/privacy', 'PATCH', { version, phoneSearch: true })).status, 409);
      assert.equal((await call(a, '/people/' + b.user.id)).data.user.bio, '');
      await friend(a, c);
    },
  );

  await t.test(
    'phone exact lookup defaults off and never returns the number or an existence signal when disabled',
    async () => {
      const phone = '+8619900000111';
      await admin.query('INSERT INTO phone_identities(phone_key,user_id,verified_at) VALUES($1,$2,now())', [
        keyedDigest(process.env.PENLIA_PHONE_LOOKUP_SECRET, 'phone', phone),
        b.user.id,
      ]);
      const hidden = await call(a, '/people/phone', 'POST', { phone });
      const missing = await call(a, '/people/phone', 'POST', { phone: '+8619900000999' });
      assert.equal(hidden.status, 200, JSON.stringify(hidden.data));
      assert.deepEqual(hidden.data, missing.data);
      assert.deepEqual(hidden.data, { person: null });
      assert.equal((await prefs(b, { phoneSearch: true })).status, 200);
      const shown = await call(a, '/people/phone', 'POST', { phone });
      assert.equal(shown.data.person.id, b.user.id);
      assert.ok(!JSON.stringify(shown.data).includes(phone));
      await prefs(b, { phoneSearch: false });
      assert.deepEqual((await call(a, '/people/phone', 'POST', { phone })).data, { person: null });
      await call(a, '/people/phone', 'POST', { phone });
      assert.equal((await call(a, '/people/phone', 'POST', { phone })).status, 429);
    },
  );

  await t.test('groups require consent, isolate invite codes and roles, and sync real messages', async () => {
    await friend(b, c);
    const group = await call(a, '/groups', 'POST', { name: '周末散步', membersCanInvite: false });
    assert.equal(group.status, 201, JSON.stringify(group.data));
    const path = '/groups/' + group.data.id;
    const invitation = await call(a, path + '/invites', 'POST', { userId: b.user.id });
    assert.equal(invitation.status, 201, JSON.stringify(invitation.data));
    assert.equal((await call(b, path)).status, 404);
    assert.equal(
      (await call(c, '/group-invites/resolve', 'POST', { code: invitation.data.code })).data.invitations.length,
      0,
    );
    const offer = (await call(b, '/group-invites/resolve', 'POST', { code: invitation.data.code })).data.invitations[0];
    assert.equal(offer.name, '周末散步');
    assert.equal(offer.memberCount, 1);
    assert.equal(offer.inviter, '青禾');
    const membersPath = '/group-invites/' + offer.id + '/members';
    const thumbnail = (await readFile(new URL('../../assets/demo/person-2.jpg', import.meta.url))).toString('base64');
    assert.deepEqual((await call(b, membersPath)).data, { members: [{ name: '青禾' }] });
    assert.equal((await call(c, membersPath)).status, 404);
    assert.equal((await call(b, path + '/avatar', 'PUT', { avatar: thumbnail })).status, 404);
    assert.equal((await call(a, path + '/avatar', 'PUT', { avatar: 'AAAA' })).status, 400);
    assert.equal((await call(a, path + '/avatar', 'PUT', { avatar: thumbnail })).status, 200);
    assert.equal((await call(a, path)).data.group.avatar, thumbnail);
    assert.equal((await call(a, '/groups')).data.groups.find(g => g.id === group.data.id).avatar, thumbnail);
    assert.equal((await call(b, '/group-invites')).data.invitations[0].avatar, thumbnail);
    assert.equal((await call(b, '/group-invites/decline', 'POST', { id: offer.id })).status, 200);
    assert.equal((await call(b, membersPath)).status, 404);
    assert.equal((await call(b, path + '/messages')).status, 404);
    assert.equal((await call(b, '/group-invites/accept', 'POST', { id: offer.id })).status, 404);
    const retry = (await call(a, '/groups', 'POST', { name: '周日下午茶' })).data.id;
    const room = '/groups/' + retry;
    const offer2 = (await call(a, room + '/invites', 'POST', { userId: b.user.id })).data;
    const joined = await call(b, '/group-invites/accept', 'POST', { id: offer2.id });
    assert.equal(joined.status, 200, JSON.stringify(joined.data));
    assert.equal((await call(b, room + '/invites', 'POST', { userId: c.user.id })).status, 403);
    assert.equal((await call(c, room)).status, 404);
    const message = { clientId: randomUUID(), content: '散步后一起喝茶', silent: true };
    const send = await call(a, room + '/messages', 'POST', message);
    assert.equal(send.status, 201, JSON.stringify(send.data));
    assert.equal((await call(a, room + '/messages', 'POST', message)).data.id, send.data.id);
    const read = await call(b, room + '/messages');
    assert.equal(read.data.messages.length, 1);
    assert.equal(read.data.messages[0].silent, true);
    assert.equal(read.data.messages[0].content, message.content);
    const photo = await readFile(new URL('../../assets/demo/person-4.jpg', import.meta.url));
    const uploadBody = { clientId: randomUUID(), mime: 'image/jpeg', base64: photo.toString('base64') };
    const firstUpload = await call(a, '/moment-media', 'POST', uploadBody);
    const secondUpload = await call(a, '/moment-media', 'POST', uploadBody);
    assert.equal(firstUpload.status, 201, JSON.stringify(firstUpload.data));
    assert.equal(secondUpload.data.media.id, firstUpload.data.media.id);
    const imageId = firstUpload.data.media.id;
    assert.equal(
      (await call(b, room + '/messages', 'POST', { clientId: randomUUID(), mediaIds: [imageId] })).status,
      404,
    );
    const groupPhoto = await call(a, room + '/messages', 'POST', { clientId: randomUUID(), mediaIds: [imageId] });
    assert.equal(groupPhoto.status, 201, JSON.stringify(groupPhoto.data));
    assert.equal((await call(b, room + '/messages')).data.messages[0].media[0].id, imageId);
    assert.deepEqual((await call(b, '/moment-media/' + imageId)).data, photo);
    assert.equal((await call(c, '/moment-media/' + imageId)).status, 404);
    assert.equal((await call(b, room + '/leave', 'POST')).status, 200);
    assert.equal((await call(b, '/moment-media/' + imageId)).status, 404);
    assert.equal((await call(b, room + '/messages')).status, 404);
  });

  await t.test('silent metadata, receiver quiet time, important contacts and immediate blocking', async () => {
    assert.equal((await prefs(b, { temporary: 'until', showResting: true, statusPolicy: 'friends' })).status, 200);
    assert.equal((await call(a, '/people/' + b.user.id)).data.user.resting, true);
    const response = await webhook(a, b);
    assert.equal(response.data.payload.ext.em_ignore_notification, true);
    assert.equal((await call(b, '/privacy/priority', 'PUT', { ids: [a.user.id] })).status, 200);
    assert.deepEqual((await webhook(a, b)).data, { valid: true });
    const silent = await webhook(a, b, { ext: { penlia_quiet: true } });
    assert.equal(silent.data.payload.ext.em_ignore_notification, true);
    assert.equal((await webhook(a, b, { ext: { em_force_notification: true } })).data.valid, false);
    assert.equal((await call(b, '/friends/block', 'POST', { userId: a.user.id })).status, 200);
    assert.equal((await webhook(a, b)).data.valid, false);
    assert.equal((await call(a, '/im/contact', 'POST', { userId: b.user.id })).status, 403);
    assert.equal((await call(a, '/friends', 'POST', { userId: b.user.id })).status, 404);
    assert.equal((await call(b, '/privacy/blocks')).data.blocks[0].id, a.user.id);
    assert.equal((await call(b, '/friends/unblock', 'POST', { userId: a.user.id })).status, 200);
    assert.equal((await webhook(a, b)).data.valid, false);
    await admin.query("UPDATE friendships SET updated_at=now()-interval '2 days' WHERE id=$1", [friendId]);
    await friend(a, b);
  });

  await t.test('signed callback retries retain authorization and cannot change the original payload', async () => {
    const callId = process.env.EASEMOB_APP_KEY + '_' + randomUUID();
    const same = { callId, timestamp: Date.now() };
    assert.equal((await webhook(a, b, same)).data.valid, true);
    assert.equal((await webhook(a, b, same)).data.valid, true);
    assert.equal((await webhook(a, b, { ...same, ext: { penlia_quiet: true } })).data.valid, false);
    assert.equal((await webhook(a, b, { timestamp: Date.now() - 360_000 })).data.valid, false);
    assert.equal((await ask('/v1/im/token', { method: 'POST' })).status, 401);
  });

  await t.test('private posts, photo-only, video range, revision and revocation', async () => {
    const picture = await readFile(new URL('../../assets/demo/person-4.jpg', import.meta.url));
    const upload = async (data, mime) => {
      const result = await call(a, '/moment-media', 'POST', {
        clientId: randomUUID(),
        base64: data.toString('base64'),
        mime,
      });
      assert.equal(result.status, 201, JSON.stringify(result.data));
      return result.data.media.id;
    };
    const image1 = await upload(picture, 'image/jpeg');
    const image2 = await upload(picture, 'image/jpeg');
    const make = async (options) => {
      const result = await call(a, '/moments', 'POST', {
        clientId: randomUUID(),
        body: '',
        scope: 'private',
        mediaIds: [],
        ...options,
      });
      assert.equal(result.status, 201, JSON.stringify(result.data));
      return result.data.id;
    };
    const textId = await make({ body: '只有我看' });
    assert.equal((await call(b, '/moments/' + textId)).status, 404);
    assert.equal((await call(a, '/moments/' + textId)).data.moment.body, '只有我看');
    assert.equal((await call(c, '/moment-media/' + image1)).status, 404);
    const photoId = await make({ scope: 'selected', memberIds: [b.user.id], mediaIds: [image1, image2] });
    assert.equal((await call(b, '/moments/' + photoId)).data.moment.media.length, 2);
    assert.equal((await call(b, '/moments/' + photoId)).data.moment.memberIds, null);
    assert.equal((await call(c, '/moment-media/' + image1)).status, 404);
    const image = await call(b, '/moment-media/' + image1);
    assert.equal(image.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(image.data, picture);
    assert.equal((await call(c, '/moments/' + photoId, 'PATCH', { scope: 'friends', revision: 1 })).status, 404);
    assert.equal((await call(a, '/moments/' + photoId, 'PATCH', { scope: 'private', revision: 1 })).status, 200);
    assert.equal((await call(b, '/moment-media/' + image1)).status, 404);
    assert.equal((await call(a, '/moments/' + photoId, 'PATCH', { scope: 'friends', revision: 1 })).status, 409);
    const circle = (await call(a, '/relationship-groups', 'POST', { circle: true, memberIds: [c.user.id] })).data.group;
    assert.equal(circle.label, '亲密圈');
    const closeId = await make({ body: '亲密圈专属', scope: 'circle' });
    assert.equal((await call(c, '/moments/' + closeId)).status, 200);
    assert.equal((await call(b, '/moments/' + closeId)).status, 404);
    const group = (await call(a, '/relationship-groups', 'POST', { label: '家人', memberIds: [b.user.id] })).data.group;
    const onlyGroup = await make({ body: '限家人', scope: 'group', groupId: group.id });
    assert.equal((await call(b, '/moments/' + onlyGroup)).status, 200);
    await call(a, '/relationship-groups/' + group.id, 'DELETE');
    assert.equal((await call(b, '/moments/' + onlyGroup)).status, 404);
    const video = await readFile(process.env.PENLIA_P0_VIDEO_FIXTURE);
    const long = Buffer.from(video);
    const movieStart = long.indexOf('mvhd') + 4;
    assert.equal(long[movieStart], 0);
    long.writeUInt32BE(long.readUInt32BE(movieStart + 12) * 31, movieStart + 16);
    const oversizedDuration = await call(a, '/moment-media', 'POST', {
      clientId: randomUUID(),
      mime: 'video/mp4',
      base64: long.toString('base64'),
    });
    assert.equal(oversizedDuration.status, 400);
    const handle = await upload(video, 'video/mp4');
    const videoId = await make({ scope: 'friends', mediaIds: [handle] });
    assert.equal((await call(a, '/friends/restrict', 'POST', { userId: b.user.id })).status, 200);
    assert.equal((await call(b, '/moment-media/' + handle)).status, 404);
    assert.equal((await webhook(a, b)).data.valid, true);
    assert.equal((await call(a, '/privacy/restricted')).data.restrictions[0].id, b.user.id);
    assert.equal((await call(a, '/friends/unrestrict', 'POST', { userId: b.user.id })).status, 200);
    const range = await ask('/v1/moment-media/' + handle, { token: b.token, headers: { range: 'bytes=0-15' } });
    assert.equal(range.status, 206);
    assert.deepEqual(range.data, video.subarray(0, 16));
    assert.equal((await call(d, '/moment-media/' + handle)).status, 404);
    assert.equal((await call(a, '/moments/' + videoId, 'DELETE')).status, 200);
    assert.equal((await call(b, '/moment-media/' + handle)).status, 404);
    assert.equal((await call(null, '/moment-media/' + image1)).status, 401);
  });

  await t.test('other devices can be revoked and account requests survive refresh', async () => {
    const second = (await call(null, '/login', 'POST', { username: 'alice_p0', password })).data;
    assert.ok(second.token);
    const device = (await call(a, '/privacy/devices')).data.devices.find((item) => !item.current);
    assert.equal((await call(c, '/privacy/devices/revoke', 'POST', { deviceId: device.id })).status, 404);
    assert.equal((await call(a, '/privacy/devices/revoke', 'POST', { deviceId: device.id })).status, 200);
    assert.equal((await call(second, '/me')).status, 401);
    assert.equal((await call(a, '/privacy/requests', 'POST', { kind: 'export' })).status, 202);
    assert.equal((await call(a, '/privacy/requests', 'POST', { kind: 'export' })).status, 202);
    assert.equal((await call(a, '/privacy/requests')).data.requests.length, 1);
    assert.equal((await call(c, '/privacy/requests')).data.requests.length, 0);
    const exported = await call(a, '/privacy/export');
    assert.equal(exported.status, 200, JSON.stringify(exported.data));
    assert.equal(exported.data.profile.id, a.user.id);
    assert.ok(exported.data.moments.every((entry) => entry.authorId === a.user.id));
    assert.ok(!JSON.stringify(exported.data).includes(a.token));
    assert.equal((await call(a, '/logout', 'POST')).status, 200);
    assert.equal((await call(a, '/moments')).status, 401);
  });
});
