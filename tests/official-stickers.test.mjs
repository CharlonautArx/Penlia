import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { encodeStickerDraft, stickerShortcode } from '../src/features/stickers/draft.ts';
import { clipStickerText, makeStickerToken, splitStickerMessage } from '../src/features/stickers/wire.ts';

test('the catalog has all 84 distinct transparent assets in source order within each section', () => {
  const source = readFileSync(new URL('../src/features/stickers/official.ts', import.meta.url), 'utf8');
  const files = new URL('../assets/stickers/official/', import.meta.url);
  const entries = [...source.matchAll(/id: '(r\d{2}s\d{2})', label: '([^']+)', category: '(faces|other)'/g)];
  assert.equal(entries.length, 84);
  assert.equal(new Set(entries.map((entry) => entry[1])).size, 84);
  assert.equal(new Set(entries.map((entry) => entry[2])).size, 84);
  assert.deepEqual(entries.map((entry) => entry[3]), [...Array(67).fill('faces'), ...Array(17).fill('other')]);
  const names = entries.map((entry) => entry[1] + '.png');
  assert.deepEqual(readdirSync(files).sort(), names.sort());
  for (const category of ['faces', 'other']) {
    const ids = entries.filter((entry) => entry[3] === category).map((entry) => entry[1]);
    assert.deepEqual(ids, [...ids].sort());
  }
  for (const name of names) {
    const png = readFileSync(new URL(name, files));
    assert.equal(png.readUInt32BE(16), 112);
    assert.equal(png.readUInt32BE(20), 112);
    assert.equal(png[25], 6, name);
  }
});

test('editing readable sticker labels keeps Unicode emoji and stores IDs independent of catalog order', () => {
  const mappings = new Map([['大哭', 'r01s01'], ['微笑', 'r04s01']]);
  const draft = '你好📸' + stickerShortcode('微笑') + stickerShortcode('大哭') + '［备注］';
  const encoded = encodeStickerDraft(draft, mappings, 'penlia-classic');
  assert.equal(encoded, '你好📸〔表情:penlia-classic/r04s01〕〔表情:penlia-classic/r01s01〕［备注］');
  assert.equal(encodeStickerDraft(draft, new Map([...mappings].reverse()), 'penlia-classic'), encoded);
  const token = makeStickerToken('penlia-classic', 'r01s01');
  const clipped = clipStickerText('聊天' + token + token, 2 + token.length * 2 - 1);
  assert.equal(clipped, '聊天' + token);
  assert.equal(splitStickerMessage(clipped).length, 2);
});
