import { readFileSync } from 'node:fs';
import pg from 'pg';

const useTls = process.env.PG_TLS !== 'disable';
const caFile = process.env.PGSSLROOTCERT;
const ca = useTls && caFile ? readFileSync(caFile) : process.env.PG_CA_PEM || undefined;
export const pool = new pg.Pool({
  application_name: 'penlia-api',
  options: '-c search_path=public,pg_catalog',
  max: 4,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 10000,
  statement_timeout: 5000,
  ssl: useTls ? { rejectUnauthorized: true, ca } : false,
});
pool.on('error', () => console.error('Idle PostgreSQL connection failed'));

export async function checkDatabase() {
  const { rows: [state] } = await pool.query(`
    SELECT EXISTS (SELECT FROM pg_stat_ssl WHERE pid = pg_backend_pid() AND ssl)
      AND has_table_privilege('public.users', 'SELECT')
      AND has_table_privilege('public.users', 'INSERT')
      AND has_table_privilege('public.users', 'UPDATE')
      AND has_table_privilege('public.sessions', 'SELECT')
      AND has_table_privilege('public.sessions', 'INSERT')
      AND has_table_privilege('public.sessions', 'DELETE')
      AND has_table_privilege('public.friendships', 'SELECT')
      AND has_table_privilege('public.friendships', 'INSERT')
      AND has_table_privilege('public.friendships', 'UPDATE')
      AND has_table_privilege('public.rate_limits', 'SELECT')
      AND has_table_privilege('public.rate_limits', 'INSERT')
      AND has_table_privilege('public.rate_limits', 'UPDATE')
      AS ready`);
  return state.ready;
}
