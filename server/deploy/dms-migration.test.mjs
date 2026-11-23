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

test('P1 follow-up migration gates the one-time schedule correction and creates scoped evidence grants', () => {
  const generated = execFileSync(process.execPath, [fileURLToPath(file('dms-migration.mjs')), '--p1-followup'], {
    encoding: 'utf8',
  });
  assert.equal(generated, readFileSync(file('penlia-p1-followup-dms.sql'), 'utf8'));
  assert.doesNotMatch(generated, /\$(?:[a-zA-Z_][a-zA-Z_0-9]*)?\$/);
  const statements = generated.trim().split(';').map((statement) => statement.trim()).filter(Boolean);
  assert.equal(statements[0], 'BEGIN');
  assert.equal(statements.at(-1), 'COMMIT');
  assert.match(statements.find((step) => step.endsWith('AS p1_check')), /004_social_p1\.sql/);
  const repairs = statements.filter((step) => step.startsWith('UPDATE'));
  assert.equal(repairs.length, 1);
  assert.match(repairs[0], /r\.decided_at\+make_interval/);
  assert.match(repairs[0], /e\.applied_at IS NULL AND e\.overturned_at IS NULL/);
  assert.match(repairs[0], /NOT EXISTS\(SELECT 1 FROM schema_migrations WHERE name='005_p1_privacy_followup\.sql'\)/);
  assert.equal(statements.find((step) => step.startsWith('GRANT') && step.includes('p1_report_media')),
    'GRANT SELECT, INSERT ON p1_report_media TO penlia_app');
  assert.match(statements.at(-2), /005_p1_privacy_followup\.sql/);
});

test('P2 flat increment checks the accepted P1 follow-up and preserves earlier scripts', () => {
  const generated = execFileSync(process.execPath, [fileURLToPath(file('dms-migration.mjs')), '--p2'], { encoding: 'utf8' });
  assert.equal(generated, readFileSync(file('penlia-p2-dms.sql'), 'utf8'));
  assert.doesNotMatch(generated, /\$(?:[a-zA-Z_][a-zA-Z_0-9]*)?\$/);
  const statements = generated.trim().split(';').map((s) => s.trim()).filter(Boolean);
  assert.equal(statements[0], 'BEGIN');
  assert.equal(statements.at(-1), 'COMMIT');
  assert.match(statements.find((step) => step.endsWith('AS p1_followup_check')), /005_p1_privacy_followup\.sql/);
  const creates=statements.filter((step)=>step.startsWith('CREATE'));
  assert(creates.length>20);
  for(const create of creates)assert.match(create,/^CREATE (?:TABLE|(?:UNIQUE )?INDEX) IF NOT EXISTS /);
  assert.match(statements.at(-2), /006_life_p2\.sql/);
});

test('P2 follow-up checks the 006 ledger before changing coordinates, without expanding grants', () => {
  const generated = execFileSync(process.execPath, [fileURLToPath(file('dms-migration.mjs')), '--p2-followup'], {
    encoding: 'utf8',
  });
  assert.equal(generated, readFileSync(file('penlia-p2-followup-dms.sql'), 'utf8'));
  assert.doesNotMatch(generated, /\$(?:[a-zA-Z_][a-zA-Z_0-9]*)?\$/);
  assert.doesNotMatch(generated, /(^|\n)GRANT /);
  const statements = generated.trim().split(';').map((step) => step.trim()).filter(Boolean);
  assert.equal(statements[0], 'BEGIN');
  assert.match(statements.find((step) => step.endsWith('AS p2_check')), /006_life_p2\.sql/);
  const ddl = statements.filter((step) => step.startsWith('ALTER TABLE'));
  assert.equal(ddl.length, 4);
  assert.ok(statements.indexOf(ddl[0]) > statements.findIndex((step) => step.endsWith('AS p2_check')));
  assert.match(statements.at(-2), /007_p2_life_followup\.sql/);
  assert.equal(statements.at(-1), 'COMMIT');
});

test('P3 flat DMS release requires 007 and limits the runtime role to scoped data writes', () => {
  const output = execFileSync(process.execPath, [fileURLToPath(file('dms-migration.mjs')), '--p3'], { encoding:'utf8' });
  assert.equal(output, readFileSync(file('penlia-p3-dms.sql'),'utf8'));
  assert.doesNotMatch(output, /\$(?:[a-zA-Z_][a-zA-Z_0-9]*)?\$/);
  const steps = output.trim().split(';').map((line) => line.trim()).filter(Boolean);
  assert.equal(steps[0], 'BEGIN');
  assert.equal(steps.at(-1), 'COMMIT');
  assert.match(steps.at(-2), /008_shared_world_p3\.sql/);
  assert.ok(steps.findIndex((line) => line.includes('007_p2_life_followup.sql')) < steps.findIndex((line) => line.startsWith('CREATE TABLE IF NOT EXISTS p3_spaces')));
  assert.deepEqual(steps.filter((line) => line.startsWith('GRANT')), [
    'GRANT SELECT, INSERT, UPDATE ON p3_spaces, p3_members TO penlia_app',
    'GRANT SELECT, INSERT, UPDATE ON p3_records TO penlia_app',
    'GRANT SELECT, INSERT, DELETE ON p3_record_viewers, p3_media TO penlia_app',
  ]);
});

test('009 DMS script replays after P3 and does not rewrite existing expiry values', () => {
  const generated = execFileSync(process.execPath, [fileURLToPath(file('dms-migration.mjs')), '--unified-moments'], { encoding: 'utf8' });
  assert.equal(generated, readFileSync(new URL('./penlia-unified-moments-dms.sql', import.meta.url), 'utf8'));
  assert.match(generated, /008_shared_world_p3\.sql/);
  assert.match(generated, /expires_at DROP NOT NULL/);
  assert.match(generated, /ADD COLUMN IF NOT EXISTS pinned/);
  assert.doesNotMatch(generated, /UPDATE p2_status|GRANT ALL|GRANT SELECT, INSERT, DELETE ON public.moment_comments/i);
});

test('011 DMS script checks the preceding migration and grants only scoped interaction access', () => {
  const generated = execFileSync(process.execPath, [fileURLToPath(file('dms-migration.mjs')), '--moment-interactions'], {
    encoding: 'utf8',
  });
  const steps = generated.trim().split(';').map((step) => step.trim()).filter(Boolean);
  assert.equal(steps[0], 'BEGIN');
  assert.equal(steps.at(-1), 'COMMIT');
  assert.match(steps.find((step) => step.endsWith('AS profile_covers_check')), /010_friend_profile_covers\.sql/);
  assert.ok(steps.filter((step) => step.startsWith('CREATE')).every((step) => step.includes('IF NOT EXISTS')));
  assert.deepEqual(steps.filter((step) => step.startsWith('GRANT')), [
    'GRANT SELECT, INSERT, UPDATE ON public.moment_forward_requests TO penlia_app',
    'GRANT SELECT, INSERT, UPDATE, DELETE ON public.moment_chat_shares TO penlia_app',
    'GRANT SELECT, INSERT, UPDATE ON public.moment_notifications TO penlia_app',
  ]);
  assert.match(steps.at(-2), /011_moment_interactions\.sql/);
});
