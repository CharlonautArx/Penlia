import { demoPeople, demoUser } from './data';

export type Row = { id: string } & Record<string, unknown>;
export type Rows = Record<string, Row[]>;
export const self = demoUser.id;
export const friend = demoPeople[0];
export const friendName = (id: string) => (id === self ? demoUser : demoPeople.find((person) => person.id === id))?.name ?? '本机好友';
export const members = (ids: string[] = [self, friend.id]) =>
  ids.map((id) => ({ id, name: friendName(id), state: 'active' }));

export function seed() {
  const now = Date.now();
  const at = (days: number, hour = 12) => {
    const date = new Date(now);
    date.setDate(date.getDate() + days);
    date.setHours(hour, 0, 0, 0);
    return date.toISOString();
  };
  const day = (days: number) => at(days).slice(0, 10);
  const alley = { id: 'preview-photo-alley', mime: 'image/jpeg', demoAsset: 'alley' };
  const coffee = { id: 'preview-photo-coffee', mime: 'image/jpeg', demoAsset: 'coffee' };
  const pottery = { id: 'preview-photo-pottery', mime: 'image/jpeg', demoAsset: 'pottery' };
  const group = { id: 'preview-weekend', name: '周末散步', ownerId: self, membersCanInvite: true, memberCount: 3,
    members: members([self, friend.id, 'demo-azhu']), active: true };
  const collection = { id: 'preview-journal', ownerId: self, kind: 'journal', title: '沿河一直走', canWrite: true, momentId: null,
    owner: demoUser.name, state: 'active', members: members() };
  const entry = { id: 'preview-journal-entry', title: '在街口碰头', collectionId: collection.id, eventDate: day(-1),
    category: 'walk', author: demoUser.name };
  const place = { id: 'preview-place', ownerId: self, kind: 'place', title: '转角的旧书店', category: 'leisure',
    notes: '窗边有个可以晒太阳的位置。', city: '杭州', location: '', tags: ['散步'], state: 'want',
    scope: 'private', spaceId: null, latitude: null, longitude: null, media: [], revision: 1, author: demoUser.name };
  const shared = { ownerId: self, owner: demoUser.name, state: 'active', members: members() };
  const world = { id: 'preview-world', ...shared, title: '晚风小院', kind: 'world', scene: 'coast', petName: '软风',
    eventDay: null, greetedAt: null, revision: 1, rosterVersion: 1 };
  const relay = { ...world, id: 'preview-relay', kind: 'relay', title: '同一场黄昏', eventDay: day(-1) };
  const record = { authorId: friend.id, author: friend.name, sourceKind: null, sourceId: null, sourceTitle: null,
    createdAt: at(-1, 19), revision: 1, memberIds: [self], media: [], icon: null, x: null, y: null };
  const wish = { id: 'preview-wish', description: '周末想和朋友喝咖啡', category: 'food', place: '河边咖啡馆',
    availableAt: null, budgetCents: null, scope: 'friends', active: true };
  const option = { id: 'preview-option', startsAt: at(2, 14), place: '河边咖啡馆' };
  return {
    settings: [{ id: 'privacy', addPolicy: 'anyone', phoneSearch: false, groupPolicy: 'friends', profilePolicy: 'friends',
      statusPolicy: 'private', momentScope: 'private', zone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai',
      quietHours: {}, showResting: false, muteIndefinitely: false, muteUntil: null, allowSilent: true, version: 1, priorityIds: [] }],
    relationGroups: [{ id: 'preview-circle', label: '亲密圈', circle: true, memberIds: [friend.id] }],
    groups: [group, { ...group, id: 'preview-invited', name: '周日看展', ownerId: friend.id, members: members([friend.id, 'demo-azhu', 'demo-linlu']), active: false }],
    invites: [{ id: 'preview-invite', groupId: 'preview-invited', name: '周日看展', inviter: friend.name, inviterId: friend.id, inviteeId: self, code: 'penlia:group:penliaDemoGroupInvitation0000001',
      memberCount: 3, expiresAt: at(2) }],
    groupLines: [
      { id: 'preview-group-2', groupId: group.id, senderId: 'demo-azhu', name: '阿竹', content: '昨天拍到的那束光。', sentAt: at(0, 10), silent: false, noReply: true, media: [coffee] },
      { id: 'preview-group-1', groupId: group.id, senderId: friend.id, name: friend.name, content: '周末去河边走走？', sentAt: at(0, 9), silent: true, noReply: false, media: [] },
    ],
    moments: [
      { id: '00000000-0000-4000-8000-000000000021', authorId: friend.id, author: friend.name,
        body: '下班从小巷走回家。灯刚亮，晚风正合适。', media: [alley], createdAt: at(0, 11), scope: null, revision: 1, groupId: null, memberIds: null },
      { id: '00000000-0000-4000-8000-000000000022', authorId: self, author: demoUser.name,
        body: '周末捏的小杯子。', media: [pottery], createdAt: at(-1, 11), scope: 'friends', revision: 1, groupId: null, memberIds: null },
    ],
    wishes: [wish],
    gatherings: [{ id: 'preview-gathering', ownerId: self, title: '周末到河边喝杯咖啡', category: 'food', mode: 'open',
      minimum: 2, state: 'interest', choiceId: null, ballotClosed: false, directProposal: true, intention: null, votes: [],
      confirmed: false, options: [option], attendees: [] }],
    collections: [collection, { ...collection, id: 'preview-collab', kind: 'collaboration', title: '周末的照片拼一起' }],
    entries: [entry, { ...entry, id: 'preview-collab-entry', collectionId: 'preview-collab' }],
    contributions: [{ id: 'preview-contribution', entryId: entry.id, authorId: friend.id, author: friend.name,
      body: '沿着河看灯慢慢亮起来。', createdAt: at(-1, 19), revision: 1, media: [alley], memberIds: [self] }],
    calendars: [{ id: 'preview-slot', ownerId: self, title: '傍晚散步', details: '天气好就沿河走。', startsAt: at(0, 17),
      endsAt: at(0, 18), revision: 1, visibility: 'private' }, { id: 'preview-busy', ownerId: friend.id,
      title: '忙碌', startsAt: at(0, 14), endsAt: at(0, 16), visibility: 'busy' }],
    calendarShares: [{ id: friend.id, name: friend.name, ownerId: friend.id, viewerId: self, access: 'busy', accepted: true }],
    projects: [
      { ...shared, id: 'preview-trip', title: '临海两日', kind: 'trip', destination: '临海', startDay: day(5), endDay: day(6), completedAt: null, journalId: null, revision: 1 },
      { ...shared, id: 'preview-capsule', title: '留给下个夏天的一封信', kind: 'capsule', opensAt: at(30), sealedAt: null },
      { ...shared, id: 'preview-map', title: '散步地图', kind: 'map' },
      { ...shared, id: 'preview-list', title: '周末清单', kind: 'list' },
    ],
    stops: [{ id: 'preview-stop', tripId: 'preview-trip', title: '逛一逛老城', eventDay: day(5), category: 'sight',
      details: '慢慢走，在小巷里拍几张照片。', sourceUrl: null, position: 0, revision: 1, author: demoUser.name,
      authorId: self, media: [alley], support: 0, myVote: null, savedItemId: null }],
    items: [place, { ...place, id: 'preview-map-place', spaceId: 'preview-map', scope: 'space' },
      { ...place, id: 'preview-saved', kind: 'saved', title: '沿河小馆', category: 'food', notes: '适合和朋友坐一下午。', media: [coffee] },
      { ...place, id: 'preview-recommended', ownerId: friend.id, author: friend.name, kind: 'saved', title: '旧城手作间', notes: '一起捏杯子。', media: [pottery] }],
    memories: [{ id: 'preview-memory', title: '那晚的河风', ownerId: self, author: demoUser.name,
      eventDay: day(-1), sourceId: collection.id, sourceKind: 'journal', memberIds: [] }],
    status: [{ id: 'preview-friend-status', ownerId: friend.id, caption: '在阳台晒太阳', emoji: '☀️', expiresAt: at(2), media: [coffee] }],
    worlds: [world, relay],
    worldRecords: [
      { ...record, id: 'preview-lamp', spaceId: world.id, kind: 'decoration', body: '窗边留一盏灯', icon: 'lamp', x: 1, y: 0 },
      { ...record, id: 'preview-frame', spaceId: world.id, kind: 'decoration', body: '', sourceKind: 'journal',
        sourceId: collection.id, sourceTitle: collection.title, icon: 'frame', x: 2, y: 1 },
      { ...record, id: 'preview-relay-post', spaceId: relay.id, kind: 'contribution', body: '路灯亮起来的时候，刚好走到河边。', media: [alley] },
    ],
    media: [alley, coffee, pottery],
    capsuleEntries: [], events: [], reminders: [], reports: [], enforcement: [], blocks: [], restrictions: [],
    prefs: [{ id: 'memory', frequency: 'monthly' }],
  } satisfies Rows;
}
