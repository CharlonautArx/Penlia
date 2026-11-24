import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centered, cropRect } from '../src/features/friends/profile-crop.ts';
import { assignCategory, editCategory, removeCategory } from '../src/features/space/album-categories.ts';

test('crop fits the source at both pan limits and keeps the final profile aspect', () => {
  for (const [width, height] of [[2400, 960], [800, 1100], [380, 220]]) {
    for (const ratio of [1.5, 1.89, 2.6]) for (const zoom of [1, 1.65, 6]) {
      const start = cropRect(width, height, ratio, { x: -1, y: -1, zoom });
      const end = cropRect(width, height, ratio, { x: 2, y: 2, zoom });
      assert.equal(start.originX + start.originY, 0);
      assert.equal(end.originX + end.width, width);
      assert.equal(end.originY + end.height, height);
      assert.equal(start.width, end.width);
      assert.ok(Math.abs(end.height - end.width / ratio) < 1);
    }
    assert.deepEqual(cropRect(width, height, width / height, centered),
      { originX: 0, originY: 0, width, height });
  }
});

test('category ownership, rename and removal preserve historical albums, cover, order and photos', () => {
  const old = { id: 'old', ownerId: 'a', theme: '旅行', photos: ['p', 'q'], cover: 1 };
  const other = { id: 'other', ownerId: 'b', photos: ['p'], cover: 0 };
  const legacy = { albums: [old, other] };
  const group = { id: 'c', ownerId: 'a', name: ' 故乡 ', description: ' 冬天 ' };
  const created = editCategory(legacy, 'a', group);
  assert.equal(created.categories[0].name, '故乡');
  assert.equal(created.categories[0].description, '冬天');
  assert.throws(() => editCategory(created, 'a', { ...group, id: 'duplicate' }));
  assert.throws(() => assignCategory(created, 'b', 'other', 'c'));
  const assigned = assignCategory(created, 'a', 'old', 'c');
  const renamed = editCategory(assigned, 'a', { ...group, name: '回家' });
  const restored = JSON.parse(JSON.stringify(renamed));
  assert.equal(restored.albums[0].categoryId, restored.categories[0].id);
  const removed = removeCategory(restored, 'a', 'c');
  assert.deepEqual(JSON.parse(JSON.stringify(removed.albums)), legacy.albums);
  assert.deepEqual(removed.categories, []);
  assert.equal(legacy.categories, undefined);
});
