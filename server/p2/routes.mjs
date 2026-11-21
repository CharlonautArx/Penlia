import { readId } from '../core.mjs';
import { missing } from '../p1/common.mjs';
import * as calendar from './calendar.mjs';
import * as capsules from './capsules.mjs';
import * as items from './items.mjs';
import * as memories from './memories.mjs';
import * as spaces from './spaces.mjs';
import * as status from './status.mjs';
import * as trips from './trips.mjs';

export async function p2Routes(method, path, { user, query, readBody, headers, rateLimit }) {
  if (!path.startsWith('/v1/p2/')) return;
  const [, resource, rawId, action, itemId] =
    /^\/v1\/p2\/([a-z-]+)(?:\/([0-9a-f-]{36}))?(?:\/([a-z-]+))?(?:\/([0-9a-f-]{36}))?$/.exec(path) ?? [];
  if (!resource) throw missing();
  const id = rawId ? readId(rawId) : undefined;
  if (itemId && !(resource === 'trips' && method === 'PATCH' && action === 'itinerary')) throw missing();
  const key = method + ':' + (id ? 'one' : 'list') + (action ? ':' + action : '');
  const me = user.id;
  if (['POST', 'PATCH', 'DELETE'].includes(method)) await rateLimit('p2:' + resource + ':' + me, 60, 1);
  if (
    (resource === 'spaces' && (key === 'POST:list' || key === 'POST:one:invite')) ||
    (resource === 'calendar-shares' && key === 'POST:list')
  )
    await rateLimit('p2-invite:' + resource + ':' + me, 18, 60);
  if (resource === 'calendar')
    switch (key) {
      case 'GET:list':
        return calendar.calendarView(me, query);
      case 'POST:list':
        return calendar.saveCalendarEvent(me, await readBody());
      case 'PATCH:one':
        return calendar.saveCalendarEvent(me, await readBody(), id);
      case 'DELETE:one':
        return calendar.removeCalendarEvent(me, id);
    }
  if (resource === 'calendar-shares')
    switch (key) {
      case 'GET:list':
        return calendar.calendarShares(me);
      case 'POST:list':
        return calendar.manageCalendarShare(me, await readBody());
    }
  if (resource === 'availability' && key === 'GET:one') return calendar.gatheringAvailability(me, id);
  if (resource === 'spaces')
    switch (key) {
      case 'GET:list':
        return spaces.spaces(me, query);
      case 'POST:list':
        return spaces.createSpace(me, await readBody());
      case 'GET:one':
        return spaces.getSpace(me, id);
      case 'POST:one:invite':
        return spaces.inviteSpace(me, id, await readBody());
      case 'POST:one:membership':
        return spaces.spaceMembership(me, id, await readBody());
    }
  if (resource === 'trips')
    switch (key) {
      case 'GET:one':
        return trips.tripDetail(me, id);
      case 'PATCH:one':
        return trips.updateTrip(me, id, await readBody());
      case 'POST:one:itinerary':
        return trips.saveItinerary(me, id, await readBody());
      case 'PATCH:one:itinerary':
        return trips.saveItinerary(me, id, await readBody(), readId(itemId));
      case 'POST:one:action':
        return trips.tripAction(me, id, await readBody());
    }
  if (resource === 'items')
    switch (key) {
      case 'GET:list':
        return items.listItems(me, query);
      case 'GET:one':
        return items.itemDetail(me, id);
      case 'POST:list':
        return items.saveItem(me, await readBody());
      case 'POST:one:copy':
        return items.copyItem(me, id, await readBody());
      case 'PATCH:one':
        return items.saveItem(me, await readBody(), id);
      case 'DELETE:one':
        return items.removeItem(me, id);
    }
  if (resource === 'place-resonance' && key === 'GET:list') return items.placeResonance(me);
  if (resource === 'status')
    switch (key) {
      case 'GET:list':
        return status.getStatus(me, me);
      case 'GET:one':
        return status.getStatus(me, id);
      case 'POST:list':
        return status.saveStatus(me, await readBody());
      case 'DELETE:list':
        return status.clearStatus(me);
    }
  if (resource === 'capsules')
    switch (key) {
      case 'GET:one':
        return capsules.getCapsule(me, id);
      case 'POST:one:entry':
        return capsules.saveCapsuleEntry(me, id, await readBody());
      case 'POST:one:action':
        return capsules.capsuleAction(me, id, await readBody());
    }
  if (resource === 'capsule-entries')
    switch (key) {
      case 'GET:list':
        return capsules.ownedCapsuleEntries(me);
      case 'DELETE:one':
        return capsules.withdrawCapsuleEntry(me, id);
      case 'POST:one:audio':
        return capsules.uploadCapsuleAudio(me, id, await readBody());
      case 'DELETE:one:audio':
        return capsules.deleteCapsuleAudio(me, id);
      case 'HEAD:one:audio':
      case 'GET:one:audio':
        return capsules.readCapsuleAudio(me, id, headers.range, method === 'HEAD');
    }
  if (resource === 'memory-sources' && key === 'GET:list') return memories.memorySources(me, query);
  if (resource === 'memory-candidates' && key === 'GET:list') return memories.memoryCandidates(me);
  if (resource === 'memories')
    switch (key) {
      case 'GET:list':
        return memories.memories(me);
      case 'POST:list':
        return memories.saveMemory(me, await readBody());
      case 'POST:one:share':
        return memories.shareMemory(me, id, await readBody());
      case 'DELETE:one':
        return memories.deleteMemory(me, id);
    }
  if (resource === 'memory-settings' && key === 'POST:list')
    return memories.memorySettings(me, await readBody());
  if (resource === 'reminders')
    switch (key) {
      case 'GET:list':
        return memories.reminders(me);
      case 'POST:one:read':
        return memories.readReminder(me, id, await readBody());
    }
  throw missing();
}
