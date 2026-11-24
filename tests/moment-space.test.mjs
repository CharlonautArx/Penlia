import test from 'node:test';
import assert from 'node:assert/strict';
import { momentPhotoGrid, momentPhotoLimit } from '../src/features/moments/photo-grid.ts';
import { calendarDate, visibleSince } from '../src/features/space/moment-history.ts';
import { blankDraft, canSeeEntry, defaultPrivacy } from '../src/features/space/model.ts';

test('feed stacks three per row and the ninth image counts itself plus the hidden photos', () => {
  assert.equal(momentPhotoLimit,20);
  for (const [total,badge] of [[9,0],[10,2],[11,3],[15,7],[20,12]]) {
    const photos = Array.from({length:total},(_,index)=>index+1);
    const feed = momentPhotoGrid(photos,false), detail = momentPhotoGrid(photos,true);
    assert.deepEqual(feed.rows,[[1,2,3],[4,5,6],[7,8,9]]);
    assert.equal(feed.more,badge);
    assert.equal(detail.more,0);
    assert.deepEqual(detail.rows.flat(),photos);
    assert.ok(detail.rows.every((row)=>row.length<=3));
  }
});

test('a custom date uses local midnight, keeps both access policies, and leaves journals on their original range', () => {
  assert.equal(calendarDate(2024,2,29),'2024-02-29');
  assert.equal(calendarDate(2025,2,29),undefined);
  const range = { history:'custom', date:'2026-11-24', zone:'Asia/Shanghai' };
  const cutoff = Date.parse('2026-11-23T16:00:00Z');
  assert.equal(visibleSince(cutoff-1,range),false);
  assert.equal(visibleSince(cutoff,range),true);
  const at = Date.parse('2026-11-20T16:00:00Z');
  const thought = { ...blankDraft('thought'), id:'m', ownerId:'owner', at };
  const privacy = { ...defaultPrivacy(), history:'all', momentHistory:range };
  assert.equal(canSeeEntry(thought,privacy,'friend',true),false);
  assert.equal(canSeeEntry(thought,privacy,'owner',false),true);
  assert.equal(canSeeEntry({...thought,kind:'journal'},privacy,'friend',true),true);
  assert.equal(canSeeEntry({...thought,at:cutoff,audience:{mode:'self',ids:[]}},privacy,'friend',true),false);
  assert.equal(canSeeEntry({...thought,at:cutoff},{...privacy,access:{mode:'self',ids:[]}},'friend',true),false);
});
