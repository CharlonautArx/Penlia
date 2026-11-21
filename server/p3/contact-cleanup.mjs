export async function revokeMemberGrants(db, space, user) {
  await db.query(
    `DELETE FROM p3_record_viewers v USING p3_records r
    WHERE v.record_id=r.id AND r.space_id=$1 AND (v.viewer_id=$2 OR r.author_id=$2)`,
    [space, user],
  );
}

export async function revokeWorldContactGrants(db, first, second, action) {
  if (action === 'block') {
    await db.query(
      `SELECT s.id FROM p3_spaces s JOIN p3_members m ON m.space_id=s.id AND m.state IN ('invited','active')
      WHERE (s.owner_id=$1 AND m.user_id=$2) OR (s.owner_id=$2 AND m.user_id=$1) ORDER BY s.id FOR UPDATE OF s`,
      [first, second],
    );
  }
  await db.query(
    `DELETE FROM p3_record_viewers v USING p3_records r WHERE v.record_id=r.id
    AND ((r.author_id=$1 AND v.viewer_id=$2) OR (r.author_id=$2 AND v.viewer_id=$1))`,
    [first, second],
  );
  if (action === 'block') {
    await db.query(
      `WITH removed AS (
        UPDATE p3_members m SET state='removed' FROM p3_spaces s
        WHERE s.id=m.space_id AND m.state IN ('invited','active')
          AND ((s.owner_id=$1 AND m.user_id=$2) OR (s.owner_id=$2 AND m.user_id=$1))
        RETURNING m.space_id,m.user_id
      ), bumped AS (
        UPDATE p3_spaces s SET roster_version=s.roster_version+1 FROM removed x WHERE s.id=x.space_id RETURNING s.id
      )
      DELETE FROM p3_record_viewers v USING p3_records r,removed x
      WHERE v.record_id=r.id AND r.space_id=x.space_id AND (v.viewer_id=x.user_id OR r.author_id=x.user_id)`,
      [first, second],
    );
  }
}
