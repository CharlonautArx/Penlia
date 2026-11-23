import assert from 'node:assert/strict';
import { test } from 'node:test';
import { moveAlbumPhoto, movePosition, removeAlbumPhotos } from '../src/features/space/album-order.ts';

const photos = ['a','reuse','b','reuse','c'].map((id) => ({ id, type: 'local' }));
const album = { id: 'album', ownerId: 'me', title: '生活', theme: '日常', photos, cover: 3, at: 0 };

test('drag preserves the exact cover occurrence and maps selected indices', () => {
  const moved = moveAlbumPhoto(album, 3, 0);
  assert.deepEqual(moved.photos, [photos[3],photos[0],photos[1],photos[2],photos[4]]);
  assert.equal(moved.cover, 0);
  assert.equal(movePosition(1, 3, 0), 2);
  assert.equal(movePosition(3, 3, 0), 0);
  const movedBack = moveAlbumPhoto(moved, 0, 4);
  assert.equal(movedBack.photos[movedBack.cover], photos[3]);
  assert.deepEqual(album.photos, photos);
});

test('selective removal leaves another reference to the same asset and handles empty albums', () => {
  const result = removeAlbumPhotos(album, new Set([0,3]));
  assert.deepEqual(result.photos, [photos[1],photos[2],photos[4]]);
  assert.equal(result.cover, 0);
  const keep = removeAlbumPhotos(album, new Set([0,1]));
  assert.equal(keep.photos[keep.cover], photos[3]);
  const empty = removeAlbumPhotos(album, new Set([0,1,2,3,4]));
  assert.equal(empty.cover, 0);
  assert.deepEqual(empty.photos, []);
});
