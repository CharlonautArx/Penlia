import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHmac, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import pg from 'pg';

import { createPhoneAuth } from './services.mjs';

const database = 'penlia_phone_test';
if (process.env.PGHOST !== '127.0.0.1' || process.env.PGDATABASE !== database
  || process.env.PGUSER !== 'penlia_app' || !process.env.PENLIA_PHONE_TEST_ADMIN_PASSWORD) {
  throw new Error('Use the isolated loopback penlia_phone_test database and its temporary credentials.');
}
const { pool } = await import('../db.mjs');
const { createApiServer } = await import('../http.mjs');
const admin = new pg.Pool({ host: '127.0.0.1', database, user: 'postgres', ssl: false,
  password: process.env.PENLIA_PHONE_TEST_ADMIN_PASSWORD });
const migration = await readFile(new URL('./migrations/002_phone_auth.sql', import.meta.url), 'utf8');
const grants = await readFile(new URL('./migrations/runtime-grants.sql', import.meta.url), 'utf8');

const safeSecrets = randomBytes(32);
const diagnostic = randomBytes(32).toString('base64url');
process.env.PENLIA_DIAGNOSTIC_TOKEN = diagnostic;
const proofSecret = randomBytes(32);
const access = '/v1/phone/';
const bind = access + 'bind/';
const baseClock = Date.now();
const hour = 3_600_000;
const minute = 60_000;
const phoneOf = (number) => '+86199000' + String(number).padStart(5, '0');
const deviceOf = (number) => 'test_device_nonce_' + String(number).padStart(8, '0');
const input = (number) => ({ phone: phoneOf(number), deviceId: deviceOf(number) });
const sign = (payload) => createHmac('sha256', proofSecret).update(payload).digest('base64url');
function proof(challengeId, id = randomBytes(8).toString('hex')) {
  const payload = Buffer.from(JSON.stringify({ challengeId, id, variant: randomBytes(4).toString('hex') })).toString('base64url');
  return payload + '.' + sign(payload);
}

async function listen(phoneAuth) {
  const web = createApiServer({ phoneAuth }).listen(0, '127.0.0.1');
  await once(web, 'listening');
  const base = 'http://127.0.0.1:' + web.address().port;
  return {
    close: () => new Promise((done) => web.close(done)),
    async request(path, body, token, headers = {}) {
      const response = await fetch(base + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    },
  };
}

async function reset() {
  await admin.query(`TRUNCATE phone_sms_attempts, phone_captcha_checks, phone_challenges,
    phone_onboarding, phone_risk_windows, phone_budget_alerts, phone_identities`);
  await admin.query(`UPDATE phone_auth_control SET enabled = true, daily_count = 60, daily_micros = 3000000,
    unit_floor_micros = 50000, captcha_checks = 100, challenge_count = 150, monthly_warning_micros = 30000000`);
}

async function setup(limits, outcomes) {
  await reset();
  let now = baseClock;
  const sent = [];
  const checks = [];
  const captcha = { async verify({ proof: value, challengeId }) {
    checks.push(value);
    const [payload, signature] = value.split('.');
    if (!payload || signature !== sign(payload)) return { passed: false };
    const candidate = JSON.parse(Buffer.from(payload, 'base64url'));
    return { passed: candidate.challengeId === challengeId, challengeId: candidate.challengeId, proofId: candidate.id };
  }};
  const sms = { async send(event) {
    sent.push(event);
    if (outcomes) return outcomes(event);
    return { status: 'accepted', reference: 'mock-message-' + event.attemptId };
  }};
  const service = createPhoneAuth({ pool, secret: safeSecrets, captcha, sms, limits, clock: () => now });
  const web = await listen(service);
  async function challenge(data, route = access, token, headers) {
    const result = await web.request(route + 'challenge', data, token, headers);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return result.body.challengeId;
  }
  async function sendCode(data, route = access, token) {
    const challengeId = await challenge(data, route, token);
    const result = await web.request(route + 'send', { ...data, challengeId, proof: proof(challengeId) }, token);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return { ...data, requestId: result.body.requestId, code: sent.at(-1).code };
  }
  return { ...web, sent, checks, challenge, sendCode, service, advance: (milliseconds) => { now += milliseconds; } };
}

test('phone routes against isolated PostgreSQL and real HTTP parsing', async (t) => {
  try {
    const disabled = await listen();
    const oldPassword = 'Local-old-password-for-check';
    const fresh = await disabled.request('/v1/register', { username: 'legacy_user', name: '原账号', password: oldPassword });
    const friend = await disabled.request('/v1/register', { username: 'legacy_peer', name: '原好友', password: oldPassword });
    assert.equal(fresh.status, 201);
    assert.equal(friend.status, 201);
    const old = fresh.body;
    const peer = friend.body;
    const request = await disabled.request('/v1/friends', { userId: peer.user.id }, old.token);
    assert.equal((await disabled.request('/v1/friends/accept', { id: request.body.id }, peer.token)).status, 200);
    assert.equal((await disabled.request(access + 'send', { ...input(1), captchaPassed: true })).status, 503);
    await disabled.close();
    await admin.query(migration);
    await admin.query(migration);
    await admin.query(grants);
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM users')).rows[0].n, 2);
    assert.equal((await admin.query('SELECT enabled FROM phone_auth_control')).rows[0].enabled, false);
    await assert.rejects(pool.query('UPDATE phone_auth_control SET enabled = true'), { code: '42501' });

    await t.test('captcha failure, browser bypass, replay, expiry and context mismatch cannot send', async () => {
      const app = await setup();
      try {
        const one = input(1);
        assert.equal((await app.request(access + 'send', { ...one, captchaPassed: true })).status, 403);
        assert.equal((await app.request(access + 'challenge', { ...one, phone: '+1234' })).status, 400);
        const failedChallenge = await app.challenge(one);
        assert.equal((await app.request(access + 'send', { ...one, challengeId: failedChallenge, proof: 'front-end-true' })).status, 403);
        assert.equal((await app.request(access + 'send', { ...one, challengeId: failedChallenge, proof: proof(failedChallenge) })).status, 403);
        const bound = await app.challenge(one);
        assert.equal((await app.request(access + 'send', { ...input(2), challengeId: bound, proof: proof(bound) })).status, 403);
        assert.equal((await app.request(access + 'send', { ...one, deviceId: deviceOf(3), challengeId: bound, proof: proof(bound) })).status, 403);
        app.advance(121_000);
        assert.equal((await app.request(access + 'send', { ...one, challengeId: bound, proof: proof(bound) })).status, 403);
        assert.equal(app.sent.length, 0);
        const next = await app.challenge(one);
        const firstProof = proof(next, 'stable-ticket');
        const candidate = { ...one, challengeId: next, proof: firstProof };
        const duplicates = await Promise.all(Array.from({ length: 6 }, () => app.request(access + 'send', candidate)));
        assert.equal(duplicates.filter(({ status }) => status === 200).length, 1);
        assert.equal(app.sent.length, 1);
        const other = input(3);
        const another = await app.challenge(other);
        assert.equal((await app.request(access + 'send', { ...other, challengeId: another, proof: firstProof })).status, 403);
        const differentlyEncoded = await app.challenge(other);
        assert.equal((await app.request(access + 'send', { ...other, challengeId: differentlyEncoded,
          proof: proof(differentlyEncoded, 'stable-ticket') })).status, 403);
        assert.equal(app.sent.length, 1);
      } finally { await app.close(); }
    });

    for (const [name, limits] of [
      ['daily count', { dailyCount: 2, dailyMicros: 1_000_000, monthlyWarningMicros: 80_000 }],
      ['daily micro-yuan budget', { dailyCount: 10, dailyMicros: 100_000, monthlyWarningMicros: 80_000 }],
    ]) await t.test(name + ' holds across concurrent requests and failed submissions reserve cost', async () => {
      const app = await setup(limits, () => ({ status: 'unknown' }));
      try {
        const requests = await Promise.all([10, 11, 12, 13, 14, 15].map(async (number) => {
          const data = input(number);
          const challengeId = await app.challenge(data);
          return { ...data, challengeId, proof: proof(challengeId) };
        }));
        const results = await Promise.all(requests.map((data) => app.request(access + 'send', data)));
        assert.equal(app.sent.length, 2);
        assert.equal(results.filter(({ status }) => status === 429).length, 4);
        const { rows: [accounting] } = await admin.query(`SELECT count(*)::int AS n, sum(reserved_micros)::int AS cost,
          count(*) FILTER (WHERE send_status = 'unknown' AND code_mac IS NULL)::int AS uncertain FROM phone_sms_attempts`);
        assert.deepEqual(accounting, { n: 2, cost: 100000, uncertain: 2 });
        assert.equal((await admin.query('SELECT count(*)::int AS n FROM phone_budget_alerts')).rows[0].n, 1);
        await admin.query('UPDATE phone_auth_control SET enabled = false');
        assert.equal((await app.request(access + 'challenge', input(16))).status, 503);
        assert.equal((await app.request('/ops/phone-usage')).status, 404);
        const ops = await app.request('/ops/phone-usage', undefined, diagnostic);
        assert.equal(ops.status, 200);
        assert.equal(ops.body.enabled, false);
        assert.equal(ops.body.uncertain_today, 2);
        assert.equal(ops.body.counted_micros_today, '100000');
        assert.equal(ops.body.monthly_warning, true);
        assert.equal(app.sent.length, 2);
      } finally { await app.close(); }
    });

    await t.test('database caps take precedence and bound chargeable captcha server calls', async () => {
      const app = await setup({ dailyCount: 300, dailyMicros: 40_000_000, captchaDailyChecks: 500, unitMicros: 1 });
      try {
        await admin.query('UPDATE phone_auth_control SET daily_count = 1, captcha_checks = 2, unit_floor_micros = 70000');
        const a = input(18), b = input(19), c = input(17);
        const [first, second, third] = await Promise.all([a, b, c].map((data) => app.challenge(data)));
        const post = (data, id) => app.request(access + 'send', { ...data, challengeId: id, proof: proof(id) });
        assert.equal((await post(a, first)).status, 200);
        assert.equal((await post(b, second)).status, 429);
        assert.equal((await post(c, third)).status, 429);
        assert.equal(app.sent.length, 1);
        assert.equal(app.checks.length, 2);
        assert.equal((await admin.query('SELECT reserved_micros::int AS cost FROM phone_sms_attempts')).rows[0].cost, 70000);
      } finally { await app.close(); }
    });

    await t.test('phone, device and IP limits are server-side, and the trusted transport ignores spoofed headers', async () => {
      const app = await setup({ ipHour: 3, deviceDistinct: 1 });
      try {
        const one = input(20);
        await app.sendCode(one);
        assert.equal((await app.request(access + 'challenge', one)).status, 429);
        assert.equal((await app.request(access + 'challenge', { ...input(21), deviceId: one.deviceId })).status, 429);
        app.advance(91_000);
        await app.sendCode(one);
        await app.sendCode(input(21));
        assert.equal((await app.request(access + 'challenge', input(22), undefined,
          { 'X-Forwarded-For': '198.51.100.80' })).status, 429);
        assert.equal(app.sent.length, 3);
      } finally { await app.close(); }
    });

    await t.test('codes expire, reject five bad guesses, are single-use, and resend nullifies the previous code', async () => {
      const app = await setup();
      try {
        const one = await app.sendCode(input(30));
        const wrong = one.code === '000000' ? '111111' : '000000';
        for (let index = 0; index < 5; index++) assert.equal((await app.request(access + 'verify', { ...one, code: wrong })).status, 400);
        assert.equal((await app.request(access + 'verify', one)).status, 400);
        const expired = await app.sendCode(input(31));
        app.advance(301_000);
        assert.equal((await app.request(access + 'verify', expired)).status, 400);
        const two = await app.sendCode(input(32));
        app.advance(91_000);
        const latest = await app.sendCode(input(32));
        assert.equal((await app.request(access + 'verify', two)).status, 400);
        const results = await Promise.all([app.request(access + 'verify', latest), app.request(access + 'verify', latest)]);
        assert.deepEqual(results.map(({ status }) => status).sort(), [200, 400]);
        assert.equal(Object.keys(results.find(({ status }) => status === 200).body)[0], 'onboardingToken');
        const receipt = { attemptId: latest.requestId, reference: 'mock-message-' + latest.requestId, delivery: 'delivered', billedMicros: 45_000 };
        assert.equal(await app.service.recordReceipt({ ...receipt, reference: 'invalid' }), false);
        assert.equal(await app.service.recordReceipt(receipt), true);
        const { rows: [ledger] } = await admin.query(`SELECT send_status, delivery_status, billed_micros::int AS billed,
          verified_at IS NOT NULL AS verified, code_mac IS NULL AS otp_cleared FROM phone_sms_attempts WHERE id = $1`, [latest.requestId]);
        assert.deepEqual(ledger, { send_status: 'accepted', delivery_status: 'delivered', billed: 45000, verified: true, otp_cleared: true });
      } finally { await app.close(); }
    });

    await t.test('existing account binding keeps UID and friendship, and signup cannot create a duplicate phone account', async () => {
      const app = await setup();
      try {
        const oldPhone = input(40);
        assert.equal((await app.request(bind + 'challenge', oldPhone)).status, 401);
        assert.equal((await app.request(bind + 'challenge', { ...oldPhone, password: 'Incorrect-old-password' }, old.token)).status, 401);
        const binding = await app.sendCode({ ...oldPhone, password: oldPassword }, bind, old.token);
        assert.equal((await app.request(access + 'verify', binding)).status, 400);
        assert.equal((await app.request(bind + 'verify', binding, peer.token)).status, 400);
        assert.equal((await app.request(bind + 'verify', binding, old.token)).body.bound, true);
        app.advance(91_000);
        const loginCode = await app.sendCode(oldPhone);
        const log = await app.request(access + 'verify', loginCode);
        assert.equal(log.status, 200);
        assert.equal(log.body.user.id, old.user.id);
        const friends = await app.request('/v1/friends', undefined, log.body.token);
        assert.equal(friends.body.relationships[0].userId, peer.user.id);
        assert.equal(friends.body.relationships[0].status, 'accepted');
        assert.equal((await app.request('/v1/login', { username: old.user.username, password: oldPassword })).body.user.id, old.user.id);
        const newCode = await app.sendCode(input(41));
        const verified = await app.request(access + 'verify', newCode);
        const form = { ...input(41), onboardingToken: verified.body.onboardingToken, name: '新朋友' };
        assert.equal((await app.request(access + 'onboard', { ...form, username: old.user.username })).status, 409);
        const signedUp = await app.request(access + 'onboard', { ...form, username: 'new_friend' });
        assert.equal(signedUp.status, 200);
        assert(!Object.hasOwn(signedUp.body.user, 'phone'));
        assert.equal((await app.request(access + 'onboard', { ...form, username: 'another_account' })).status, 400);
        app.advance(91_000);
        const repeat = await app.sendCode(input(41));
        assert.equal((await app.request(access + 'verify', repeat)).body.user.id, signedUp.body.user.id);
        assert.equal((await admin.query('SELECT count(*)::int AS n FROM users')).rows[0].n, 3);
      } finally { await app.close(); }
    });
  } finally {
    await pool.end();
    await admin.end();
  }
});
