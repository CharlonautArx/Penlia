import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import {
  CODE_ERRORS, DAY, HOUR, MINUTE, PhoneError, SMS_COOLDOWN, cnBoundaries, equalDigest, invalidCode,
  invalidProof, keyedDigest, requestContext, tooMany, unavailable, validatedLimits,
} from './policy.mjs';

const publicFields = 'id, username, name, bio';
const hexToken = (value) => createHash('sha256').update(value).digest('hex');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const lower = (a, b) => a < b ? a : b;
const higher = (a, b) => a > b ? a : b;
const failed = (result) => { if (result instanceof PhoneError) throw result; return result; };

function trustedVerdict(verdict, challengeId) {
  return verdict?.passed === true && verdict.challengeId === challengeId
    && typeof verdict.proofId === 'string' && verdict.proofId.length > 0 && verdict.proofId.length <= 512;
}

/**
 * Vendor adapters are server-owned dependencies; this module has no default adapter.
 * A verifier must attest a solved manual challenge, its Penlia challenge ID and a stable vendor proof ID.
 * A sender makes a single submission of one message and returns accepted, rejected or unknown.
 */
export function createPhoneAuth({ pool, secret, captcha, sms, limits: overrides, clock }) {
  if (!pool?.connect || !Buffer.isBuffer(secret) || secret.length < 32
    || typeof captcha?.verify !== 'function' || typeof sms?.send !== 'function') {
    throw new Error('Missing phone verification dependencies');
  }
  const limits = validatedLimits(overrides);
  const digest = (kind, ...values) => keyedDigest(secret, kind, ...values);

  async function atomic(work) {
    const database = await pool.connect();
    try {
      await database.query('BEGIN');
      await database.query("SET LOCAL lock_timeout = '3s'");
      await database.query('SELECT pg_advisory_xact_lock(182129780)');
      const now = clock ? clock() : +(await database.query('SELECT clock_timestamp() AS at')).rows[0].at;
      const result = await work(database, now);
      await database.query('COMMIT');
      return result;
    } catch (error) {
      await database.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      database.release();
    }
  }

  async function requireEnabled(db) {
    const { rows: [control] } = await db.query(
      'SELECT enabled, daily_count, daily_micros, unit_floor_micros, captcha_checks, challenge_count, monthly_warning_micros FROM phone_auth_control WHERE id');
    if (control?.enabled !== true) throw unavailable();
    return control;
  }

  async function spend(db, now, control) {
    const boundary = cnBoundaries(now);
    const { rows: [totals] } = await db.query(
      `SELECT count(*) FILTER (WHERE created_at >= $1)::int AS daily_count,
         coalesce(sum(greatest(reserved_micros, billed_micros)) FILTER (WHERE created_at >= $1), 0) AS daily_micros,
         coalesce(sum(greatest(reserved_micros, billed_micros)), 0) AS monthly_micros
       FROM phone_sms_attempts WHERE created_at >= $2`, [boundary.day, boundary.month]);
    const cost = higher(BigInt(control.unit_floor_micros), BigInt(limits.unitMicros));
    const dailyCap = lower(BigInt(control.daily_micros), BigInt(limits.dailyMicros));
    return { boundary, totals, cost, allowed: totals.daily_count < Math.min(limits.dailyCount, control.daily_count)
      && BigInt(totals.daily_micros) + cost <= dailyCap };
  }

  async function sendRisk(db, now, ctx) {
    const { rows: [counts] } = await db.query(
      `SELECT count(*) FILTER (WHERE phone_key = $1 AND created_at > $5)::int AS cooldown,
         count(*) FILTER (WHERE phone_key = $1 AND created_at > $4)::int AS phone_hour,
         count(*) FILTER (WHERE phone_key = $1)::int AS phone_day,
         count(*) FILTER (WHERE ip_key = $2 AND created_at > $4)::int AS ip_hour,
         count(DISTINCT phone_key) FILTER (WHERE ip_key = $2 AND phone_key <> $1 AND created_at > $4)::int AS ip_distinct,
         count(*) FILTER (WHERE device_key = $3 AND created_at > $4)::int AS device_hour,
         count(DISTINCT phone_key) FILTER (WHERE device_key = $3 AND phone_key <> $1 AND created_at > $4)::int AS device_distinct,
         count(*) FILTER (WHERE created_at > $7)::int AS burst
       FROM phone_sms_attempts WHERE created_at > $6`, [
        ctx.phoneKey, ctx.ipKey, ctx.deviceKey, new Date(now - HOUR), new Date(now - SMS_COOLDOWN), new Date(now - DAY), new Date(now - 10 * MINUTE),
      ]);
    if (counts.cooldown || counts.phone_hour >= limits.phoneHour || counts.phone_day >= limits.phoneDay
      || counts.ip_hour >= limits.ipHour || counts.ip_distinct >= limits.ipDistinct
      || counts.device_hour >= limits.deviceHour || counts.device_distinct >= limits.deviceDistinct || counts.burst >= limits.burst) {
      return tooMany();
    }
  }

  async function increment(db, action, key, now, threshold, window) {
    const { rows: [count] } = await db.query(
      `INSERT INTO phone_risk_windows(action_key, started_at, attempts) VALUES ($1, $2, 1)
       ON CONFLICT (action_key) DO UPDATE
       SET started_at = CASE WHEN phone_risk_windows.started_at <= $3 THEN $2 ELSE phone_risk_windows.started_at END,
           attempts = CASE WHEN phone_risk_windows.started_at <= $3 THEN 1 ELSE least(phone_risk_windows.attempts + 1, $4) END
       RETURNING attempts`, [digest('risk', action, key), new Date(now), new Date(now - window), threshold + 1]);
    return count.attempts <= threshold;
  }

  async function challenge(input, meta) {
    const ctx = requestContext(secret, input, meta);
    return failed(await atomic(async (db, now) => {
      const control = await requireEnabled(db);
      const { rows: [quantity] } = await db.query(
        `SELECT count(*) FILTER (WHERE created_at >= $1)::int AS daily,
           count(*) FILTER (WHERE ip_key = $2 AND created_at > $5)::int AS ip,
           count(*) FILTER (WHERE device_key = $3 AND created_at > $5)::int AS device,
           count(*) FILTER (WHERE phone_key = $4 AND created_at > $5)::int AS phone
         FROM phone_challenges WHERE created_at >= least($1, $5)`,
        [cnBoundaries(now).day, ctx.ipKey, ctx.deviceKey, ctx.phoneKey, new Date(now - 10 * MINUTE)]);
      if (quantity.daily >= Math.min(limits.challengeDailyCount, control.challenge_count) || quantity.ip >= 24 || quantity.device >= 8 || quantity.phone >= 5) return tooMany();
      const risk = await sendRisk(db, now, ctx);
      if (risk) return risk;
      if (!(await spend(db, now, control)).allowed) return tooMany();
      const challengeId = randomUUID();
      await db.query(`INSERT INTO phone_challenges(id, phone_key, context_key, ip_key, device_key, created_at, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [challengeId, ctx.phoneKey, ctx.contextKey, ctx.ipKey, ctx.deviceKey, new Date(now), new Date(now + 2 * MINUTE)]);
      return { challengeId, expiresInSeconds: 120 };
    }));
  }

  async function send(input, meta) {
    const ctx = requestContext(secret, input, meta);
    if (typeof input.challengeId !== 'string' || !uuid.test(input.challengeId)
      || typeof input.proof !== 'string' || !input.proof.length || input.proof.length > 4096) throw invalidProof();
    const proofKey = digest('captcha-input', input.proof);

    failed(await atomic(async (db, now) => {
      const control = await requireEnabled(db);
      const risk = await sendRisk(db, now, ctx);
      if (risk) return risk;
      const { rows: [quantity] } = await db.query('SELECT count(*)::int AS daily FROM phone_captcha_checks WHERE created_at >= $1',
        [cnBoundaries(now).day]);
      if (quantity.daily >= Math.min(limits.captchaDailyChecks, control.captcha_checks)) return tooMany();
      const { rowCount } = await db.query(`UPDATE phone_challenges SET consumed_at = $3
        WHERE id = $1 AND context_key = $2 AND consumed_at IS NULL AND expires_at > $3`,
      [input.challengeId, ctx.contextKey, new Date(now)]);
      if (!rowCount) return invalidProof();
      const result = await db.query(`INSERT INTO phone_captcha_checks(proof_key, created_at) VALUES ($1, $2)
        ON CONFLICT (proof_key) DO NOTHING`, [proofKey, new Date(now)]);
      if (!result.rowCount) return invalidProof();
    }));

    // No paid SMS action occurs while waiting for the independent server verifier.
    let verdict;
    try {
      verdict = await captcha.verify({ proof: input.proof, challengeId: input.challengeId,
        purpose: meta.purpose, signal: AbortSignal.timeout(4000) });
    } catch {
      await pool.query("UPDATE phone_captcha_checks SET outcome = 'failed' WHERE proof_key = $1", [proofKey]);
      throw unavailable();
    }
    if (!trustedVerdict(verdict, input.challengeId)) {
      await pool.query("UPDATE phone_captcha_checks SET outcome = 'failed' WHERE proof_key = $1", [proofKey]);
      throw invalidProof();
    }

    const id = randomUUID();
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    failed(await atomic(async (db, now) => {
      const control = await requireEnabled(db);
      const verifiedKey = digest('captcha-attested', verdict.proofId);
      const verified = await db.query(`UPDATE phone_captcha_checks SET attested_key = $2, outcome = 'verified'
        WHERE proof_key = $1 AND outcome = 'requested'
          AND NOT EXISTS (SELECT FROM phone_captcha_checks WHERE attested_key = $2)`, [proofKey, verifiedKey]);
      if (!verified.rowCount) return invalidProof();
      const { rowCount: fresh } = await db.query('SELECT 1 FROM phone_challenges WHERE id = $1 AND expires_at > $2',
        [input.challengeId, new Date(now)]);
      if (!fresh) return invalidProof();
      const risk = await sendRisk(db, now, ctx);
      if (risk) return risk;
      const { boundary, totals, cost, allowed } = await spend(db, now, control);
      if (!allowed) return tooMany();
      await db.query('UPDATE phone_sms_attempts SET code_mac = NULL WHERE phone_key = $1 AND code_mac IS NOT NULL', [ctx.phoneKey]);
      await db.query(`INSERT INTO phone_sms_attempts(id, phone_key, context_key, ip_key, device_key, created_at, reserved_micros, code_mac, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [id, ctx.phoneKey, ctx.contextKey, ctx.ipKey, ctx.deviceKey,
        new Date(now), cost.toString(), digest('otp', id, ctx.contextKey, code), new Date(now + 5 * MINUTE)]);
      const monthly = BigInt(totals.monthly_micros) + cost;
      if (monthly >= lower(BigInt(limits.monthlyWarningMicros), BigInt(control.monthly_warning_micros))) {
        await db.query(`INSERT INTO phone_budget_alerts(month_start, created_at, reserved_micros) VALUES ($1, $2, $3)
          ON CONFLICT (month_start) DO NOTHING`, [boundary.monthLabel, new Date(now), monthly.toString()]);
      }
    }));

    let receipt;
    try {
      receipt = await sms.send({ phone: input.phone, code, attemptId: id, signal: AbortSignal.timeout(6000) });
    } catch {
      receipt = { status: 'unknown' };
    }
    const status = ['accepted', 'rejected'].includes(receipt?.status) ? receipt.status : 'unknown';
    const providerRef = typeof receipt?.reference === 'string' && receipt.reference.length <= 256
      ? digest('supplier-reference', receipt.reference) : null;
    await pool.query(`UPDATE phone_sms_attempts SET send_status = $2, provider_ref = $3,
      code_mac = CASE WHEN $2 = 'accepted' THEN code_mac ELSE NULL END WHERE id = $1 AND send_status = 'reserved'`,
    [id, status, providerRef]);
    if (status !== 'accepted') throw unavailable();
    return { requestId: id, cooldownSeconds: SMS_COOLDOWN / 1000 };
  }

  async function verify(input, meta) {
    const ctx = requestContext(secret, input, meta);
    if (typeof input.requestId !== 'string' || !uuid.test(input.requestId)
      || typeof input.code !== 'string' || !/^\d{6}$/.test(input.code)) throw invalidCode();
    return failed(await atomic(async (db, now) => {
      await requireEnabled(db);
      const ipOk = await increment(db, 'otp-ip', ctx.ipKey, now, 45, 10 * MINUTE);
      const deviceOk = await increment(db, 'otp-device', ctx.deviceKey, now, 15, 10 * MINUTE);
      if (!ipOk || !deviceOk) return tooMany();
      const { rows: [row] } = await db.query(`SELECT code_mac, failures FROM phone_sms_attempts
        WHERE id = $1 AND context_key = $2 AND expires_at > $3 AND send_status = 'accepted'
          AND verified_at IS NULL AND code_mac IS NOT NULL`, [input.requestId, ctx.contextKey, new Date(now)]);
      if (!row) return invalidCode();
      if (!equalDigest(row.code_mac, digest('otp', input.requestId, ctx.contextKey, input.code))) {
        await db.query(`UPDATE phone_sms_attempts SET failures = failures + 1,
          code_mac = CASE WHEN failures + 1 >= $2 THEN NULL ELSE code_mac END WHERE id = $1`,
        [input.requestId, CODE_ERRORS]);
        return invalidCode();
      }
      await db.query('UPDATE phone_sms_attempts SET verified_at = $2, code_mac = NULL WHERE id = $1', [input.requestId, new Date(now)]);
      const { rows: [identity] } = await db.query('SELECT user_id FROM phone_identities WHERE phone_key = $1', [ctx.phoneKey]);
      if (meta.purpose === 'bind') {
        if (identity?.user_id === meta.userId) return { bound: true };
        const { rowCount } = await db.query(`INSERT INTO phone_identities(phone_key, user_id, verified_at) VALUES ($1, $2, $3)
          ON CONFLICT DO NOTHING`, [ctx.phoneKey, meta.userId, new Date(now)]);
        if (!rowCount) return new PhoneError(409, '无法绑定此手机号，请检查现有绑定。');
        await invalidateOnboarding(db, ctx, now);
        return { bound: true };
      }
      if (identity) {
        const { rows: [user] } = await db.query(`SELECT ${publicFields} FROM users WHERE id = $1`, [identity.user_id]);
        return issueSession(db, user, now);
      }
      await invalidateOnboarding(db, ctx, now);
      const onboardingToken = randomBytes(32).toString('base64url');
      await db.query(`INSERT INTO phone_onboarding(token_key, phone_key, context_key, expires_at) VALUES ($1, $2, $3, $4)`,
      [digest('onboarding', onboardingToken), ctx.phoneKey, ctx.contextKey, new Date(now + 10 * MINUTE)]);
      return { onboardingToken };
    }));
  }

  async function onboard(input, meta) {
    const ctx = requestContext(secret, input, meta);
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const username = typeof input.username === 'string' ? input.username.trim().toLowerCase() : '';
    if (!/^[a-z0-9_]{3,24}$/.test(username) || !name || Array.from(name).length > 16 || name.includes('\0')) {
      throw new PhoneError(400, '请检查昵称和专属朋聊号。');
    }
    if (typeof input.onboardingToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(input.onboardingToken)) throw invalidCode();
    return failed(await atomic(async (db, now) => {
      await requireEnabled(db);
      const allowed = await increment(db, 'onboard', ctx.deviceKey, now, 12, 10 * MINUTE);
      if (!allowed) return tooMany();
      const tokenKey = digest('onboarding', input.onboardingToken);
      const { rowCount } = await db.query(`SELECT 1 FROM phone_onboarding WHERE token_key = $1 AND context_key = $2
        AND used_at IS NULL AND expires_at > $3`, [tokenKey, ctx.contextKey, new Date(now)]);
      if (!rowCount) return invalidCode();
      const identity = await db.query('SELECT 1 FROM phone_identities WHERE phone_key = $1', [ctx.phoneKey]);
      if (identity.rowCount) return new PhoneError(409, '请重新验证手机号后登录。');
      // This random, unguessable legacy slot has no user-known password.
      const passwordSlot = randomBytes(16).toString('hex') + ':' + randomBytes(64).toString('hex');
      const { rows: [user] } = await db.query(`INSERT INTO users(username, password_hash, name) VALUES ($1, $2, $3)
        ON CONFLICT (username) DO NOTHING RETURNING ${publicFields}`, [username, passwordSlot, name]);
      if (!user) return new PhoneError(409, '这个朋聊号已被使用。');
      await db.query('INSERT INTO phone_identities(phone_key, user_id, verified_at) VALUES ($1, $2, $3)',
        [ctx.phoneKey, user.id, new Date(now)]);
      await invalidateOnboarding(db, ctx, now);
      return issueSession(db, user, now);
    }));
  }

  async function usage() {
    return atomic(async (db, now) => {
      const boundary = cnBoundaries(now);
      const { rows: [state] } = await db.query(
        `SELECT (SELECT enabled FROM phone_auth_control WHERE id) AS enabled,
           (SELECT count(*)::int FROM phone_captcha_checks WHERE created_at >= $1) AS captcha_checks_today,
           (SELECT EXISTS(SELECT FROM phone_budget_alerts WHERE month_start = $3)) AS monthly_warning,
           count(*) FILTER (WHERE created_at >= $1)::int AS reserved_today,
           count(*) FILTER (WHERE created_at >= $1 AND send_status = 'accepted')::int AS accepted_today,
           count(*) FILTER (WHERE created_at >= $1 AND send_status = 'rejected')::int AS rejected_today,
           count(*) FILTER (WHERE created_at >= $1 AND send_status IN ('unknown', 'reserved'))::int AS uncertain_today,
           count(*) FILTER (WHERE created_at >= $1 AND delivery_status = 'delivered')::int AS delivered_today,
           count(*) FILTER (WHERE created_at >= $1 AND verified_at IS NOT NULL)::int AS verified_today,
           coalesce(sum(greatest(reserved_micros, billed_micros)) FILTER (WHERE created_at >= $1), 0)::text AS counted_micros_today,
           coalesce(sum(billed_micros), 0)::text AS known_billed_micros_this_month,
           count(*) FILTER (WHERE billed_micros IS NULL)::int AS unpriced_attempts_this_month
         FROM phone_sms_attempts WHERE created_at >= $2`, [boundary.day, boundary.month, boundary.monthLabel]);
      return state;
    });
  }

  // Call only after a future adapter has verified the supplier's signature or fetched its authenticated API.
  async function recordReceipt({ attemptId, reference, delivery, billedMicros }) {
    if (typeof attemptId !== 'string' || !uuid.test(attemptId)
      || typeof reference !== 'string' || !reference.length || reference.length > 256
      || !['delivered', 'failed', 'unreported'].includes(delivery)
      || (billedMicros != null && (!Number.isSafeInteger(billedMicros) || billedMicros < 0))) return false;
    return atomic(async (db) => {
      const result = await db.query(`UPDATE phone_sms_attempts SET
          delivery_status = CASE WHEN $3 = 'unreported' THEN delivery_status ELSE $3 END,
          billed_micros = CASE WHEN $4::bigint IS NULL THEN billed_micros ELSE greatest(billed_micros, $4::bigint) END
        WHERE id = $1 AND send_status = 'accepted' AND provider_ref = $2
          AND (delivery_status = 'unreported' OR delivery_status = $3 OR $3 = 'unreported')`,
      [attemptId, digest('supplier-reference', reference), delivery, billedMicros ?? null]);
      return result.rowCount === 1;
    });
  }
  return { challenge, send, verify, onboard, usage, recordReceipt };
}

async function invalidateOnboarding(db, ctx, now) {
  await db.query('UPDATE phone_onboarding SET used_at = $2 WHERE phone_key = $1 AND used_at IS NULL',
    [ctx.phoneKey, new Date(now)]);
}

async function issueSession(db, user, now) {
  const token = randomBytes(32).toString('base64url');
  await db.query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
    [hexToken(token), user.id, new Date(now + 30 * DAY)]);
  return { token, user };
}
