import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fontSizes, effectiveFontScale, readFontSize } from '../src/font-scale.ts';
import { calendarMonths, indexHistory, localDay } from '../src/features/chat/search-index.ts';
import { applyRecalls, canRecall, recalledCaption } from '../src/features/chat/recall-model.ts';
import { setConversationPreference } from '../src/features/chat/conversation-preferences.ts';

test('four type settings preserve the regular baseline and respect a larger system setting once', () => {
  assert.deepEqual(fontSizes.map(({ scale }) => scale), [0.9, 1, 1.15, 1.3]);
  for (const [index, entry] of fontSizes.entries()) assert.equal(effectiveFontScale(index, 1), entry.scale);
  assert.equal(effectiveFontScale(3, 1.45), 1.45);
  assert.equal(effectiveFontScale(3, 1.15), 1.3);
  assert.equal(effectiveFontScale(0, 1.05), 1.05);
  assert.equal(readFontSize(17), 1);
});

test('calendar uses local days, includes empty months and opens the first message of a populated day', () => {
  const first = new Date(2025, 11, 31, 0, 0).getTime();
  const last = new Date(2026, 1, 1, 12, 0).getTime();
  const index = indexHistory([
    { id: 'latest', timestamp: last, kind: 'text', caption: '晚一点 🤍' },
    { id: 'early', timestamp: last - 30 * 60_000, kind: 'sticker', caption: '🤍' },
    { id: 'old', timestamp: first, kind: 'file', caption: 'ＰＥＮＬＩＡ.PDF' },
  ]);
  assert.deepEqual(calendarMonths(first, last).map((month) => month.key), ['2026-02', '2026-01', '2025-12']);
  assert.equal(localDay(first), '2025-12-31');
  assert.equal(index.dates.get('2026-02-01').id, 'early');
  assert.equal(index.dates.has('2026-01-01'), false);
  assert.deepEqual(index.matching('', 'sticker').map(({ id }) => id), ['early']);
  assert.deepEqual(index.matching('penlia', 'file').map(({ id }) => id), ['old']);
});

test('the sender window ends at exactly 120s and stale history cannot resurrect a recall', () => {
  const sent = 1_000_000;
  assert.equal(canRecall(true, sent, sent + 119_999), true);
  assert.equal(canRecall(true, sent, sent + 120_000), false);
  assert.equal(canRecall(false, sent, sent + 1), false);
  assert.equal(canRecall(true, sent, sent - 1), false);
  const old = { id: 'old', mine: true, timestamp: sent, text: 'private contents' };
  const markers = { old: { id: 'old', mine: true, timestamp: sent } };
  assert.equal(recalledCaption(false), '对方撤回了一条消息');
  assert.deepEqual(applyRecalls([old], markers, new Set()), [{ ...markers.old, kind: 'recalled' }]);
  assert.deepEqual(applyRecalls([old], markers, new Set(['old'])), []);
});

test('chat settings preserve pin, visibility and preferences in every other conversation', () => {
  const initial = { first: { pinned: true, hidden: true }, second: { manualUnread: true } };
  const next = setConversationPreference(initial, 'first', { muted: true, priority: true });
  assert.equal(next.second, initial.second);
  assert.equal(next.first.pinned, true);
  assert.equal(next.first.hidden, true);
  assert.equal(next.first.muted, true);
  assert.equal(next.first.priority, true);
  assert.equal(setConversationPreference(next, 'first', { muted: false }).first.priority, true);
});
