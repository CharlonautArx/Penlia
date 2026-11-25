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

export async function assertProductionDatabase() {
  const { rows: [state] } = await pool.query(`
    SELECT current_database() = $1 AND current_user = $2
      AND EXISTS (SELECT FROM pg_stat_ssl WHERE pid=pg_backend_pid() AND ssl)
      AND NOT has_schema_privilege(current_user, 'public', 'CREATE')
      AND NOT has_database_privilege(current_user, current_database(), 'CREATE')
      AND NOT EXISTS (SELECT FROM pg_roles r
        WHERE (r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls
          OR r.rolname IN ('pg_read_all_data','pg_write_all_data','pg_read_server_files','pg_write_server_files','pg_execute_server_program'))
          AND pg_has_role(r.oid, 'MEMBER'))
      AND NOT EXISTS (SELECT FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname='public' AND c.relkind IN ('r','p') AND pg_has_role(c.relowner, 'MEMBER'))
      AS ready`, [process.env.PGDATABASE, process.env.PGUSER]);
  if (!state?.ready) throw new Error('Unsafe PostgreSQL application role');
}

export async function checkDatabase() {
  const { rows: [state] } = await pool.query(`
    SELECT EXISTS (SELECT FROM pg_stat_ssl WHERE pid = pg_backend_pid() AND ssl) AS tls,
      has_table_privilege('public.users', 'SELECT')
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
  return { ready: state.ready && state.tls === useTls, tls: state.tls };
}
