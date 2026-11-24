import assert from 'node:assert/strict';
import test from 'node:test';
import { parseQuote, readRecordId, shareSafeText, sortedRecords } from '../src/features/chat/record-model.ts';

test('chat records keep chronological order and break equal timestamps consistently', () => {
  const entries = [{ id: 'message-10', time: 1 }, { id: 'message-2', time: 1 }, { id: 'older', time: 0 }];
  assert.deepEqual(sortedRecords(entries).map(({ id }) => id), ['older', 'message-2', 'message-10']);
  assert.equal(entries[0].id, 'message-10');
});

test('structured metadata is limited and forwarding a dynamic does not copy its access ticket', () => {
  const quote = { id: 'msg-1', author: '青禾', body: '晚点见' };
  assert.deepEqual(parseQuote(JSON.stringify(quote)), quote);
  assert.equal(parseQuote(JSON.stringify({ ...quote, body: '任'.repeat(181) })), undefined);
  assert.equal(parseQuote('not JSON'), undefined);
  assert.equal(readRecordId('2d9be9f8-fbea-434a-98dc-40a7b76854ee'), '2d9be9f8-fbea-434a-98dc-40a7b76854ee');
  assert.equal(readRecordId('../2d9be9f8'), undefined);
  assert.equal(shareSafeText('来看动态 penlia://life/moment-share/3'), '[动态分享]');
  assert.equal(shareSafeText('晚点见'), '晚点见');
});
