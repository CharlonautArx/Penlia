import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  conversationAppearance, conversationMatches, orderConversations, setConversationPreference,
} from '../src/features/chat/conversation-preferences.ts';

test('pinned and unpinned conversations each sort by the latest message without altering it', () => {
  const rows = [
    { person: { userId: 'c' }, pinned: true, last: { id: '1', timestamp: 100 } },
    { person: { userId: 'b' }, pinned: false, last: { id: '2', timestamp: 300 } },
    { person: { userId: 'd' }, pinned: true, last: { id: '3', timestamp: 200 } },
    { person: { userId: 'a' }, pinned: false, last: { id: '4', timestamp: 300 } },
  ];
  assert.deepEqual(orderConversations(rows).map((r) => r.person.userId), ['d', 'c', 'a', 'b']);
  assert.deepEqual(rows.map((r) => r.last.timestamp), [100, 300, 200, 300]);
  assert.equal(conversationAppearance(undefined, true).pinned, true);
  assert.equal(conversationAppearance({ pinned: false }, true).pinned, false);
});

test('hiding is independent, persists across a new latest message and can be reversed from search', () => {
  let state = setConversationPreference({}, 'peer', { pinned: true, manualUnread: true, hidden: true });
  state = JSON.parse(JSON.stringify(state));
  const hidden = conversationAppearance(state.peer).hidden;
  assert.equal(conversationMatches(['阿竹', '新到的消息'], '', hidden), false);
  assert.equal(conversationMatches(['阿竹', '新到的消息'], '阿竹', hidden), true);
  assert.equal(conversationMatches(['阿竹', '新到的消息'], '新到的消息', hidden), true);
  state = setConversationPreference(state, 'peer', { hidden: false, manualUnread: false });
  assert.deepEqual(conversationAppearance(state.peer), { pinned: true, hidden: false, manualUnread: false });
  assert.equal(conversationMatches(['阿竹'], '', false), true);
  assert.equal(setConversationPreference(state, 'other', { manualUnread: false }), state);
});

test('reading a manually marked conversation leaves pinning, hidden state and other threads intact', () => {
  const original = { one: { manualUnread: true, hidden: true }, two: { pinned: true, manualUnread: true } };
  const state = setConversationPreference(original, 'one', { manualUnread: false });
  assert.deepEqual(conversationAppearance(state.one), { pinned: false, hidden: true, manualUnread: false });
  assert.equal(state.two, original.two);
  assert.equal(original.one.manualUnread, true);
});
