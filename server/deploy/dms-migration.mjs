import { readFile } from 'node:fs/promises';
import { readMigrations } from '../migration-files.mjs';

const migrations = await readMigrations();
const grants = (await readFile(new URL('./runtime-grants.sql', import.meta.url), 'utf8')).trim();

function repeatableCreates({ name, sql }) {
  // The DMS console must be able to split this script at each semicolon.
  // Replaying other kinds of migrations requires a separate DMS strategy.
  const statements = sql.trim().split(';');
  if (statements.pop() !== '' || statements.length === 0) {
    throw new Error(`${name} must contain semicolon-terminated DMS statements`);
  }
  return statements.map((statement) => {
    const ddl = statement.trim();
    const create = /^CREATE (TABLE|INDEX) ([a-z_][a-z0-9_]*)\b/.exec(ddl);
    if (!create || ddl.includes('$$') || /\$[a-zA-Z_][a-zA-Z_0-9]*\$/.test(ddl)) {
      throw new Error(`${name} contains a statement that cannot be safely replayed by DMS`);
    }
    return ddl.replace(create[0], `CREATE ${create[1]} IF NOT EXISTS ${create[2]}`) + ';';
  });
}

const steps = [
  'BEGIN;',
  "SELECT CASE WHEN current_database() = 'penlia_dev' THEN '1' ELSE 'Select penlia_dev before running this migration' END::integer AS target_database_check;",
  'SET LOCAL search_path TO public, pg_catalog;',
  "SET LOCAL lock_timeout = '10s';",
  'SELECT pg_advisory_xact_lock(182129779);',
  'CREATE TABLE IF NOT EXISTS public.schema_migrations (name text PRIMARY KEY);',
  ...migrations.flatMap(repeatableCreates),
  grants,
  ...migrations.map(({ name }) =>
    `INSERT INTO public.schema_migrations (name) VALUES ('${name}') ON CONFLICT (name) DO NOTHING;`),
  'COMMIT;',
];
console.log(steps.join('\n\n'));
