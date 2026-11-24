import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lookupKeys, reconcileEntries, timelineRows } from '../src/features/moments/timeline.ts';

const legacy = (id, at, patch = {}) => ({ id, at, ownerId: 'me', kind: 'thought', ...patch });
const cloud = (id, at, patch = {}) => ({ id, createdAt: new Date(at).toISOString(), authorId: 'me', ...patch });
const ids = (rows) => rows.map((r) => r.entry?.id ?? r.moment.id);

test('all owner pins precede unpinned posts including legacy records, across page boundaries', () => {
  const entries = [legacy('p', 900, { pinned: true }), legacy('new', 800), legacy('old', 10)];
  const page = Array.from({ length: 26 }, (_, i) => cloud('c' + i, 700 - i, { pinned: true }));
  assert.deepEqual(ids(timelineRows(page, entries, 'me', true)), ['p', ...page.map((m) => m.id)]);
  assert.deepEqual(ids(timelineRows([...page, cloud('middle', 100)], entries, 'me')),
    ['p', ...page.map((m) => m.id), 'new', 'middle', 'old']);
});

test('owner matching suppresses migrated copies after deletion or permission changes, without matching content', () => {
  const clientId = 'bbbbbbbb-0000-4000-8000-000000000000';
  const id = 'aaaaaaaa-0000-4000-8000-000000000000';
  const source = [legacy('old', 10, { clientId, text: 'identical' }), legacy('independent', 10, { text: 'identical' }),
    legacy('other', 10, { ownerId: 'someone', clientId }), legacy('journal', 20, { kind: 'journal' })];
  const server = cloud(id, 20, { clientId });
  assert.deepEqual(lookupKeys(source, 'me'), [clientId]);
  assert.deepEqual(ids(timelineRows([server], source, 'me')), [id, 'independent']);
  const linked = reconcileEntries(source, 'me', [server]);
  assert.equal(linked[0].cloudId, id);
  assert.equal(linked[2].cloudId, undefined);
  assert.deepEqual(ids(timelineRows([], linked, 'me')), ['independent']);
  assert.equal(reconcileEntries(linked, 'me', [server]), linked);
  assert.deepEqual(ids(timelineRows([server, server], source)), [id]);
});

test('duplicate archive IDs retain the latest edit; own filters exclude other authors and journals', () => {
  const old = legacy('a', 100);
  const edited = { ...old, editedAt: 200 };
  const rows = timelineRows([cloud('other', 400, { authorId: 'other' })], [old, edited, legacy('j', 250, { kind: 'journal' })], 'me');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].entry, edited);
});
