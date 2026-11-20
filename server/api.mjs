import { randomBytes, scrypt as derive, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { checkDatabase, pool } from './db.mjs';
import { checkEasemob, syncFriends, userToken } from './im.mjs';
import { PhoneError, unavailable as phoneUnavailable } from './phone/policy.mjs';
import { cleanText, hash, HttpError, inTransaction, readId } from './core.mjs';
import { areFriends, beforeImSend, blocked, lockUsers, preferences, restricted, searchPerson } from './p0/access.mjs';
import { p0Routes } from './p0/routes.mjs';
import { p1Routes } from './p1/routes.mjs';
import { assertAllowed } from './p1/enforcement-access.mjs';
import { runEnforcement, workerAuthorized } from './p1/moderation.mjs';

export { HttpError } from './core.mjs';

const scrypt = promisify(derive);
const publicFields = 'id, username, name, bio';
const usernamePattern = /^[a-z0-9_]{3,24}$/;
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

async function friendships(userId) {
  const { rows } = await pool.query(
    `SELECT f.id, f.status, f.requested_by = $1 AS outgoing, f.im_synced AS "chatReady",
            u.id AS "userId", u.username, u.name,
            CASE WHEN f.status='accepted' AND p.profile_policy IS DISTINCT FROM 'private' AND NOT ${restricted('u.id','$1::uuid')} THEN u.bio ELSE '' END AS bio,
            n.note AS "verificationMessage"
     FROM friendships f
     JOIN users u ON u.id = CASE WHEN f.first_user = $1 THEN f.second_user ELSE f.first_user END
     LEFT JOIN privacy_preferences p ON p.user_id=u.id
     LEFT JOIN friend_notes n ON n.friendship_id=f.id
     WHERE (f.first_user = $1 OR f.second_user = $1) AND f.status <> 'declined' AND NOT ${blocked('$1::uuid','u.id')}
     ORDER BY f.updated_at DESC`, [userId]);
  return { relationships: rows };
}

async function requestFriend(userId, body, sourceIp) {
  const other=readId(body.userId);
  if (other===userId) throw new HttpError(400,'不能添加自己。');
  const note=cleanText(body.note??'',100);
  await rateLimit('friend:'+userId,20,60);
  await rateLimit('friend-net:'+sourceIp,100,60);
  await rateLimit('friend-target:'+other,35,60);
  return inTransaction(pool,async(db)=>{
    await lockUsers(db,userId,other);
    const allowed=await db.query(`SELECT 1 FROM users WHERE id=$2 AND NOT ${blocked('$1::uuid','$2::uuid')}`,[userId,other]);
    if (!allowed.rowCount || (await preferences(db,other)).addPolicy==='none') {
      throw new HttpError(404,'当前无法发送好友申请。');
    }
    const existing=await db.query(`SELECT id,status,requested_by,updated_at FROM friendships
      WHERE first_user=least($1::uuid,$2::uuid) AND second_user=greatest($1::uuid,$2::uuid)`,[userId,other]);
    const current=existing.rows[0];
    if (current?.status==='pending' || current?.status==='accepted') return {id:current.id};
    if (current && current.updated_at.getTime()>Date.now()-86400000) {
      throw new HttpError(429,'暂时无法再次发送申请，请稍后重试。');
    }
    const {rows:[row]}=await db.query(`INSERT INTO friendships as f(first_user,second_user,requested_by)
      VALUES (least($1::uuid,$2::uuid),greatest($1::uuid,$2::uuid),$1)
      ON CONFLICT(first_user,second_user) DO UPDATE SET id=excluded.id,status='pending',requested_by=$1,im_synced=false,updated_at=now()
      RETURNING id`,[userId,other]);
    await db.query(`INSERT INTO friend_notes(friendship_id,note) VALUES($1,$2)
      ON CONFLICT(friendship_id) DO UPDATE SET note=excluded.note`,[row.id,note]);
    return {id:row.id};
  });
}

async function respondToFriend(userId,id,action) {
  readId(id);
  const status=action==='accept'?'accepted':'declined';
  const {rows:[candidate]}=await pool.query(`SELECT requested_by FROM friendships WHERE id=$1 AND requested_by<>$2
    AND $2::uuid IN (first_user,second_user)`,[id,userId]);
  if (!candidate) throw new HttpError(404,'找不到可以处理的好友请求。');
  return inTransaction(pool,async(db)=>{
    await lockUsers(db,userId,candidate.requested_by);
    const {rows:[row]}=await db.query(`UPDATE friendships AS f SET status=$3,updated_at=CASE WHEN f.status=$3 THEN f.updated_at ELSE now() END
      WHERE f.id=$1 AND $2::uuid IN (f.first_user,f.second_user) AND f.requested_by<>$2
      AND f.status IN ('pending',$3) AND NOT ${blocked('f.first_user','f.second_user')} RETURNING f.id`,[id,userId,status]);
    if (!row) throw new HttpError(404,'找不到可以处理的好友请求。');
    return {};
  });
}

async function imOperation(operation) {
  try {
    return await operation();
  } catch (error) {
    console.error('IM operation failed', error.status ?? error.name);
    throw new HttpError(503, '环信暂时不可用，请稍后重试。');
  }
}

async function prepareChat(userId,other) {
  await assertAllowed(pool,userId,['limit_sending','limit_account']);
  readId(other);
  if (!await areFriends(pool,userId,other)) throw new HttpError(403,'只能与已接受请求的好友聊天。');
  const {rows:[row]}=await pool.query(`SELECT id,im_synced FROM friendships
    WHERE first_user=least($1::uuid,$2::uuid) AND second_user=greatest($1::uuid,$2::uuid) AND status='accepted'`,[userId,other]);
  if (!row) throw new HttpError(403,'只能与已接受请求的好友聊天。');
  if (!row.im_synced) {
    await rateLimit('pair:'+row.id,20,15);
    await imOperation(()=>syncFriends(userId,other));
    const done=await pool.query(`UPDATE friendships SET im_synced=true WHERE id=$1 AND status='accepted'
      AND NOT ${blocked('first_user','second_user')}`,[row.id]);
    if (!done.rowCount) throw new HttpError(403,'当前关系已不允许聊天。');
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

export async function handle({ method, path, headers, query, sourceIp, readBody }, { phoneAuth, rtc, moderationEvidence, reviewAdvisor } = {}) {
  const route = method + ' ' + path;
  const { authorization } = headers;
  try {
    if (method==='POST' && /^\/callbacks\/easemob\/[A-Za-z0-9_-]{32,96}$/.test(path)) {
      return json(200,await beforeImSend(await readBody(),path.split('/').at(-1)));
    }
    if (route === 'GET /health') return json(200, { ok: true });
    if (route === 'GET /ops/readiness') return await readiness(authorization);
    if (route === 'POST /ops/p1/moderation/run') {
      if (!workerAuthorized(authorization)) return json(404, { error: '接口不存在。' });
      return json(200, await runEnforcement());
    }
    if (route === 'GET /ops/phone-usage') {
      if (!diagnosticAllowed(authorization)) return json(404, { error: '接口不存在。' });
      return json(200, phoneAuth ? await phoneAuth.usage() : { enabled: false });
    }
    if (route === 'POST /v1/register') return json(201, await register(await readBody(), sourceIp));
    if (route === 'POST /v1/login') return json(200, await login(await readBody(), sourceIp));
    const phoneRoute = phoneRoutes.get(route);
    if (phoneRoute) return json(200, await runPhone(phoneRoute, { authorization, sourceIp, readBody }, phoneAuth));

    const { user, tokenHash } = await requireSession(authorization);
    const p1 = await p1Routes(method,path,{ user,query,readBody,rateLimit,rtc,moderationEvidence,reviewAdvisor });
    if (p1 !== undefined) return json(200,p1);
    switch (route) {
      case 'POST /v1/logout':
        await pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
        return json(200, {});
      case 'POST /v1/privacy/password': {
        await rateLimit('p0-password:'+user.id,6,60);
        const body=await readBody();
        const oldPassword=readPassword(body.oldPassword);
        const newPassword=readPassword(body.newPassword);
        const credential=await passwordHash(newPassword);
        await inTransaction(pool,async(db)=>{
          const {rows:[row]}=await db.query('SELECT password_hash FROM users WHERE id=$1 FOR UPDATE',[user.id]);
          if (!await matchesPassword(oldPassword,row?.password_hash)) throw new HttpError(403,'原密码不正确，请检查后重试。');
          await db.query('UPDATE users SET password_hash=$2 WHERE id=$1',[user.id,credential]);
          await db.query('DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2',[user.id,tokenHash]);
        });
        return json(200,{});
      }
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
        return json(200, await searchPerson(user.id, query.get('username'),'username'));
      case 'GET /v1/friends':
        return json(200, await friendships(user.id));
      case 'POST /v1/friends':
        await assertAllowed(pool,user.id,['limit_contact','limit_account']);
        return json(200, await requestFriend(user.id, await readBody(), sourceIp));
      case 'POST /v1/friends/accept':
        return json(200, await respondToFriend(user.id, (await readBody()).id, 'accept'));
      case 'POST /v1/friends/decline':
        return json(200, await respondToFriend(user.id, (await readBody()).id, 'decline'));
      case 'POST /v1/im/contact':
        return json(200, await prepareChat(user.id, (await readBody()).userId));
      case 'POST /v1/im/token':
        if (process.env.PENLIA_IM_PRIVACY_READY!=='1'||!process.env.PENLIA_IM_CALLBACK_SECRET||
            !process.env.PENLIA_IM_CALLBACK_PATH_KEY || process.env.PENLIA_IM_CALLBACK_PATH_KEY.length<32) {
          throw new HttpError(503,'聊天权限服务暂未启用。');
        }
        await rateLimit('im:' + user.id, 20, 15);
        return json(200, await imOperation(() => userToken(user.id)));
      default:
        return await p0Routes(route,{user,tokenHash,query,headers,sourceIp,readBody,rateLimit})
          ?? json(404, { error: '接口不存在。' });
    }
  } catch (error) {
    if (error instanceof HttpError || error instanceof PhoneError) return json(error.status, { error: error.message });
    const requestId = headers['x-fc-request-id'];
    const trace = typeof requestId === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(requestId) ? requestId : undefined;
    console.error('API request failed', error.code ?? error.name, trace ?? '');
    return json(500, { error: '服务暂时不可用，请稍后再试。' });
  }
}
