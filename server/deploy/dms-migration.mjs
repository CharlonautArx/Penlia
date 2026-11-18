import { readFile } from 'node:fs/promises';
import { readMigrations } from '../migration-files.mjs';

const blocks = await readMigrations();
const grants = (await readFile(new URL('./runtime-grants.sql', import.meta.url), 'utf8')).trim();

const steps = [
  'BEGIN;',
  'SET LOCAL search_path TO public, pg_catalog;',
  'SELECT pg_advisory_xact_lock(182129779);',
  'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY);',
  ...blocks.map(({ name, sql }) => `DO $penlia_migration$
BEGIN
  IF NOT EXISTS (SELECT FROM schema_migrations WHERE name = '${name}') THEN
${sql.trim().split('\n').map((line) => line && '    ' + line).join('\n')}
    INSERT INTO schema_migrations (name) VALUES ('${name}');
  END IF;
END;
$penlia_migration$;`),
  grants,
  'COMMIT;',
];
console.log(steps.join('\n\n'));
