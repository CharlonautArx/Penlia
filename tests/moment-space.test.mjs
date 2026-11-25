import test from 'node:test';
import assert from 'node:assert/strict';
import { momentPhotoGrid, momentPhotoLimit, movePhoto, photoDropIndex, photoShiftedIndex, photoEdgeSpeed } from '../src/features/moments/photo-grid.ts';
import { timelineRows } from '../src/features/moments/timeline.ts';
import { visibilityText } from '../src/features/moments/model.ts';
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

test('dragging across rows shifts each neighbor once and scroll velocity grows only at edges', () => {
  const assets = Array.from({ length: 20 }, (_, index) => index);
  const target = photoDropIndex(0, 2 * 108, 6 * 108, 108, 20);
  assert.equal(target, 19);
  const moved = movePhoto(assets, 0, target);
  assert.deepEqual(moved, [...assets.slice(1), 0]);
  for (let index = 0; index < 20; index++) {
    assert.equal(moved[index === 0 ? target : photoShiftedIndex(index, 0, target)], index);
  }
  assert.equal(photoDropIndex(17, -195, -520, 108, 20), 0);
  assert.ok(photoEdgeSpeed(698, 100, 600) > photoEdgeSpeed(656, 100, 600));
  assert.equal(photoEdgeSpeed(399, 100, 600), 0);
  assert.ok(photoEdgeSpeed(103, 100, 600) < 0);
});

test('the mixed timeline merges owner-only archival records and ignores pin order', () => {
  const owner = 'me';
  const moment = (id, authorId, time, fields = {}) => ({ id, authorId, createdAt: new Date(time).toISOString(), ...fields });
  const moments = [moment('newestFriend', 'friend', 800), moment('private', owner, 650),
    moment('oldPinned', owner, 200, { pinned: true, clientId: 'local-copy' })];
  const entry = (id, ownerId, at, fields = {}) => ({ ...blankDraft('thought'), id, ownerId, at, ...fields });
  const archive = [entry('mine', owner, 750), entry('testFriend', 'friend', 740),
    entry('local-copy', owner, 600), entry('older', owner, 180, { pinned: true })];
  assert.deepEqual(timelineRows(moments, archive, owner, false, true).map((r) => r.key),
    ['moment:newestFriend', 'entry:mine', 'moment:private', 'moment:oldPinned', 'entry:older']);
  assert.ok(timelineRows(moments, archive, owner, true, true).every((r) => r.time >= 200));
  assert.equal(timelineRows(moments, archive, owner)[0].moment.id, 'oldPinned');
  assert.deepEqual([visibilityText('friends'), visibilityText('private'), visibilityText(null, 'partial')],
    ['全部好友可见', '仅自己可见', '部分好友可见']);
});
