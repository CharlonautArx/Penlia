import assert from 'node:assert/strict';
import test from 'node:test';

import { audienceAllows, canSeeEntry, defaultPrivacy, selectableAudience } from '../src/features/space/model.ts';
import { confirmName, creditConversation, emptyPet, feedPet, foods, proposeName } from '../src/features/pet/model.ts';

const owner = 'owner';
const now = Date.UTC(2026, 10, 19, 8);
const day = 86_400_000;

test('audiences authorize only accepted friends selected by the rule', () => {
  for (const [mode, ids, visible] of [
    ['friends', [], ['a', 'b']],
    ['self', [], []],
    ['allow', ['a'], ['a']],
    ['deny', ['a'], ['b']],
  ]) {
    const audience = { mode, ids };
    assert.equal(audienceAllows(audience, owner, owner, false), true);
    assert.deepEqual(['a', 'b'].filter((friend) => audienceAllows(audience, owner, friend, true)), visible);
    assert.equal(audienceAllows(audience, owner, 'a', false), false);
  }
  assert.deepEqual(
    selectableAudience({ mode: 'allow', ids: ['a', 'unknown', 'a'] }, ['a', 'b']),
    { mode: 'allow', ids: ['a'] },
  );
});

test('entry scope, space access and history all apply to a friend viewing a post', () => {
  const entry = { ownerId: owner, at: now - 12 * day, audience: { mode: 'allow', ids: ['a'] } };
  const settings = defaultPrivacy();
  assert.equal(canSeeEntry(entry, settings, 'a', true, now), true);
  assert.equal(canSeeEntry(entry, settings, 'b', true, now), false);
  assert.equal(canSeeEntry(entry, { ...settings, history: '3d' }, 'a', true, now), false);
  assert.equal(canSeeEntry(entry, { ...settings, history: '180d' }, 'a', true, now), true);
  const closed = { ...settings, history: '3d', access: { mode: 'deny', ids: ['a'] } };
  assert.equal(canSeeEntry({ ...entry, at: now }, closed, 'a', true, now), false);
  assert.equal(canSeeEntry(entry, closed, owner, false, now), true);
});

test('a pending name or rename needs confirmation by the other participant', () => {
  const proposal = proposeName(emptyPet(), '小满', now);
  assert.equal(confirmName(proposal, now, false), proposal);
  assert.equal(proposal.name, undefined);
  const pet = confirmName(proposal, now, true);
  assert.equal(pet.name, '小满');
  const renamed = proposeName(pet, '小澄', now);
  assert.equal(renamed.name, '小满');
  assert.equal(confirmName(renamed, now, true).name, '小澄');
});

test('pet energy comes from a two-sided exchange, and replay does not add energy', () => {
  const pet = confirmName(proposeName(emptyPet(), '云团', now), now, true);
  const a = { id: 'simulated-1', mine: true, timestamp: now, text: '你好' };
  const b = { ...a, id: 'simulated-2' };
  const later = { id: 'simulated-3', mine: false, timestamp: now + 7 * day, text: '见面聊' };
  const waiting = creditConversation(pet, [a, b]);
  assert.equal(waiting.energy, 0);
  assert.equal(waiting.vitality, pet.vitality);
  const played = creditConversation(waiting, [a, b, later]);
  assert.equal(played.energy, 4);
  assert.equal(played.vitality, 47);
  assert.equal(creditConversation(played, [a, b, later]), played);
  assert.equal(creditConversation(played, []), played);
  assert.equal(feedPet(played, foods[1], now), played);
  const fed = feedPet(played, foods[0], now);
  assert.equal(fed.energy, 0);
  assert.equal(fed.vitality, 53);
  assert.equal(fed.last.label, '奶茶');
});
