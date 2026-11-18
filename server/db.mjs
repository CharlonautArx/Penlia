import pg from 'pg';

const useTls = process.env.PG_TLS !== 'disable';
export const pool = new pg.Pool({
  max: 4,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 10000,
  statement_timeout: 5000,
  ssl: useTls ? { rejectUnauthorized: true, ca: process.env.PG_CA_PEM || undefined } : false,
});
pool.on('error', () => console.error('Idle PostgreSQL connection failed'));
