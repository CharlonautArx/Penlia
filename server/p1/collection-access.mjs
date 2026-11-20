import { blocked, related, restricted } from '../p0/access.mjs';

export const momentVisible = (post, viewer) => `(${post}.author_id=${viewer} OR
  (${related(viewer, post + '.author_id')} AND NOT ${restricted(post + '.author_id', viewer)} AND (
    ${post}.scope='friends' OR
    (${post}.scope='selected' AND EXISTS(SELECT 1 FROM private_moment_viewers v WHERE v.moment_id=${post}.id AND v.user_id=${viewer})) OR
    (${post}.scope IN ('circle','group') AND EXISTS(SELECT 1 FROM relationship_groups g JOIN relationship_group_members gm ON gm.group_id=g.id
      WHERE g.id=${post}.audience_group AND g.owner_id=${post}.author_id AND gm.user_id=${viewer} AND g.circle=(${post}.scope='circle')))
  )))`;

export const activeMember = (collection, viewer) => `(${collection}.owner_id=${viewer} OR (
  NOT ${blocked(collection + '.owner_id', viewer)} AND EXISTS(SELECT 1 FROM p1_collection_members cm
    WHERE cm.collection_id=${collection}.id AND cm.user_id=${viewer} AND cm.state='active')))`;

export const collectionReadable = (collection, viewer) => `(${activeMember(collection, viewer)} OR
  (${collection}.kind='collaboration' AND EXISTS(SELECT 1 FROM private_moments pm WHERE pm.id=${collection}.moment_id
    AND ${momentVisible('pm', viewer)})))`;

export const contributionReadable = (contribution, viewer) => `(${contribution}.removed_at IS NULL
  AND NOT ${blocked(contribution + '.author_id', viewer)} AND NOT ${restricted(contribution + '.author_id', viewer)})`;

export const unusedMedia = (alias) => `(${alias}.moment_id IS NULL AND ${alias}.group_message_id IS NULL
 AND NOT EXISTS(SELECT 1 FROM p1_contribution_media link WHERE link.media_id=${alias}.id))`;
