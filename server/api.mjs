import { createHash, randomBytes, scrypt as derive, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { checkDatabase, pool } from './db.mjs';
import { checkEasemob, syncFriends, userToken } from './im.mjs';
import { PhoneError, unavailable as phoneUnavailable } from './phone/policy.mjs';

const scrypt = promisify(derive);
const publicFields = 'id, username, name, bio';
const usernamePattern = /^[a-z0-9_]{3,24}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const hash = (value) => createHash('sha256').update(value).digest('hex');

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function cleanText(value, limit, required = false) {
  if (typeof value !== 'string') throw new HttpError(400, '请输入有效的文字。');
  const text = value.trim();
  const length = Array.from(text).length;
  if ((required && !length) || length > limit || text.includes('\0')) {
    throw new HttpError(400, '文字长度或内容无效。');
  }
  return text;
}

function readUsername(value) {
  const username = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!usernamePattern.test(username)) throw new HttpError(400, '账号须为 3–24 位字母、数字或下划线。');
  return username;
}

function readPassword(password) {
  if (typeof password !== 'string' || password.length < 10 || password.length > 128) {
    throw new HttpError(400, '密码须为 10–128 个字符。');
  }
  return password;
}

function readId(id) {
  if (typeof id !== 'string' || !uuidPattern.test(id)) throw new HttpError(400, '无效的标识。');
  return id;
}

async function rateLimit(key, limit, minutes) {
  const { rows: [row] } = await pool.query(
    `INSERT INTO rate_limits (key, attempts, window_start) VALUES ($1, 1, now())
     ON CONFLICT (key) DO UPDATE
       SET attempts = CASE WHEN rate_limits.window_start <= now() - make_interval(mins => $2)
                          THEN 1 ELSE rate_limits.attempts + 1 END,
           window_start = CASE WHEN rate_limits.window_start <= now() - make_interval(mins => $2)
                               THEN now() ELSE rate_limits.window_start END
     RETURNING attempts`, [hash(key), minutes]);
  if (row.attempts > limit) throw new HttpError(429, '操作过于频繁，请稍后再试。');
}

async function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  const key = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
  return `${salt}:${key.toString('hex')}`;
}

async function createSession(user) {
  const token = randomBytes(32).toString('base64url');
  await pool.query("INSERT INTO sessions VALUES ($1, $2, now() + interval '30 days')", [hash(token), user.id]);
  return { token, user };
}

async function register(body, sourceIp) {
  await rateLimit('register:' + sourceIp, 12, 60);
  const username = readUsername(body.username);
  const password = readPassword(body.password);
  const name = cleanText(body.name, 16, true);
  const credential = await passwordHash(password);
  const token = randomBytes(32).toString('base64url');
  const { rows: [user] } = await pool.query(
    `WITH registered AS (
       INSERT INTO users (username, password_hash, name) VALUES ($1, $2, $3)
       ON CONFLICT (username) DO NOTHING RETURNING ${publicFields}
     ), issued AS (
       INSERT INTO sessions (token_hash, user_id, expires_at)
       SELECT $4, id, now() + interval '30 days' FROM registered
     )
     SELECT * FROM registered`, [username, credential, name, hash(token)]);
  if (!user) throw new HttpError(409, '这个账号已被注册。');
  return { token, user };
}

async function matchesPassword(password, stored) {
  const candidate = await passwordHash(password, stored?.split(':')[0] ?? '00000000000000000000000000000000');
  const expected = Buffer.from(stored ?? '0'.repeat(candidate.length));
  const actual = Buffer.from(candidate);
  return expected.length === actual.length && timingSafeEqual(actual, expected) && !!stored;
}

async function login(body, sourceIp) {
  await rateLimit('login:' + sourceIp, 40, 15);
  const username = readUsername(body.username);
  const password = readPassword(body.password);
  await rateLimit('login:' + sourceIp + ':' + username, 8, 15);
  await rateLimit('login-account:' + username, 30, 15);
  const { rows: [row] } = await pool.query(`SELECT ${publicFields}, password_hash FROM users WHERE username = $1`, [username]);
  const { password_hash: stored, ...user } = row ?? {};
  if (!await matchesPassword(password, stored)) throw new HttpError(401, '账号或密码不正确。');
  return createSession(user);
}

async function requireSession(authorization) {
  const token = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(authorization ?? '')?.[1];
  if (!token) throw new HttpError(401, '请登录后继续。');
  const tokenHash = hash(token);
  const { rows: [user] } = await pool.query(
    `SELECT users.id, username, name, bio FROM sessions JOIN users ON users.id = sessions.user_id
     WHERE token_hash = $1 AND expires_at > now()`, [tokenHash]);
  if (!user) throw new HttpError(401, '登录已过期，请重新登录。');
  return { user, tokenHash };
}

async function findPeople(userId, username) {
  const { rows: [person] } = await pool.query(
    `SELECT ${publicFields} FROM users WHERE username = $1 AND id <> $2`, [readUsername(username), userId]);
  return { person: person ?? null };
}

async function friendships(userId) {
  const { rows } = await pool.query(
    `SELECT f.id, f.status, f.requested_by = $1 AS outgoing, f.im_synced AS "chatReady",
            u.id AS "userId", u.username, u.name, u.bio
     FROM friendships f
     JOIN users u ON u.id = CASE WHEN f.first_user = $1 THEN f.second_user ELSE f.first_user END
     WHERE (f.first_user = $1 OR f.second_user = $1) AND f.status <> 'declined'
     ORDER BY f.updated_at DESC`, [userId]);
  return { relationships: rows };
}

async function requestFriend(userId, other) {
  readId(other);
  if (other === userId) throw new HttpError(400, '不能添加自己。');
  await rateLimit('friend:' + userId, 30, 60);
  const { rows: [target] } = await pool.query('SELECT id FROM users WHERE id = $1', [other]);
  if (!target) throw new HttpError(404, '找不到此账号。');
  const { rows: [row] } = await pool.query(
    `INSERT INTO friendships (first_user, second_user, requested_by)
     VALUES (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid), $1)
     ON CONFLICT (first_user, second_user) DO UPDATE
       SET id = excluded.id, requested_by = excluded.requested_by, status = 'pending', updated_at = now()
       WHERE friendships.status = 'declined' AND (
         friendships.requested_by <> excluded.requested_by OR
         friendships.updated_at <= now() - interval '1 day'
       )
     RETURNING id`, [userId, other]);
  if (row) return { id: row.id };
  const { rows: [existing] } = await pool.query(
    `SELECT id, status FROM friendships
     WHERE first_user = least($1::uuid, $2::uuid) AND second_user = greatest($1::uuid, $2::uuid)`, [userId, other]);
  if (existing?.status === 'declined') throw new HttpError(429, '暂时无法再次发送申请，请明天重试。');
  return { id: existing?.id };
}

async function respondToFriend(userId, id, action) {
  const status = { accept: 'accepted', decline: 'declined' }[action];
  const { rows: [row] } = await pool.query(
    `UPDATE friendships SET status = $3, updated_at = CASE WHEN status = $3 THEN updated_at ELSE now() END
     WHERE id = $1 AND (first_user = $2 OR second_user = $2)
       AND requested_by <> $2 AND status IN ('pending', $3)
     RETURNING id`, [readId(id), userId, status]);
  if (!row) throw new HttpError(404, '找不到可以处理的好友请求。');
  return {};
}

async function imOperation(operation) {
  try {
    return await operation();
  } catch (error) {
    console.error('IM operation failed', error.status ?? error.name);
    throw new HttpError(503, '环信暂时不可用，请稍后重试。');
  }
}

async function prepareChat(userId, other) {
  const { rows: [row] } = await pool.query(
    `SELECT id, im_synced FROM friendships
     WHERE first_user = least($1::uuid, $2::uuid)
       AND second_user = greatest($1::uuid, $2::uuid) AND status = 'accepted'`, [userId, readId(other)]);
  if (!row) throw new HttpError(403, '只能与已接受请求的好友聊天。');
  if (!row.im_synced) {
    await rateLimit('pair:' + row.id, 20, 15);
    await imOperation(() => syncFriends(userId, other));
    await pool.query('UPDATE friendships SET im_synced = true WHERE id = $1', [row.id]);
  }
  return {};
}

function json(statusCode, body) {
  return { statusCode, body };
}

function diagnosticAllowed(authorization) {
  const secret = process.env.PENLIA_DIAGNOSTIC_TOKEN;
  return !!secret && secret.length >= 32 &&
    timingSafeEqual(Buffer.from(hash(authorization ?? '')), Buffer.from(hash('Bearer ' + secret)));
}

async function readiness(authorization) {
  if (!diagnosticAllowed(authorization)) return json(404, { error: '接口不存在。' });
  const [databaseStatus, easemob] = await Promise.all([
    checkDatabase().catch((error) => {
      console.error('Database readiness failed', error.code ?? error.name);
      return { ready: false, tls: null };
    }),
    checkEasemob().catch((error) => {
      console.error('Easemob readiness failed', error.status ?? error.cause?.code ?? error.name);
      return false;
    }),
  ]);
  const { ready: database, tls: databaseTls } = databaseStatus;
  const ok = database && easemob;
  return json(ok ? 200 : 503, { ok, database, databaseTls, easemob });
}

const phoneRoutes = new Map([
  ['POST /v1/phone/challenge', { purpose: 'access', action: 'challenge' }],
  ['POST /v1/phone/send', { purpose: 'access', action: 'send' }],
  ['POST /v1/phone/verify', { purpose: 'access', action: 'verify' }],
  ['POST /v1/phone/onboard', { purpose: 'access', action: 'onboard' }],
  ['POST /v1/phone/bind/challenge', { purpose: 'bind', action: 'challenge' }],
  ['POST /v1/phone/bind/send', { purpose: 'bind', action: 'send' }],
  ['POST /v1/phone/bind/verify', { purpose: 'bind', action: 'verify' }],
]);

async function runPhone({ purpose, action }, request, phoneAuth) {
  if (!phoneAuth) throw phoneUnavailable();
  const { authorization, sourceIp, readBody } = request;
  const user = purpose === 'bind' ? (await requireSession(authorization)).user : undefined;
  const body = await readBody();
  if (purpose === 'bind' && action === 'challenge') {
    await rateLimit('phone-bind-password:' + user.id, 6, 15);
    const { rows: [row] } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [user.id]);
    if (!await matchesPassword(readPassword(body.password), row?.password_hash)) {
      throw new HttpError(401, '请重新验证旧账号的密码。');
    }
  }
  return phoneAuth[action](body, { sourceIp, purpose, userId: user?.id });
}

export async function handle({ method, path, headers, query, sourceIp, readBody }, { phoneAuth } = {}) {
  const route = method + ' ' + path;
  const { authorization } = headers;
  try {
    if (route === 'GET /health') return json(200, { ok: true });
    if (route === 'GET /ops/readiness') return await readiness(authorization);
    if (route === 'GET /ops/phone-usage') {
      if (!diagnosticAllowed(authorization)) return json(404, { error: '接口不存在。' });
      return json(200, phoneAuth ? await phoneAuth.usage() : { enabled: false });
    }
    if (route === 'POST /v1/register') return json(201, await register(await readBody(), sourceIp));
    if (route === 'POST /v1/login') return json(200, await login(await readBody(), sourceIp));
    const phoneRoute = phoneRoutes.get(route);
    if (phoneRoute) return json(200, await runPhone(phoneRoute, { authorization, sourceIp, readBody }, phoneAuth));

    const { user, tokenHash } = await requireSession(authorization);
    switch (route) {
      case 'POST /v1/logout':
        await pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
        return json(200, {});
      case 'GET /v1/me':
        return json(200, { user });
      case 'PATCH /v1/me': {
        const { name, bio } = await readBody();
        const { rows: [profile] } = await pool.query(
          `UPDATE users SET name = $1, bio = $2 WHERE id = $3 RETURNING ${publicFields}`,
          [cleanText(name, 16, true), cleanText(bio, 60), user.id]);
        return json(200, { user: profile });
      }
      case 'GET /v1/people':
        await rateLimit('lookup:' + user.id, 60, 1);
        return json(200, await findPeople(user.id, query.get('username')));
      case 'GET /v1/friends':
        return json(200, await friendships(user.id));
      case 'POST /v1/friends':
        return json(200, await requestFriend(user.id, (await readBody()).userId));
      case 'POST /v1/friends/accept':
        return json(200, await respondToFriend(user.id, (await readBody()).id, 'accept'));
      case 'POST /v1/friends/decline':
        return json(200, await respondToFriend(user.id, (await readBody()).id, 'decline'));
      case 'POST /v1/im/contact':
        return json(200, await prepareChat(user.id, (await readBody()).userId));
      case 'POST /v1/im/token':
        await rateLimit('im:' + user.id, 20, 15);
        return json(200, await imOperation(() => userToken(user.id)));
      default:
        return json(404, { error: '接口不存在。' });
    }
  } catch (error) {
    if (error instanceof HttpError || error instanceof PhoneError) return json(error.status, { error: error.message });
    const requestId = headers['x-fc-request-id'];
    const trace = typeof requestId === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(requestId) ? requestId : undefined;
    console.error('API request failed', error.code ?? error.name, trace ?? '');
    return json(500, { error: '服务暂时不可用，请稍后再试。' });
  }
}
