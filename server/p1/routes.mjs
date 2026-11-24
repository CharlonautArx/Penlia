import { readId } from '../core.mjs';
import { pool } from '../db.mjs';
import { getContributionAudience, setContributionAudience } from './contribution-consent.mjs';
import * as collections from './collections.mjs';
import { choose, invalid } from './common.mjs';
import * as gathering from './gatherings.mjs';
import * as review from './moderation.mjs';
import * as calls from './rtc.mjs';
import * as wishes from './wishes.mjs';

export async function p1Routes(
  method,
  path,
  { user, query, readBody, rateLimit, headers, rtc, moderationEvidence, reviewAdvisor },
) {
  const attachment = /^\/v1\/p1\/review-media\/([0-9a-f-]{36})\/([0-9a-f-]{36})$/.exec(path);
  if (attachment && (method === 'GET' || method === 'HEAD')) {
    await rateLimit('p1:review-media:' + user.id, 180, 1);
    return review.readReportMedia(
      user.id,
      readId(attachment[1]),
      readId(attachment[2]),
      headers.range,
      method === 'HEAD',
    );
  }
  const match = /^\/v1\/p1\/([a-z-]+)(?:\/([a-zA-Z0-9-]+))?(?:\/([a-z-]+))?$/.exec(path);
  if (!match) return;
  const [, resource, rawId, action] = match;
  const id = rawId ? readId(rawId) : undefined;
  const me = user.id;
  const writing = method === 'POST' || method === 'PATCH' || method === 'DELETE';
  if (writing)
    await rateLimit(
      'p1:' + resource + ':' + me,
      resource === 'reports' ? 8 : 60,
      resource === 'reports' ? 60 : 1,
    );
  const body = async () => readBody();
  const route = method + ':' + (id ? 'one' : 'list') + (action ? ':' + action : '');
  if (
    (resource === 'gatherings' && route === 'POST:list') ||
    (resource === 'collections' && ['POST:list', 'POST:one:invite'].includes(route))
  ) {
    await rateLimit('p1-invite:' + resource + ':' + me, 10, 60);
  }
  if (resource === 'wishes')
    switch (route) {
      case 'GET:list':
        return wishes.listWishes(me);
      case 'POST:list':
        return wishes.saveWish(me, await body());
      case 'PATCH:one':
        return wishes.saveWish(me, await body(), id);
      case 'DELETE:one':
        return wishes.removeWish(me, id);
      case 'POST:one:pause':
        return wishes.pauseWish(me, id, choose((await body()).active, [true, false]));
    }
  if (resource === 'gatherings')
    switch (route) {
      case 'GET:list':
        return gathering.listGatherings(me);
      case 'POST:list':
        return gathering.createGathering(me, await body());
      case 'GET:one':
        return gathering.getGathering(me, id);
      case 'POST:one:intention':
        return gathering.updateIntention(me, id, await body());
      case 'POST:one:confirm':
        return gathering.confirmAttendance(me, id, choose((await body()).attend, [true, false]));
      case 'POST:one:organize':
        return gathering.organizeGathering(me, id, await body());
    }
  if (resource === 'collections')
    switch (route) {
      case 'GET:list':
        return collections.listCollections(me);
      case 'POST:list':
        return collections.createCollection(me, await body());
      case 'GET:one':
        return collections.getCollection(me, id, query);
      case 'GET:one:album':
        return collections.getAlbum(me, id);
      case 'POST:one:invite':
        return collections.inviteCollection(me, id, await body());
      case 'POST:one:membership':
        return collections.changeMembership(me, id, await body());
      case 'POST:one:entries':
        return collections.createEntry(me, id, await body());
      case 'POST:one:publish':
        return collections.publishCollaboration(me, id, await body());
    }
  if (resource === 'entries')
    switch (route) {
      case 'GET:one':
        return collections.getEntry(me, id);
      case 'POST:one:contributions':
        return collections.addContribution(me, id, await body());
    }
  if (resource === 'contributions')
    switch (route) {
      case 'GET:list':
        return collections.ownContributions(me);
      case 'GET:one:audience':
        return getContributionAudience(me, id, query.get('channel'));
      case 'PATCH:one:audience':
        return setContributionAudience(me, id, query.get('channel'), await body());
      case 'DELETE:one:audience':
        return setContributionAudience(me, id, query.get('channel'));
      case 'GET:one:history':
        return collections.contributionHistory(me, id);
      case 'PATCH:one':
        return collections.editContribution(me, id, await body());
      case 'DELETE:one':
        return collections.removeContribution(me, id);
    }
  if (resource === 'boundary' && route === 'GET:list') return review.boundaryOverview(me, query.get('before'));
  if (resource === 'boundary' && route === 'POST:list') return review.hideReportHistory(me, await body());
  if (resource === 'reports' && route === 'POST:list') return review.submitReport(me, await body());
  if (resource === 'enforcement' && route === 'POST:one:appeal')
    return review.submitAppeal(me, id, await body());
  if (resource === 'reviews')
    switch (route) {
      case 'GET:list':
        return review.reviewQueue(me);
      case 'GET:one:evidence':
        return review.readEvidence(me, id);
      case 'GET:one:audit':
        return review.getReviewAudit(me, id);
      case 'POST:one:verify':
        return review.verifyPrivateReport(me, id, moderationEvidence);
      case 'POST:one:suggestion':
        return review.suggestReview(me, id, reviewAdvisor, await body());
      case 'POST:one:decision':
        return review.decideReport(me, id, await body());
    }
  if (resource === 'appeals')
    switch (route) {
      case 'GET:one':
        return review.inspectAppeal(me, id);
      case 'POST:one:decision':
        return review.finishAppeal(me, id, await body());
    }
  if (resource === 'groups')
    switch (route) {
      case 'GET:one:call':
        return calls.currentGroupCall(me, id, rtc);
      case 'POST:one:call':
        return calls.startGroupCall(me, id, rtc);
    }
  if (resource === 'calls' && method === 'POST' && id) {
    if (action === 'join' || action === 'renew') return calls.callToken(me, id, action === 'renew', rtc);
    return calls.changeCall(me, id, choose(action, ['decline', 'leave', 'end']), rtc);
  }
  if (resource === 'events')
    switch (route) {
      case 'GET:list': {
        const { rows } = await pool.query(
          `SELECT event.id,event.kind,event.subject_id AS "subjectId",event.opened_at AS "readAt",event.created_at AS "createdAt",
          (SELECT c.group_id FROM p1_calls c JOIN chat_group_members m ON m.group_id=c.group_id
            WHERE event.kind='group_call' AND c.id=event.subject_id AND m.user_id=$1) AS "groupId"
        FROM p1_events event WHERE event.user_id=$1 ORDER BY event.created_at DESC,event.id DESC LIMIT 50`,
          [me],
        );
        return { events: rows };
      }
      case 'POST:one:open':
        await pool.query(
          'UPDATE p1_events SET opened_at=coalesce(opened_at,now()) WHERE id=$1 AND user_id=$2',
          [id, me],
        );
        return {};
    }
  throw invalid('请求的功能入口无效。');
}
