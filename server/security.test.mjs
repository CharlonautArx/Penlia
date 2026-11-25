import { randomBytes, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { easemobOrigin, imPrivacyReady, validateServerEnvironment } from './security.mjs';
import { userToken, userTokenTtlSeconds } from './im.mjs';
import publicConfig from '../tooling/public-config.cjs';

const secret = () => randomBytes(32).toString('base64url');

test('environment separation and public build credential allowlist fail closed', () => {
  const production = {
    NODE_ENV: 'production', PENLIA_ENV: 'production', PGUSER: 'penlia_app',
    PGHOST: 'db.internal.example', PGDATABASE: 'penlia_prod', PGPASSWORD: secret(),
  };
  assert.equal(validateServerEnvironment(production), 'production');
  for (const [key, value] of [
    ['PG_TLS', 'disable'], ['PGSSLMODE', 'disable'], ['PGDATABASE', 'penlia_test'],
    ['PGUSER', 'postgres'], ['PGHOST', '127.0.0.1'], ['PENLIA_ENV', undefined],
  ]) assert.throws(() => validateServerEnvironment({ ...production, [key]: value }), /Invalid server configuration/);
  assert.throws(() => validateServerEnvironment({ PGDATABASE: 'penlia_prod' }));
  assert.throws(() => validateServerEnvironment({ ...production, PENLIA_IM_RECALL_READY: '1' }));
  const shared = secret();
  assert.throws(() => validateServerEnvironment({
    ...production, PENLIA_DIAGNOSTIC_TOKEN: shared, PENLIA_MODERATION_JOB_TOKEN: shared,
  }));
  assert.throws(() => easemobOrigin({ EASEMOB_REST_URL: 'https://name:password@im.example.test' }));
  assert.equal(imPrivacyReady({ PENLIA_IM_PRIVACY_READY: '1', PENLIA_IM_CALLBACK_SECRET: secret(),
    PENLIA_IM_CALLBACK_PATH_KEY: secret() }), true);
  const { validatePublicConfig } = publicConfig;
  assert.throws(() => validatePublicConfig({ EXPO_PUBLIC_DATABASE_PASSWORD: secret() }), /Unapproved public build variable/);
  assert.throws(() => validatePublicConfig({ EXPO_PUBLIC_API_URL: 'https://api.example.test?token=fixture' }));
  assert.throws(() => validatePublicConfig({ EAS_BUILD_PROFILE: 'production' }));
  validatePublicConfig({ EAS_BUILD_PROFILE: 'ui-demo', EXPO_PUBLIC_PENLIA_UI_DEMO: '1' });
  validatePublicConfig({ EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_PENLIA_UI_DEMO: '0',
    EXPO_PUBLIC_API_URL: 'https://api.example.test', EXPO_PUBLIC_EASEMOB_APP_KEY: 'example#production' });
});

test('provider user tokens remain scoped to the authenticated ID and given a bounded lifetime', async (t) => {
  const environment = {
    EASEMOB_APP_KEY: 'fixture#isolated', EASEMOB_REST_URL: 'https://im.example.test',
    EASEMOB_CLIENT_ID: randomUUID(), EASEMOB_CLIENT_SECRET: secret(), EASEMOB_TTL_UNIT: 'seconds',
  };
  const previous = Object.fromEntries(Object.keys(environment).map((key) => [key, process.env[key]]));
  Object.assign(process.env, environment);
  const appToken = secret();
  const accountToken = secret();
  const id = randomUUID();
  const requests = [];
  let expiresIn = userTokenTtlSeconds;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push({ url, options, body });
    return Response.json(body.grant_type === 'client_credentials'
      ? { access_token: appToken, expires_in: 7200 }
      : { access_token: accountToken, expires_in: expiresIn });
  });
  try {
    const username = 'penlia_' + id.replaceAll('-', '');
    assert.deepEqual(await userToken(id), { username, token: accountToken, expiresIn: userTokenTtlSeconds });
    assert.equal(requests.length, 2);
    assert.equal(requests[1].url.host, 'im.example.test');
    assert.equal(requests[1].options.redirect, 'error');
    assert.equal(requests[1].options.headers.Authorization, 'Bearer ' + appToken);
    assert.deepEqual(requests[1].body, {
      grant_type: 'inherit', username, autoCreateUser: true, ttl: userTokenTtlSeconds,
    });
    expiresIn = userTokenTtlSeconds + 1;
    await assert.rejects(userToken(id), /Invalid IM User Token response/);
    expiresIn = undefined;
    await assert.rejects(userToken(id), /Invalid IM User Token response/);
    process.env.EASEMOB_TTL_UNIT = 'milliseconds';
    expiresIn = userTokenTtlSeconds * 1000 - 30;
    assert.equal((await userToken(id)).expiresIn, userTokenTtlSeconds);
    assert.equal(requests.at(-1).body.ttl, userTokenTtlSeconds * 1000);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
