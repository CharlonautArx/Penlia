import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { demoPeople, demoUser } from './data';
import { friend, friendName, members, self, type Row, type Rows } from './life-fixtures';

type Input = Record<string, unknown>;
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const list = (value: unknown): Row[] => Array.isArray(value) ? value : [];
const now = () => new Date().toISOString();
const unavailable = '这个操作仅在正式服务中可用。预览数据保存在本机。';
const author = { authorId: self, author: demoUser.name, createdAt: '', revision: 1 };
const owner = { ownerId: self, owner: demoUser.name, state: 'active', canWrite: true };
const add = (body: Input, fields: Input = {}) => ({ ...body, ...fields, id: randomUUID() });
const waiting = (ids: string[]) => members(ids).map((person) => ({ ...person, state: 'invited' }));

export function offlineRequest(store: Rows, path: string, method: string, body: Input) {
  const [pathname, search] = path.split('?');
  const query = new URLSearchParams(search);
  const parts = pathname.split('/').filter(Boolean);
  const [root, area, id, action, detail] = parts;
  const get = method === 'GET';
  const remove = method === 'DELETE';
  const requestId = root.startsWith('p') && /^p[123]$/.test(root) ? id : area;
  const rows = (key: string) => store[key] ?? [];
  const find = (key: string, value = requestId) => rows(key).find((row) => row.id === value);
  const requireRow = (key: string, value = requestId) => {
    const row = find(key, value);
    if (!row) throw new Error('找不到这条演示记录。');
    return row;
  };
  const save = (key: string, row: Row) => {
    store[key] = [row, ...rows(key).filter((item) => item.id !== row.id)];
    return row;
  };
  const drop = (key: string, row: Row) => {
    store[key] = rows(key).filter((item) => item.id !== row.id);
    return {};
  };
  const assetRefs = (previous: unknown = []) => Array.isArray(body.mediaIds)
    ? strings(body.mediaIds).flatMap((asset) => find('media', asset) ?? []) : previous;
  const newMembers = () => waiting(strings(body.memberIds));
  const edit = (key: string, row: Row, fields: Input = {}) =>
    save(key, { ...row, ...body, ...fields, revision: typeof row.revision === 'number' ? row.revision + 1 : 1, id: row.id });
  const related = (key: string, field: string, value = id) => rows(key).filter((row) => row[field] === value);
  const people = (row: Row) => ({ members: list(row.members) });
  const patchMembers = (key: string, row: Row, command: string) => {
    if (command === 'invite') return save(key, { ...row, members: [...list(row.members), ...newMembers()
      .filter((person) => !list(row.members).some((existing) => existing.id === person.id))] });
    if (body.action === 'accept') return save(key, { ...row, state: 'active' });
    if (['remove', 'leave', 'decline'].includes(String(body.action))) {
      const person = body.action === 'remove' ? body.userId : self;
      if (person === self) return save(key, { ...row, state: 'left' });
      return save(key, { ...row, members: list(row.members).filter((entry) => entry.id !== person) });
    }
    throw new Error(unavailable);
  };
  const upsert = (key: string, fields: Input = {}) => requestId
    ? (remove ? drop(key, requireRow(key)) : edit(key, requireRow(key), fields))
    : save(key, add(body, fields));

  if (root === 'moment-media') {
    if (get) throw new Error(unavailable);
    const mime = String(body.mime);
    if (!['image/jpeg', 'image/png', 'video/mp4'].includes(mime) || typeof body.base64 !== 'string'
        || body.base64.length > 6_000_000) throw new Error('无法保存该演示附件。');
    const asset = String(body.clientId);
    const existing = find('media', asset);
    if (existing) return { media: existing };
    if (!/^[\da-f-]{36}$/i.test(asset)) throw new Error('附件标识无效。');
    let demoUri = 'data:' + mime + ';base64,' + body.base64;
    if (Platform.OS !== 'web') {
      const directory = new Directory(Paths.document, 'demo-media');
      directory.create({ idempotent: true, intermediates: true });
      const file = new File(directory, asset + (mime === 'video/mp4' ? '.mp4' : mime === 'image/png' ? '.png' : '.jpg'));
      file.write(body.base64, { encoding: 'base64' });
      demoUri = file.uri;
    }
    return { media: save('media', { id: asset, mime, demoUri }) };
  }

  if (root === 'privacy') {
    const settings = requireRow('settings', 'privacy');
    if (!area) return { settings: get ? settings : edit('settings', settings, { version: Number(settings.version) + 1 }), priorityIds: settings.priorityIds };
    if (area === 'priority') return save('settings', { ...settings, priorityIds: strings(body.ids) });
    if (area === 'blocks') return { blocks: rows('blocks') };
    if (area === 'restricted') return { restrictions: rows('restrictions') };
    if (area === 'devices' && get) return { devices: [{ id: 'demo-device', nickname: '当前演示设备', current: true, firstSeen: null, expiresAt: now() }] };
    if (area === 'devices' && id === 'label') return {};
    if (area === 'requests' && get) return { requests: [] };
    if (area === 'export' && get) return { demo: true, settings };
  }
  if (root === 'relationship-groups') return get ? { groups: rows('relationGroups') } : upsert('relationGroups');
  if (root === 'people' && area && get) return { user: demoPeople.find((person) => person.id === area) };
  if (root === 'group-invites') {
    if (get && !area) return { invitations: rows('invites') };
    if (area === 'accept' || area === 'decline') {
      const invitation = requireRow('invites', String(body.id));
      drop('invites', invitation);
      if (area === 'accept') {
        const group = requireRow('groups', String(invitation.groupId));
        save('groups', { ...group, active: true });
        return { groupId: group.id };
      }
      return {};
    }
  }
  if (root === 'groups') {
    if (!area) return get ? { groups: rows('groups').filter((row) => row.active) }
      : save('groups', add(body, { ownerId: self, active: true, memberCount: 1, members: members([self]) }));
    const group = requireRow('groups');
    if (!group.active) throw new Error('请先在本机接受这份演示邀请。');
    if (!id) return remove ? drop('groups', group) : { group, ...people(group) };
    if (id === 'leave') return save('groups', { ...group, active: false });
    if (id === 'messages') {
      if (get) return { messages: related('groupLines', 'groupId', area).slice(0, 75), next: null };
      const duplicate = related('groupLines', 'groupId', area).find((line) => line.clientId === body.clientId);
      return duplicate ?? save('groupLines', add(body, { groupId: area, senderId: self, name: demoUser.name, sentAt: now(), media: assetRefs() }));
    }
  }
  if (root === 'moments') {
    if (!get) return upsert('moments', area ? {} : { ...author, createdAt: now(), media: assetRefs() });
    if (area) return { moment: requireRow('moments') };
    const selected = query.get('author');
    return { moments: rows('moments').filter((item) => !selected || item.authorId === selected), next: null };
  }

  if (root === 'p1') {
    if (area === 'wishes') {
      if (get) {
        const wish = rows('wishes').find((row) => row.active && row.scope !== 'private');
        return { wishes: rows('wishes'), matches: wish ? [{ ...wish, wishId: wish.id, friendId: friend.id, friendName: friend.name }] : [] };
      }
      return upsert('wishes', action === 'pause' ? { active: body.active ?? !requireRow('wishes').active } : { active: true });
    }
    if (area === 'gatherings') {
      if (!id && get) return { gatherings: rows('gatherings') };
      if (!id) {
        const options = list(body.options).map((option) => add(option));
        return save('gatherings', add(body, { ownerId: self, state: 'interest', choiceId: null, intention: null,
          directProposal: true, ballotClosed: false, confirmed: false, votes: [], options, attendees: [] }));
      }
      const gathering = requireRow('gatherings');
      if (get) return { gathering, options: gathering.options, attendees: gathering.attendees };
      const command = String(body.action ?? action);
      if (command === 'intention') return edit('gatherings', gathering, { votes: strings(body.optionIds) });
      if (command === 'reschedule') return edit('gatherings', gathering, { state: 'interest', options: list(body.options).map((row) => add(row)),
        choiceId: null, confirmed: false, votes: [], attendees: [] });
      const state = { choose: 'confirming', propose: 'confirming', cancel: 'cancelled', complete: 'completed',
        reopen: 'interest', retry: 'interest', open: 'interest' }[command] ?? gathering.state;
      const confirmed = command === 'confirm' ? body.attend === true : gathering.confirmed;
      const attendees = command === 'confirm' ? (confirmed ? members() : []) : gathering.attendees;
      if (command !== 'confirm' && state === gathering.state && command !== 'choose') throw new Error(unavailable);
      return edit('gatherings', gathering, { state: command === 'confirm' && confirmed ? 'formed' : state,
        choiceId: body.optionId ?? body.choiceId ?? gathering.choiceId, confirmed, attendees });
    }
    if (area === 'collections') {
      if (!id && get) return { collections: rows('collections').filter((row) => row.state !== 'left') };
      if (!id) return save('collections', add(body, { ...owner, momentId: null, members: [...members([self]), ...newMembers()] }));
      const collection = requireRow('collections');
      const entries = related('entries', 'collectionId');
      if (get && action === 'album') return { media: entries.flatMap((entry) => related('contributions', 'entryId', entry.id)
        .flatMap((contribution) => list(contribution.media))), next: null };
      if (get) return { collection, entries, ...people(collection), next: null };
      if (action === 'publish') {
        const moment = save('moments', add(body, { ...author, collaborationId: collection.id,
          body: collection.title, createdAt: now(), media: [] }));
        return edit('collections', collection, { momentId: moment.id });
      }
      if (action === 'entries') return save('entries', add(body, { collectionId: id, author: demoUser.name }));
      if (action === 'invite' || action === 'membership') return patchMembers('collections', collection, action);
    }
    if (area === 'entries') {
      const entry = requireRow('entries');
      if (get) return { entry, collection: requireRow('collections', String(entry.collectionId)), contributions: related('contributions', 'entryId') };
      if (action === 'contributions') return save('contributions', add(body, { ...author, createdAt: now(), entryId: id, media: assetRefs() }));
    }
    if (area === 'contributions') {
      if (get && !id) return { contributions: rows('contributions').filter((row) => row.authorId === self) };
      const contribution = requireRow('contributions');
      if (action === 'history') return { history: [{ revision: contribution.revision, body: contribution.body,
        action: 'created', editor: contribution.author, editedAt: contribution.createdAt }] };
      if (action === 'audience') {
        if (get) return { available: query.get('channel') === 'workspace', hasConsent: !!strings(contribution.memberIds).length,
          version: String(contribution.revision),
          viewers: members([friend.id]).map((person) => ({ ...person, allowed: strings(contribution.memberIds).includes(person.id) })) };
        return edit('contributions', contribution);
      }
      return upsert('contributions', { media: assetRefs(contribution.media) });
    }
    if (area === 'events') return { events: rows('events') };
    if (area === 'boundary') return { reports: rows('reports'), actions: rows('enforcement'), canReview: false };
    if (area === 'reports' && !get) return save('reports', add({},
      { status: 'pending', kind: body.kind, title: '本机举报演示', createdAt: now() }));
    if (area === 'groups' && action === 'call') {
      if (get) return { call: null, available: false };
      throw new Error('多人通话需要正式的 RTC 服务。可在单聊演示本机通话界面。');
    }
    if (area === 'reviews') return { queue: [] };
  }

  if (root === 'p2') {
    if (area === 'calendar') {
      if (!get) return upsert('calendars', { ownerId: self, revision: 1 });
      const from = query.get('from') ?? '';
      const until = query.get('until') ?? '\uffff';
      const shared = rows('calendarShares').filter((row) => row.viewerId === self && row.accepted);
      const events = rows('calendars').filter((row) => String(row.startsAt) < until && String(row.endsAt) > from &&
        (row.ownerId === self || shared.some((calendar) => calendar.ownerId === row.ownerId)));
      let start = Date.parse(from);
      const end = Date.parse(until);
      const windows: { startsAt: string; endsAt: string }[] = [];
      const window = (stop: number) => {
        if (stop - start >= 1_800_000) windows.push({ startsAt: new Date(start).toISOString(), endsAt: new Date(stop).toISOString() });
      };
      if (Number.isFinite(start) && Number.isFinite(end)) {
        for (const entry of [...events].sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)))) {
          window(Math.min(end, Date.parse(String(entry.startsAt))));
          start = Math.max(start, Date.parse(String(entry.endsAt)));
        }
        window(end);
      }
      return { calendars: [{ id: self, name: demoUser.name, access: 'detail' }, ...shared],
        events, truncated: false, windows, includedCalendars: shared.length };
    }
    if (area === 'calendar-shares') {
      if (get) return { shares: rows('calendarShares') };
      const userId = String(body.userId);
      const share = find('calendarShares', userId);
      if (body.action === 'share') return save('calendarShares',
        { id: userId, ownerId: self, viewerId: userId, name: friendName(userId), access: body.access, accepted: false });
      if (share && body.action === 'accept') return save('calendarShares', { ...share, accepted: true });
      return share ? drop('calendarShares', share) : {};
    }
    if (area === 'availability') return { options: list(requireRow('gatherings').options).map((option) => ({
      id: option.id, includedCalendars: 1, hasKnownConflict: rows('calendars').some((slot) =>
        String(slot.startsAt) <= String(option.startsAt) && String(slot.endsAt) > String(option.startsAt)), allFree: false,
    })) };
    if (area === 'spaces') {
      if (!id && get) return { spaces: rows('projects').filter((row) => row.kind === query.get('kind') && row.state !== 'left') };
      if (!id) return save('projects', add(body, { ...owner, revision: 1, members: [...members([self]), ...newMembers()] }));
      const space = requireRow('projects');
      return get ? { space, ...people(space) } : patchMembers('projects', space, action);
    }
    if (area === 'trips') {
      const trip = requireRow('projects');
      const items = related('stops', 'tripId');
      if (get) return { trip, items, ...people(trip), myAgreement: !!trip.myAgreement };
      if (action === 'itinerary') {
        const stop = detail && find('stops', detail);
        return stop ? edit('stops', stop, { media: assetRefs(stop.media) }) : save('stops', add(body,
          { ...author, tripId: id, media: assetRefs(), support: 0, myVote: null, position: items.length }));
      }
      if (action === 'action') {
        const stop = typeof body.itemId === 'string' && find('stops', body.itemId);
        if (body.action === 'delete' && stop) return drop('stops', stop);
        if (body.action === 'vote' && stop) return edit('stops', stop, { myVote: body.support, support: body.support ? 1 : 0 });
        if (body.action === 'reorder') {
          strings(body.itemIds).forEach((item, position) => {
            const found = find('stops', item);
            if (found) save('stops', { ...found, position });
          });
          store.stops = rows('stops').sort((a, b) => Number(a.position) - Number(b.position));
          return {};
        }
        if (body.action === 'complete') return edit('projects', trip, { completedAt: now() });
        throw new Error(unavailable);
      }
      return edit('projects', trip);
    }
    if (area === 'items') {
      if (get && id) return { item: requireRow('items') };
      if (get) return { items: rows('items').filter((row) => {
        const category = query.get('category');
        if (row.kind !== query.get('kind') || (category && row.category !== category)) return false;
        if (query.get('space')) return row.spaceId === query.get('space');
        return query.get('tab') === 'friends' ? row.ownerId !== self : row.ownerId === self && !row.spaceId;
      }), next: null };
      if (action === 'copy') return save('items', add(requireRow('items'), { ...owner, scope: 'private', author: demoUser.name }));
      return upsert('items', { ownerId: self, author: demoUser.name, tags: strings(body.tags), media: assetRefs(find('items')?.media) });
    }
    if (area === 'place-resonance') return { matches: [] };
    if (area === 'status') {
      const current = rows('status').find((row) => row.ownerId === (id || self));
      if (get) return { status: current && String(current.expiresAt) > now() ? current : null };
      if (remove) return current ? drop('status', current) : {};
      return save('status', { ...(current ?? { id: self }), ...body, ownerId: self, media: assetRefs(current?.media),
        revision: Number(current?.revision ?? 0) + 1 });
    }
    if (area === 'memories') {
      if (get) return { memories: rows('memories'), frequency: find('prefs', 'memory')?.frequency };
      return upsert('memories', { ownerId: self, author: demoUser.name });
    }
    if (area === 'memory-settings') return save('prefs', { id: 'memory', frequency: body.frequency });
    if (area === 'memory-candidates' || area === 'memory-sources') {
      const sources = rows('collections').map((row) => ({ id: row.id, title: row.title, day: now().slice(0, 10), sourceKind: 'journal', reason: 'recent' }));
      return area === 'memory-sources' ? { sources: !query.get('kind') || query.get('kind') === 'journal' ? sources : [] } : { candidates: sources };
    }
    if (area === 'reminders') return { reminders: rows('reminders') };
    if (area === 'capsules') {
      const capsule = requireRow('projects');
      const entry = rows('capsuleEntries').find((row) => row.capsuleId === id && row.authorId === self);
      if (get) return { capsule: { ...capsule, opened: !!capsule.sealedAt && String(capsule.opensAt) <= now() },
        entries: entry ? [entry] : [], ownEntryId: entry?.id ?? null, ...people(capsule) };
      if (action === 'action' && body.action === 'seal' && entry) return edit('projects', capsule, { sealedAt: now() });
      if (action === 'entry' && !capsule.sealedAt) return save('capsuleEntries',
        { ...add(body, { ...author, capsuleId: id, media: assetRefs(), hasAudio: false }), id: entry?.id ?? randomUUID() });
      throw new Error(unavailable);
    }
    if (area === 'capsule-entries') {
      if (get && !id) return { entries: rows('capsuleEntries').map((entry) => ({ ...entry, title: find('projects', String(entry.capsuleId))?.title })) };
      if (remove && !action) return drop('capsuleEntries', requireRow('capsuleEntries'));
      throw new Error('本机导览暂不保存胶囊音频。');
    }
  }

  if (root === 'p3') {
    if (area === 'spaces') {
      if (!id && get) return { spaces: rows('worlds').filter((row) => row.kind === query.get('kind') && row.state !== 'left'), next: null };
      if (!id) return save('worlds', add(body, { ...owner, scene: 'garden', petName: '小小', greetedAt: null,
        revision: 1, rosterVersion: 1, members: [...members([self]), ...newMembers()] }));
      const space = requireRow('worlds');
      if (!action && get) return { space, ...people(space) };
      if (action === 'records' && get) return { records: related('worldRecords', 'spaceId'), next: null };
      if (action === 'records') {
        const existing = detail && find('worldRecords', detail);
        const source = [...rows('worlds'), ...rows('collections'), ...rows('projects'), ...rows('memories')].find((item) => item.id === body.sourceId);
        const changes = { spaceId: id, sourceTitle: source?.title ?? null, media: assetRefs(existing ? existing.media : []) };
        return existing ? edit('worldRecords', existing, changes) : save('worldRecords', add(body, { ...author, createdAt: now(), ...changes }));
      }
      if (action === 'world') return edit('worlds', space, body.action === 'greet' ? { greetedAt: now() } : {});
      if (action === 'invite' || action === 'membership') return patchMembers('worlds', space, action);
    }
    if (area === 'records') return upsert('worldRecords', { media: assetRefs(find('worldRecords')?.media) });
    if (area === 'own') return { records: rows('worldRecords').filter((record) => record.authorId === self).map((record) =>
      ({ ...record, spaceTitle: find('worlds', String(record.spaceId))?.title })), next: null };
    if (area === 'relays-for') return { relays: [] };
    if (area === 'sources') return { sources: [...rows('worlds'), ...rows('collections'), ...rows('projects')].filter((row) =>
      row.kind === query.get('kind') || (query.get('kind') === 'album' && row.kind === 'journal')) };
  }

  throw new Error(unavailable);
}
