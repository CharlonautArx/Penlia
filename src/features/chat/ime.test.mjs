import assert from 'node:assert/strict';
import { test } from 'node:test';
import { remainingImeInset } from './ime.ts';

test('IME layout leaves only the navigation inset when the keyboard is hidden or floating', () => {
  assert.equal(remainingImeInset(0, 24, 800, 800), 24);
  assert.equal(remainingImeInset(0, 0, 800, 800), 0);
});

test('IME layout fills the uncovered portion of partial or absent Android resize', () => {
  assert.equal(remainingImeInset(300, 24, 800, 800), 324);
  assert.equal(remainingImeInset(300, 24, 800, 680), 204);
});

test('IME layout avoids double lifting and follows keyboard height changes', () => {
  assert.equal(remainingImeInset(300, 24, 800, 476), 0);
  assert.equal(remainingImeInset(300, 24, 800, 465), 0);
  assert.equal(remainingImeInset(340, 24, 800, 476), 40);
});
