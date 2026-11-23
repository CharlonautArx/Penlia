import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assignBackground, blankBackgrounds, chatBackground, pictureFrame, readBackgrounds, usedFiles } from '../src/features/chat/background/model.ts';

const photo = { file: '11111111-1111-4111-8111-111111111111.jpg', width: 1200, height: 800, x: 0.25, y: 0.5 };
const second = { ...photo, file: '22222222-2222-4222-8222-222222222222.jpg' };

test('peer override, explicit white, inheritance and all-chat reset resolve independently', () => {
  let state = blankBackgrounds();
  assert.equal(chatBackground(state, 'friend'), undefined);
  state = assignBackground(state, undefined, photo);
  state = assignBackground(state, 'friend', second);
  assert.deepEqual(chatBackground(state, 'friend'), second);
  assert.deepEqual(chatBackground(state, 'other'), photo);
  assert.deepEqual(chatBackground(state), photo);
  state = assignBackground(state, 'friend', null);
  assert.equal(chatBackground(state, 'friend'), undefined);
  state = assignBackground(state, 'friend', undefined);
  assert.deepEqual(chatBackground(state, 'friend'), photo);
  state = assignBackground(state, 'friend', second);
  state = assignBackground(state, undefined, undefined);
  assert.equal(chatBackground(state, 'other'), undefined);
  assert.deepEqual(chatBackground(state, 'friend'), second);
});

test('files remain protected while any scope references them and settings round-trip', () => {
  let state = assignBackground(blankBackgrounds(), undefined, photo);
  state = assignBackground(state, 'friend', photo);
  state = assignBackground(state, 'second', null);
  assert.deepEqual(readBackgrounds(JSON.stringify(state)), state);
  state = assignBackground(state, undefined, second);
  assert.deepEqual([...usedFiles(state)], [second.file, photo.file]);
  state = assignBackground(state, 'friend', undefined);
  assert.deepEqual([...usedFiles(state)], [second.file]);
  assert.throws(() => readBackgrounds(JSON.stringify({ peers: {}, global: { ...photo, file: '../private.jpg' } })));
});

test('crop fills both orientations without stretching and maps normalized drag offsets', () => {
  assert.deepEqual(pictureFrame(photo, 300, 600), { width: 900, height: 600, left: -150, top: 0 });
  assert.deepEqual(pictureFrame({ ...photo, y: 1 }, 600, 250), { width: 600, height: 400, left: 0, top: -150 });
});
