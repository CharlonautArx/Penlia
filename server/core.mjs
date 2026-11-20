import { createHash } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const hash = (value) => createHash('sha256').update(value).digest('hex');
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function readId(id) {
  if (typeof id !== 'string' || !uuidPattern.test(id)) throw new HttpError(400, '无效的标识。');
  return id;
}

export function cleanText(value, limit, required = false) {
  if (typeof value !== 'string') throw new HttpError(400, '请输入有效的文字。');
  const text = value.trim();
  const length = Array.from(text).length;
  if ((required && !length) || length > limit || text.includes('\0')) {
    throw new HttpError(400, '文字长度或内容无效。');
  }
  return text;
}

export async function inTransaction(pool, task) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const value = await task(db);
    await db.query('COMMIT');
    return value;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}
