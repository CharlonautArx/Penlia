import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const directory = new URL('./', import.meta.url);
const file = (name) => new URL(name, directory);

test('the download matches the generator and contains only flat migration statements', () => {
  const generated = execFileSync(process.execPath, [fileURLToPath(file('dms-migration.mjs'))], { encoding: 'utf8' });
  assert.equal(generated, readFileSync(file('penlia-dms.sql'), 'utf8'));

  const statements = generated.trim().split(';').map((statement) => statement.trim());
  assert.equal(statements.pop(), '');
  assert.equal(statements.shift(), 'BEGIN');
  assert.equal(statements.pop(), 'COMMIT');

  assert.doesNotMatch(generated, /\$(?:[a-zA-Z_][a-zA-Z_0-9]*)?\$/);
  const ddl = statements.filter((statement) => statement.startsWith('CREATE '));
  assert.equal(ddl.length, 8);
  for (const statement of ddl) {
    assert.match(statement, /^CREATE (TABLE|INDEX) IF NOT EXISTS /);
  }

  const granted = statements.filter((statement) => statement.startsWith('GRANT '));
  const expected = readFileSync(file('runtime-grants.sql'), 'utf8').trim().replace(/;$/, '').split(/;\s*/);
  assert.deepEqual(granted, expected);
  assert.equal(statements.at(-1),
    "INSERT INTO public.schema_migrations (name) VALUES ('001_initial.sql') ON CONFLICT (name) DO NOTHING");
});
