import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('a profile cover can be saved only by its owner and read only by allowed friends', async (t) => {
  assert.equal(process.env.PGHOST, '127.0.0.1');
  assert.equal(process.env.PGDATABASE, 'penlia_profile_cover_test');
  assert.equal(process.env.PGUSER, 'penlia_app');
  const { pool } = await import('../db.mjs');
  const { createApiServer } = await import('../http.mjs');
  const server = createApiServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  async function call(route, { token, method = 'GET', body } = {}) {
    const response = await fetch('http://127.0.0.1:' + server.address().port + '/v1' + route, {
      method,
      headers: { ...(token && { authorization: 'Bearer ' + token }), 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return { status: response.status, data: await response.json() };
  }

  const [owner, friend, stranger] = await Promise.all(['owner_cover', 'friend_cover', 'stranger_cover'].map(async (username) => {
    const { data, status } = await call('/register', { method: 'POST', body: { username, name: username, password: 'cover_test_password' } });
    assert.equal(status, 201, JSON.stringify(data));
    return data;
  }));
  const ownerPath = '/people/' + owner.user.id + '/profile-cover';
  const ownPath = '/me/profile-cover';
  const photo = (await readFile(new URL('../../assets/play/cinema.jpg', import.meta.url))).toString('base64');

  assert.equal((await call(ownerPath)).status, 401);
  assert.deepEqual((await call(ownPath, { token: owner.token })).data, { photo: null });
  assert.equal((await call(ownPath, { token: owner.token, method: 'PUT', body: { photo: 'AAAA' } })).status, 400);
  assert.equal((await call(ownPath, { token: owner.token, method: 'PUT', body: { photo } })).status, 200);
  assert.equal((await call(ownPath, { token: owner.token })).data.photo, photo);
  assert.equal((await call(ownerPath, { token: friend.token, method: 'PUT', body: { photo: null } })).status, 404);
  assert.deepEqual((await call(ownerPath, { token: stranger.token })).data, { photo: null });
  assert.equal((await call('/people?username=%40owner_cover', { token: friend.token })).data.person.id, owner.user.id);
  assert.equal((await call('/people?username=%EF%BC%A0owner_cover', { token: friend.token })).data.person.id, owner.user.id);

  const invited = await call('/friends', { token: friend.token, method: 'POST', body: { userId: owner.user.id } });
  assert.equal(invited.status, 200);
  assert.deepEqual((await call(ownerPath, { token: friend.token })).data, { photo: null });
  assert.equal((await call('/friends/accept', { token: owner.token, method: 'POST', body: { id: invited.data.id } })).status, 200);
  assert.equal((await call(ownerPath, { token: friend.token })).data.photo, photo);

  async function policy(profilePolicy) {
    const { data } = await call('/privacy', { token: owner.token });
    assert.equal((await call('/privacy', { token: owner.token, method: 'PATCH', body: { profilePolicy, version: data.settings.version } })).status, 200);
  }
  await policy('private');
  assert.deepEqual((await call(ownerPath, { token: friend.token })).data, { photo: null });
  assert.equal((await call(ownPath, { token: owner.token })).data.photo, photo);
  await policy('friends');
  assert.equal((await call(ownerPath, { token: friend.token })).data.photo, photo);
  assert.equal((await call('/friends/restrict', { token: owner.token, method: 'POST', body: { userId: friend.user.id } })).status, 200);
  assert.deepEqual((await call(ownerPath, { token: friend.token })).data, { photo: null });
  assert.equal((await call('/friends/unrestrict', { token: owner.token, method: 'POST', body: { userId: friend.user.id } })).status, 200);
  assert.equal((await call(ownPath, { token: owner.token, method: 'PUT', body: { photo: null } })).status, 200);
  assert.deepEqual((await call(ownerPath, { token: friend.token })).data, { photo: null });
});
