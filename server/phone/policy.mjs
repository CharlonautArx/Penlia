import { createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const CODE_ERRORS = 5;
export const SMS_COOLDOWN = 90_000;
export const BASE_LIMITS = Object.freeze({
  phoneHour: 3,
  phoneDay: 5,
  ipHour: 15,
  ipDistinct: 10,
  deviceHour: 6,
  deviceDistinct: 3,
  burst: 10,
  dailyCount: 60,
  dailyMicros: 3_000_000,
  unitMicros: 50_000,
  monthlyWarningMicros: 30_000_000,
  captchaDailyChecks: 100,
  challengeDailyCount: 150,
});

export class PhoneError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const unavailable = () => new PhoneError(503, '手机号验证暂不可用，请稍后再试。');
export const tooMany = () => new PhoneError(429, '请求过于频繁，请稍后再试。');
export const invalidProof = () => new PhoneError(403, '安全验证无效，请刷新后重试。');
export const invalidCode = () => new PhoneError(400, '验证码不正确或已失效。');

export function validatedLimits(overrides = {}) {
  const limits = { ...BASE_LIMITS, ...overrides };
  for (const name of Object.keys(BASE_LIMITS)) {
    if (!Number.isSafeInteger(limits[name]) || limits[name] < 1) throw new Error('Invalid positive phone limit: ' + name);
  }
  return Object.freeze(limits);
}

export function keyedDigest(secret, kind, ...values) {
  return createHmac('sha256', secret).update(JSON.stringify([kind, ...values])).digest('hex');
}

export function equalDigest(left, right) {
  return typeof left === 'string' && left.length === right.length && timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function ipRange(address) {
  if (typeof address !== 'string') return undefined;
  const clean = address.toLowerCase().replace(/^::ffff:(?=\d+\.)/, '');
  if (isIP(clean) === 4) return clean;
  if (isIP(clean) !== 6 || clean.includes('%')) return undefined;
  const normal = new URL('http://[' + clean + ']/').hostname.slice(1, -1);
  const mapped = /^::ffff:([a-f0-9]+):([a-f0-9]+)$/.exec(normal);
  if (mapped) return mapped.slice(1).flatMap((part) => {
    const address = Number.parseInt(part, 16);
    return [address >>> 8, address & 255];
  }).join('.');
  const [prefix, suffix] = normal.split('::');
  const groups = prefix ? prefix.split(':') : [];
  if (suffix !== undefined) {
    const ending = suffix ? suffix.split(':') : [];
    groups.push(...Array(8 - groups.length - ending.length).fill('0'), ...ending);
  }
  return groups.slice(0, 4).join(':') + '::/64';
}

export function requestContext(secret, input, meta) {
  if (typeof input.phone !== 'string' || !/^\+861[3-9]\d{9}$/.test(input.phone)) {
    throw new PhoneError(400, '请输入有效的中国大陆手机号。');
  }
  if (typeof input.deviceId !== 'string' || !/^[A-Za-z0-9_-]{22,86}$/.test(input.deviceId)) {
    throw new PhoneError(400, '验证会话无效，请重新打开页面。');
  }
  const address = ipRange(meta.sourceIp);
  if (!address) throw unavailable();
  if (!['access', 'bind'].includes(meta.purpose) || (meta.purpose === 'bind' && !meta.userId)) throw unavailable();
  const phoneKey = keyedDigest(secret, 'phone', input.phone);
  const ipKey = keyedDigest(secret, 'ip-range', address);
  const deviceKey = keyedDigest(secret, 'device', input.deviceId);
  return {
    phoneKey, ipKey, deviceKey,
    contextKey: keyedDigest(secret, 'context', meta.purpose, meta.userId ?? '', phoneKey, ipKey, deviceKey),
  };
}

export function cnBoundaries(now) {
  const offset = 8 * HOUR;
  const date = new Date(now + offset);
  const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - offset;
  const month = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) - offset;
  return { day: new Date(day), month: new Date(month), monthLabel: date.toISOString().slice(0, 7) + '-01' };
}
