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

  const firstCreate = statements.findIndex((statement) => statement.startsWith('CREATE '));
  assert(statements.findIndex((statement) => statement.endsWith('AS transaction_check')) < firstCreate);
  const firstGrant = statements.findIndex((statement) => statement.startsWith('GRANT '));
  const structureCheck = statements.findIndex((statement) => statement.startsWith('WITH expected('));
  assert(structureCheck > firstCreate && structureCheck < firstGrant);

  const granted = statements.filter((statement) => statement.startsWith('GRANT '));
  const expected = readFileSync(file('runtime-grants.sql'), 'utf8').trim().replace(/;$/, '').split(/;\s*/);
  assert.deepEqual(granted, expected);
  assert.equal(statements.at(-1),
    "INSERT INTO public.schema_migrations (name) VALUES ('001_initial.sql') ON CONFLICT (name) DO NOTHING");
});

test('P1 migration is flat, checks the P0 ledger, and never grants reviewer provisioning', () => {
  const generated = execFileSync(process.execPath, [fileURLToPath(file('dms-migration.mjs')), '--p1'], { encoding: 'utf8' });
  assert.equal(generated, readFileSync(file('penlia-p1-dms.sql'), 'utf8'));
  assert.doesNotMatch(generated, /\$(?:[a-zA-Z_][a-zA-Z_0-9]*)?\$/);
  const statements = generated.trim().split(';').map((statement) => statement.trim()).filter(Boolean);
  assert.equal(statements[0], 'BEGIN');
  assert.equal(statements.at(-1), 'COMMIT');
  assert.match(statements[statements.findIndex((statement) => statement.endsWith('AS p0_check'))], /003_privacy_p0\.sql/);
  for (const statement of statements.filter((step) => step.startsWith('CREATE '))) {
    assert.match(statement, /^CREATE (TABLE|(?:UNIQUE )?INDEX) IF NOT EXISTS /);
  }
  assert.deepEqual(statements.filter((step) => step.startsWith('GRANT ') && step.includes('p1_reviewers')),
    ['GRANT SELECT ON p1_reviewers TO penlia_app']);
  assert.match(statements.at(-2), /004_social_p1\.sql/);
});
