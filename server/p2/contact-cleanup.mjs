// Remove direct grants when the qualifying relationship ends. Workspace roles
// also end on blocking, including roles for which access could otherwise return after unblocking.
export async function revokeLifeContactGrants(db, first, second, action) {
  const pair = [first, second];
  await db.query(
    `DELETE FROM p2_calendar_shares WHERE
    (owner_id=$1 AND viewer_id=$2) OR (owner_id=$2 AND viewer_id=$1)`,
    pair,
  );
  await db.query(
    `DELETE FROM p2_item_viewers v USING p2_items i WHERE i.id=v.item_id AND
    ((i.owner_id=$1 AND v.viewer_id=$2) OR (i.owner_id=$2 AND v.viewer_id=$1))`,
    pair,
  );
  await db.query(
    `DELETE FROM p2_memory_viewers v USING p2_memories m WHERE m.id=v.memory_id AND
    ((m.owner_id=$1 AND v.viewer_id=$2) OR (m.owner_id=$2 AND v.viewer_id=$1))`,
    pair,
  );
  await db.query(
    `DELETE FROM p2_status_viewers WHERE
    (user_id=$1 AND viewer_id=$2) OR (user_id=$2 AND viewer_id=$1)`,
    pair,
  );
  if (action === 'block') {
    await db.query(
      `WITH removed AS (
      UPDATE p2_members m SET state='removed' FROM p2_spaces s WHERE s.id=m.space_id AND m.state IN ('invited','active')
      AND ((s.owner_id=$1 AND m.user_id=$2) OR (s.owner_id=$2 AND m.user_id=$1)) RETURNING m.space_id
    ) DELETE FROM p2_trip_agreements a WHERE a.space_id IN (SELECT space_id FROM removed)`,
      pair,
    );
  }
}
