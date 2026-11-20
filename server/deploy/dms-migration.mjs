import { readFile } from 'node:fs/promises';
import { readMigrations } from '../migration-files.mjs';

const followup = process.argv.includes('--p1-followup');
const p1 = process.argv.includes('--p1');
const p0 = process.argv.includes('--p0');
const migrations = (await readMigrations()).filter(({ name }) => name === (followup ? '005_p1_privacy_followup.sql' : p1 ? '004_social_p1.sql' : p0 ? '003_privacy_p0.sql' : '001_initial.sql'));
if (migrations.length !== 1) throw new Error('Expected one DMS migration');
const grants = (await readFile(new URL(followup ? '../p1/followup-grants.sql' : p1 ? '../p1/grants.sql' : p0 ? '../p0/grants.sql' : './runtime-grants.sql', import.meta.url), 'utf8')).trim();
const schemaCheck = (await readFile(new URL('./dms-schema-check.sql', import.meta.url), 'utf8')).trim();

function repeatableCreates({ name, sql }) {
  // The DMS console must be able to split this script at each semicolon.
  // Replaying other kinds of migrations requires a separate DMS strategy.
  const statements = sql.trim().split(';');
  if (statements.pop() !== '' || statements.length === 0) {
    throw new Error(`${name} must contain semicolon-terminated DMS statements`);
  }
  return statements.map((statement) => {
    const ddl = statement.trim();
    const create = /^CREATE (TABLE|(?:UNIQUE )?INDEX) ([a-z_][a-z0-9_]*)\b/.exec(ddl);
    if (ddl.includes('$$') || /\$[a-zA-Z_][a-zA-Z_0-9]*\$/.test(ddl)) {
      throw new Error(`${name} contains a procedural SQL statement`);
    }
    if (followup && ddl.startsWith('UPDATE p1_enforcement AS e\n') &&
      ddl.endsWith("AND NOT EXISTS(SELECT 1 FROM schema_migrations WHERE name='005_p1_privacy_followup.sql')")) {
      return ddl + ';';
    }
    if (!create) {
      throw new Error(`${name} contains a statement that cannot be safely replayed by DMS`);
    }
    return ddl.replace(create[0], `CREATE ${create[1]} IF NOT EXISTS ${create[2]}`) + ';';
  });
}

const steps = [
  'BEGIN;',
  "SELECT CASE WHEN current_database() = 'penlia_dev' THEN '1' ELSE 'Select penlia_dev before running this migration' END::integer AS target_database_check;",
  "SET LOCAL penlia.dms_migration = 'active';",
  "SELECT CASE WHEN current_setting('penlia.dms_migration', true) = 'active' THEN '1' ELSE 'Execute the entire script in one database transaction' END::integer AS transaction_check;",
  'SET LOCAL search_path TO public, pg_catalog;',
  "SET LOCAL lock_timeout = '10s';",
  'SELECT pg_advisory_xact_lock(182129779);',
  'CREATE TABLE IF NOT EXISTS public.schema_migrations (name text PRIMARY KEY);',
  ...(p0 ? ["SELECT CASE WHEN EXISTS (SELECT 1 FROM public.schema_migrations WHERE name = '001_initial.sql') THEN '1' ELSE 'Apply the original Penlia migration first' END::integer AS baseline_check;"] : []),
  ...(p1 ? ["SELECT CASE WHEN EXISTS (SELECT 1 FROM public.schema_migrations WHERE name = '003_privacy_p0.sql') THEN '1' ELSE 'Apply the Penlia P0 migration first' END::integer AS p0_check;"] : []),
  ...(followup ? ["SELECT CASE WHEN EXISTS (SELECT 1 FROM public.schema_migrations WHERE name = '004_social_p1.sql') THEN '1' ELSE 'Apply the first Penlia P1 migration' END::integer AS p1_check;"] : []),
  ...migrations.flatMap(repeatableCreates),
  ...(!p0 && !p1 && !followup ? [schemaCheck] : []),
  grants,
  ...migrations.map(({ name }) =>
    `INSERT INTO public.schema_migrations (name) VALUES ('${name}') ON CONFLICT (name) DO NOTHING;`),
  'COMMIT;',
];
console.log(steps.join('\n\n'));
