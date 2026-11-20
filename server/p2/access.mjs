import { blocked, related, restricted } from '../p0/access.mjs';

export const known = (a, b) => `(${related(a, b)} AND NOT ${restricted(a, b)} AND NOT ${restricted(b, a)})`;
export const member = (s, v) => `(${s}.owner_id=${v} OR
  (NOT ${blocked(s + '.owner_id', v)} AND EXISTS(SELECT 1 FROM p2_members pm WHERE pm.space_id=${s}.id AND pm.user_id=${v} AND pm.state='active')))`;

export const itemVisible = (i, v) => `(${i}.owner_id=${v} OR (
  NOT ${blocked(i + '.owner_id', v)} AND NOT ${restricted(i + '.owner_id', v)} AND (
    (${i}.scope='space' AND EXISTS(SELECT 1 FROM p2_spaces ps WHERE ps.id=${i}.space_id AND ${member('ps', v)} AND ${member('ps', i + '.owner_id')})) OR
    (${known(i + '.owner_id', v)} AND (
      (${i}.scope='selected' AND EXISTS(SELECT 1 FROM p2_item_viewers pv WHERE pv.item_id=${i}.id AND pv.viewer_id=${v})) OR
      (${i}.scope='group' AND EXISTS(SELECT 1 FROM relationship_groups pg JOIN relationship_group_members pgm ON pgm.group_id=pg.id
        WHERE pg.id=${i}.audience_group AND pg.owner_id=${i}.owner_id AND pgm.user_id=${v}))
    ))
  )))`;

export const opened = (capsule) => `(${capsule}.sealed_at IS NOT NULL AND ${capsule}.opens_at<=now())`;
export const capsuleEntryVisible = (entry, space, capsule, v) => `(${member(space, v)} AND
  NOT ${blocked(entry + '.author_id', v)} AND (${opened(capsule)} OR
    (${capsule}.sealed_at IS NULL AND ${entry}.author_id=${v})))`;

export const statusVisible = (s, v) => `(${s}.expires_at>now() AND
  (${s}.user_id=${v} OR (${known(s + '.user_id', v)} AND (
    ${s}.scope='friends' OR (${s}.scope='selected' AND EXISTS(SELECT 1 FROM p2_status_viewers sv
      WHERE sv.user_id=${s}.user_id AND sv.viewer_id=${v}))))))`;

export const p2MediaVisible = (m, v) => `EXISTS(SELECT 1 FROM p2_assets pa WHERE pa.media_id=${m}.id AND (
  EXISTS(SELECT 1 FROM p2_items pi WHERE pi.id=pa.item_id AND ${itemVisible('pi', v)}) OR
  EXISTS(SELECT 1 FROM p2_itinerary it JOIN p2_spaces ts ON ts.id=it.space_id WHERE it.id=pa.itinerary_id
    AND ${member('ts', v)} AND NOT ${blocked('it.author_id', v)}) OR
  EXISTS(SELECT 1 FROM p2_capsule_entries ce JOIN p2_capsules cap ON cap.space_id=ce.space_id JOIN p2_spaces cs ON cs.id=ce.space_id
    WHERE ce.id=pa.entry_id AND ${capsuleEntryVisible('ce', 'cs', 'cap', v)}) OR
  EXISTS(SELECT 1 FROM p2_status pst WHERE pst.user_id=pa.status_id AND ${statusVisible('pst', v)})
))`;
