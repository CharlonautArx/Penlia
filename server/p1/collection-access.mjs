import { blocked, related, restricted } from '../p0/access.mjs';

const baseMomentVisible = (post, viewer) => `(${post}.author_id=${viewer} OR
  (${related(viewer, post + '.author_id')} AND NOT ${restricted(post + '.author_id', viewer)} AND (
    ${post}.scope='friends' OR
    (${post}.scope='selected' AND EXISTS(SELECT 1 FROM private_moment_viewers v WHERE v.moment_id=${post}.id AND v.user_id=${viewer})) OR
    (${post}.scope IN ('circle','group') AND EXISTS(SELECT 1 FROM relationship_groups g JOIN relationship_group_members gm ON gm.group_id=g.id
      WHERE g.id=${post}.audience_group AND g.owner_id=${post}.author_id AND gm.user_id=${viewer} AND g.circle=(${post}.scope='circle'))
      AND (${post}.scope='circle' OR EXISTS(SELECT 1 FROM private_moment_viewers snapshot WHERE snapshot.moment_id=${post}.id AND snapshot.user_id=${viewer})))
  )))`;

export const forwardableMoment = (post) =>
  `(${post}.source_moment_id IS NULL AND ${post}.allow_forward AND ${post}.scope<>'private')`;

export const momentVisible = (post, viewer) => `(${baseMomentVisible(post, viewer)} AND (
  ${post}.source_moment_id IS NULL OR EXISTS(
    SELECT 1 FROM private_moments original
    JOIN moment_forward_requests approval ON approval.moment_id=original.id
    WHERE original.id=${post}.source_moment_id AND approval.published_id=${post}.id
    AND approval.requester_id=${post}.author_id AND approval.status='published'
    AND ${forwardableMoment('original')}
    AND ${baseMomentVisible('original', post + '.author_id')}
    AND ${baseMomentVisible('original', viewer)}
  )))`;

export const activeMember = (collection, viewer) => `(${collection}.owner_id=${viewer} OR (
  NOT ${blocked(collection + '.owner_id', viewer)} AND EXISTS(SELECT 1 FROM p1_collection_members cm
    WHERE cm.collection_id=${collection}.id AND cm.user_id=${viewer} AND cm.state='active')))`;

export const collectionReadable = (collection, viewer) => `(${activeMember(collection, viewer)} OR
  (${collection}.kind='collaboration' AND EXISTS(SELECT 1 FROM private_moments pm WHERE pm.id=${collection}.moment_id
    AND ${momentVisible('pm', viewer)})))`;

export const contributionReadable = (contribution, viewer) => `(${contribution}.removed_at IS NULL
  AND NOT ${blocked(contribution + '.author_id', viewer)} AND NOT ${restricted(contribution + '.author_id', viewer)})`;

export const unusedMedia = (alias) => `(${alias}.moment_id IS NULL AND ${alias}.group_message_id IS NULL AND ${alias}.comment_id IS NULL AND ${alias}.chat_record_id IS NULL
 AND NOT EXISTS(SELECT 1 FROM p1_contribution_media link WHERE link.media_id=${alias}.id)
 AND NOT EXISTS(SELECT 1 FROM p2_assets pa WHERE pa.media_id=${alias}.id)
 AND NOT EXISTS(SELECT 1 FROM p3_media px WHERE px.media_id=${alias}.id))`;

// A collaboration member and a feed viewer need separate, author-issued grants.
export const workspaceGrant = (
  contribution,
  viewer,
) => `EXISTS(SELECT 1 FROM p1_contribution_workspace_readers cw
  WHERE cw.contribution_id=${contribution}.id AND cw.viewer_id=${viewer})`;

export const contributionScope = (contribution, collection, viewer) => `(${collection}.kind='journal' OR
  ${contribution}.author_id=${viewer} OR
  (${activeMember(collection, viewer)} AND ${workspaceGrant(contribution, viewer)}) OR
  EXISTS(SELECT 1 FROM p1_contribution_public_readers cp JOIN private_moments pm ON pm.id=cp.moment_id
    WHERE cp.contribution_id=${contribution}.id AND cp.viewer_id=${viewer} AND pm.id=${collection}.moment_id
    AND ${momentVisible('pm', viewer)}))`;

// Only enumerate personas already eligible for a moment through the owner's accepted friendships.
export const momentReaders = (moment, owner) => `SELECT u.id,u.name FROM private_moments pm
  JOIN friendships fr ON fr.status='accepted' AND ${owner} IN (fr.first_user,fr.second_user)
  JOIN users u ON u.id=CASE WHEN fr.first_user=${owner} THEN fr.second_user ELSE fr.first_user END
  WHERE pm.id=${moment} AND pm.author_id=${owner} AND ${momentVisible('pm', 'u.id')}
  ORDER BY u.id`;
