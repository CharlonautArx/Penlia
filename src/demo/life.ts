import { canRecall, recalledQuote } from '../features/chat/recall-model';
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import type { Relationship } from '../services/api';
import { demoMomentInteractions } from './moment-interactions';
import { demoPortrait } from './visuals';
import { demoPeople, demoUser } from './data';
import { friend, friendName, members, self, type Row, type Rows } from './life-fixtures';

type Input = Record<string, unknown>;
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const list = (value: unknown): Row[] => Array.isArray(value) ? value : [];
const newestFirst = (a: Row, b: Row) => String(b.createdAt).localeCompare(String(a.createdAt)) || b.id.localeCompare(a.id);
const now = () => new Date().toISOString();
const unavailable = '这个操作仅在正式服务中可用。预览数据保存在本机。';
const author = { authorId: self, author: demoUser.name, createdAt: '', revision: 1 };
const owner = { ownerId: self, owner: demoUser.name, state: 'active', canWrite: true };
const add = (body: Input, fields: Input = {}) => ({ ...body, ...fields, id: randomUUID() });
const waiting = (ids: string[]) => members(ids).map((person) => ({ ...person, state: 'invited' }));

export function offlineRequest(store: Rows, path: string, method: string, body: Input, relationships: Relationship[] = []) {
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
    if (!row) throw new Error('找不到这条本机记录。');
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

  if (root === 'moment-space-preferences') {
    const setting = find('momentSpacePreferences', self);
    if (get) return { privacy: setting ?? { mode: 'friends', ids: [], history: 'all' }, configured: !!setting };
    const { mode, history, date, zone } = body;
    const ids = mode === 'allow' || mode === 'deny' ? strings(body.ids) : [];
    if (!['friends','self','allow','deny'].includes(String(mode)) || !['all','3d','180d','custom'].includes(String(history)) ||
      (mode === 'allow' || mode === 'deny') && !ids.length) throw new Error('请选择有效的空间权限和展示范围。');
    return { privacy: save('momentSpacePreferences', { id: self, mode, ids, history,
      date: history === 'custom' ? date : null, zone: history === 'custom' ? zone : null }), configured: true };
  }
  if (root === 'chat-records') {
    if (get) {
      const record = requireRow('chatRecords');
      if (record.ownerId !== self) throw new Error('找不到可查看的聊天记录。');
      return { lines: list(record.lines).map(({ mediaIds, ...line }) => ({
        ...line, media: strings(mediaIds).flatMap((file) => find('media', file) ?? []),
      })) };
    }
    if (body.peerId && !relationships.some((friend) => friend.userId === body.peerId && friend.status === 'accepted'))
      throw new Error('这位好友当前不可用。');
    if (body.groupId && !find('groups', String(body.groupId))?.active) throw new Error('这个群聊当前不可用。');
    if (body.peerId && body.groupId) throw new Error('请选择一个会话。');
    const lines = list(body.lines);
    if (!lines.length || lines.length > 30 || lines.some((line) => strings(line.mediaIds).some((file) => !find('media', file))))
      throw new Error('聊天记录或附件无效。');
    const existing = rows('chatRecords').find((record) => record.ownerId === self && record.clientId === body.clientId);
    return existing ?? save('chatRecords', add(body, { ownerId: self }));
  }
  if (root === 'chat-favorites' && method === 'POST') {
    const record = requireRow('chatRecords', String(body.recordId));
    if (record.ownerId !== self || record.peerId || record.groupId) throw new Error('找不到可收藏的聊天记录。');
    return rows('items').find((item) => item.chatRecordId === record.id) ?? save('items', add({
      chatRecordId: record.id, kind: 'saved', title: body.title, category: 'other',
      notes: '', location: '', tags: [], state: 'done', scope: 'private', media: [],
    }, { ...owner, author: demoUser.name }));
  }
  if (root === 'moment-media') {
    if (get) throw new Error(unavailable);
    if (remove) {
      const media = find('media', area);
      if (media && !rows('moments').some((moment) => list(moment.media).some((entry) => entry.id === media.id))
        && !media.commentId) drop('media', media);
      return {};
    }
    const mime = String(body.mime);
    if (!['image/jpeg', 'image/png', 'video/mp4'].includes(mime) || typeof body.base64 !== 'string'
        || body.base64.length > 6_000_000) throw new Error('无法保存该本机附件。');
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
    let demoThumbnail: string | undefined;
    if (mime === 'image/jpeg' && typeof body.thumbnail === 'string' && body.thumbnail.length <= 131072) {
      demoThumbnail = 'data:image/jpeg;base64,' + body.thumbnail;
      if (Platform.OS !== 'web') {
        const file = new File(new Directory(Paths.document, 'demo-media'), asset + '-thumb.jpg');
        file.write(body.thumbnail, { encoding: 'base64' });
        demoThumbnail = file.uri;
      }
    }
    return { media: save('media', { id: asset, mime, demoUri, demoThumbnail }) };
  }

  if (root === 'privacy') {
    const settings = requireRow('settings', 'privacy');
    if (!area) return { settings: get ? settings : edit('settings', settings, { version: Number(settings.version) + 1 }), priorityIds: settings.priorityIds };
    if (area === 'priority') return save('settings', { ...settings, priorityIds: strings(body.ids) });
    if (area === 'blocks') return { blocks: rows('blocks') };
    if (area === 'restricted') return { restrictions: rows('restrictions') };
    if (area === 'devices' && get) return { devices: [{ id: 'demo-device', nickname: '当前设备', current: true, firstSeen: null, expiresAt: now() }] };
    if (area === 'devices' && id === 'label') return {};
    if (area === 'requests' && get) return { requests: [] };
    if (area === 'export' && get) return { demo: true, settings };
  }
  if (root === 'relationship-groups') {
    if (get) return { groups: rows('relationGroups') };
    const original = find('relationGroups', area);
    if (original && !original.circle) {
      store.moments = rows('moments').map((moment) => moment.scope === 'group' && moment.groupId === original.id
        && !Array.isArray(moment.memberIds) ? { ...moment, memberIds: strings(original.memberIds) } : moment);
    }
    return upsert('relationGroups');
  }
  if (root === 'people' && area && get) return { user: demoPeople.find((person) => person.id === area) };
  if (root === 'group-invites') {
    function valid(invite: Row) {
      const group = find('groups', String(invite.groupId));
      const inviter = String(invite.inviterId ?? group?.ownerId);
      return group && !group.active && (invite.inviteeId ?? self) === self &&
        new Date(String(invite.expiresAt)).getTime() > Date.now() &&
        requireRow('settings', 'privacy').groupPolicy === 'friends' &&
        relationships.some(r => r.userId === inviter && r.status === 'accepted') &&
        list(group.members).some(m => m.id === inviter);
    }
    const invitations = rows('invites').filter(valid);
    if ((get && !area) || (area === 'resolve' && method === 'POST')) return {
      invitations: invitations.filter(i => get || (i.code ?? 'penlia:group:penliaDemoGroupInvitation0000001') === body.code)
        .map(i => { const g = requireRow('groups', String(i.groupId)); return { ...i, avatar: g.avatar,
          memberCount: list(g.members).filter(m => m.id !== self).length }; }),
    };
    const invite = invitations.find(i => i.id === (get ? area : body.id));
    if (!invite) throw new Error('此邀请不可用。');
    const group = requireRow('groups', String(invite.groupId));
    const roster = list(group.members).filter(m => m.id !== self);
    if (get && id === 'members') return { members: roster.filter(m => !find('blocks', m.id)).map(m => ({
      name: m.name, portrait: demoPortrait(demoPeople.find(p => p.id === m.id)?.username ?? ''),
    })) };
    if (method === 'POST' && (area === 'accept' || area === 'decline')) {
      drop('invites', invite);
      if (area === 'accept') {
        save('groups', { ...group, active: true, members: [...roster, ...members([self])], memberCount: roster.length + 1 });
        return { groupId: group.id };
      }
      return {};
    }
  }
  if (root === 'groups') {
    if (!area) return get ? { groups: rows('groups').filter((row) => row.active) }
      : save('groups', add(body, { ownerId: self, active: true, memberCount: 1, members: members([self]) }));
    const group = requireRow('groups');
    if (!group.active) throw new Error('请先在本机接受这份本机邀请。');
    if (!id) return remove ? drop('groups', group) : { group, ...people(group) };
    if (id === 'avatar' && method === 'PUT') {
      if (group.ownerId !== self || typeof body.avatar !== 'string' || body.avatar.length > 32768)
        throw new Error('无法修改该群头像。');
      return save('groups', { ...group, avatar: body.avatar });
    }
    if (id === 'leave') return save('groups', { ...group, active: false });
    if (id === 'recall' && method === 'POST') {
      const line = related('groupLines', 'groupId', area).find((entry) => entry.id === body.id);
      if (!line || line.senderId !== self) throw new Error('找不到可以撤回的已发送消息。');
      if (line.recalled) return {};
      if (!canRecall(true, Date.parse(String(line.sentAt)))) throw new Error('这条消息已超过两分钟，无法撤回。');
      return save('groupLines', { ...line, recalled: true, content: '', media: [], recordId: null, quote: null });
    }
    if (id === 'messages') {
      const lines = related('groupLines', 'groupId', area);
      if (get) {
        const before = query.get('before');
        const offset = before ? lines.findIndex((line) => line.id === before) + 1 : 0;
        const recalled = new Set(lines.filter((line) => line.recalled).map((line) => line.id));
        const page = lines.slice(offset, offset + 40).map((line) => {
          const quote = line.quote as { id?: string; body?: string } | undefined;
          return quote?.id && recalled.has(quote.id) ? { ...line, quote: { ...quote, body: recalledQuote } } : line;
        });
        return { messages: page, next: lines.length > offset + 40 ? page.at(-1)?.id : null };
      }
      const duplicate = related('groupLines', 'groupId', area).find((line) => line.clientId === body.clientId);
      if (duplicate) return duplicate;
      const reply = body.replyTo ? lines.find((line) => line.id === body.replyTo && !line.recalled) : undefined;
      const record = body.recordId ? find('chatRecords', String(body.recordId)) : undefined;
      if (body.replyTo && !reply || body.recordId && record?.groupId !== area) throw new Error('无法使用这条聊天记录。');
      return save('groupLines', add(body, { groupId: area, senderId: self, name: demoUser.name, sentAt: now(), media: assetRefs(),
        quote: reply && { id: reply.id, author: reply.name, body: String(reply.content || (reply.recordId ? '[聊天记录]' : '[附件]')).slice(0, 180) } }));
    }
  }
  if (['moment-chat-shares','moment-forward-requests','moment-notifications'].includes(root)) {
    const interactions = demoMomentInteractions(store, relationships);
    if (root === 'moment-notifications') return interactions.notificationRoute(area, body, query);
    if (root === 'moment-chat-shares' && get && area) return interactions.shared(area);
    if (root === 'moment-forward-requests' && method === 'POST' && area) return interactions.forwardAction(area, body);
    throw new Error(unavailable);
  }
  if (root === 'moments') {
    const selected = query.get('author');
    const timeline = selected === self && query.get('order') === 'pinned';
    const interactions = demoMomentInteractions(store, relationships);
    const { visible, project, commentVisible } = interactions;
    const audienceIds = () => body.scope === 'group'
      ? strings(find('relationGroups', String(body.groupId))?.memberIds) : body.memberIds;
    if (area === 'resolve-ids' && method === 'POST') {
      const keys = new Set(Array.isArray(body.keys) ? body.keys : []);
      return { identities: rows('moments').filter((item) => item.authorId === self && visible(item)
        && (keys.has(item.id) || keys.has(item.clientId))).map(({ id, clientId }) => ({ id, clientId })) };
    }
    if (area === 'count' && get) return { count: rows('moments').filter((item) => item.authorId === self).length };
    if (!area && method === 'POST') {
      const previous = rows('moments').find((item) => item.authorId === self && item.clientId === body.clientId);
      const media = list(assetRefs());
      if (strings(body.mediaIds).length !== media.length || media.length > 20 ||
        (media.length > 1 && media.some((asset) => asset.mime === 'video/mp4'))) throw new Error('请选择最多 20 张照片或一段短视频。');
      return previous ?? save('moments', add({ clientId: body.clientId, body: body.body, location: body.location,
        scope: body.scope, memberIds: audienceIds(), groupId: body.groupId }, { ...author, createdAt: now(), media }));
    }
    if (area) {
      const moment = requireRow('moments');
      if (!visible(moment)) throw new Error('找不到可查看的内容。');
      if (id === 'original' && get) {
        const source = find('moments', String(moment.sourceMomentId));
        if (!source || !visible(source)) throw new Error('原动态当前不可见。');
        return { moment: project(source) };
      }
      if (id === 'share-chat' && method === 'POST') return { id: interactions.share(moment, body.receiver).id };
      if (id === 'request-forward' && method === 'POST') return interactions.forwardRequest(moment, self);
      if (id === 'forward-permission' && method === 'PUT') {
        if (moment.authorId !== self || moment.sourceMomentId || typeof body.allowed !== 'boolean') throw new Error('无法修改这个动态。');
        save('moments', { ...moment, allowForward: body.allowed });
        if (!body.allowed) interactions.revoke(moment.id);
        return { canForward: body.allowed };
      }
      if (id === 'like' && method === 'PUT') {
        if (typeof body.liked !== 'boolean') throw new Error('请选择点赞状态。');
        const likes = strings(moment.demoLikes).filter((user) => user !== self);
        if (body.liked) {
          likes.push(self);
          interactions.notify(moment, self, moment.authorId, 'ye', moment.id + ':' + self);
        }
        return project(save('moments', { ...moment, demoLikes: likes }));
      }
      if (id === 'comments') {
        if (get) {
          const all = rows('momentComments').filter((entry) => entry.momentId === area && commentVisible(moment, entry)).sort(newestFirst);
          const before = query.get('before');
          const start = before ? all.findIndex((entry) => entry.id === before) + 1 : 0;
          const page = all.slice(start, start + 30);
          return { comments: page.map((row) => ({ ...row, replyTo: all.some((parent) => parent.id === row.replyTo) ? row.replyTo : undefined })), next: all.length > start + 30 ? page.at(-1)?.id ?? null : null };
        }
        if (remove) {
          const comment = requireRow('momentComments', query.get('id') ?? '');
          if (comment.momentId !== area || (moment.authorId !== self && comment.authorId !== self)) throw new Error('无法删除这条评论。');
          drop('momentComments', comment);
          store.momentComments = rows('momentComments').map((row) => row.replyTo === comment.id ? { ...row, replyTo: null } : row);
          store.momentNotifications = rows('momentNotifications').filter((notice) => notice.commentId !== comment.id);
          return {};
        }
        const previous = rows('momentComments').find((entry) => entry.momentId === area && entry.clientId === body.clientId);
        if (previous) return previous;
        const text = typeof body.body === 'string' ? body.body.trim() : '';
        const photo = body.mediaId ? requireRow('media', String(body.mediaId)) : undefined;
        if (text.length > 500 || (!text && !photo) || (photo && (photo.mime !== 'image/jpeg' || photo.commentId))) throw new Error('评论内容或图片无效。');
        const parent = body.replyTo ? requireRow('momentComments', String(body.replyTo)) : undefined;
        if (parent && (parent.momentId !== area || !commentVisible(moment, parent))) throw new Error('该评论当前不可见。');
        const comment = save('momentComments', add({ body: text, clientId: body.clientId, photo, replyTo: parent?.id },
          { ...author, authorUsername: demoUser.username, momentId: area, createdAt: now() }));
        if (photo) save('media', { ...photo, commentId: comment.id });
        interactions.notify(moment, self, moment.authorId, 'comment', comment.id, comment.id);
        return comment;
      }
      if (get) return { moment: project(moment) };
      if (moment.authorId !== self) throw new Error('只有发布者能修改这条动态。');
      if (id === 'pin' && method === 'PUT') {
        if (typeof body.pinned !== 'boolean') throw new Error('请选择置顶状态。');
        return save('moments', { ...moment, pinned: body.pinned });
      }
      if (remove) {
        const affected = new Set([area, ...rows('moments').filter((item) => item.sourceMomentId === area).map((item) => item.id)]);
        store.momentComments = rows('momentComments').filter((entry) => !affected.has(String(entry.momentId)));
        store.momentNotifications = rows('momentNotifications').filter((entry) => !affected.has(String(entry.momentId)));
        store.momentForwards = rows('momentForwards').filter((entry) => !affected.has(String(entry.momentId)));
        store.momentShares = rows('momentShares').filter((entry) => !affected.has(String(entry.momentId)));
        store.moments = rows('moments').filter((item) => !affected.has(item.id));
        return {};
      }
      if (moment.sourceMomentId || method !== 'PATCH') throw new Error('无法修改这个动态。');
      if (body.scope === 'private') interactions.revoke(moment.id);
      return save('moments', { ...moment, body: body.body ?? moment.body, location: body.location ?? moment.location, scope: body.scope,
        groupId: body.groupId, memberIds: body.scope === 'group' && moment.scope === 'group' && body.groupId === moment.groupId
          ? moment.memberIds ?? audienceIds() : audienceIds(), revision: Number(moment.revision) + 1 });
    }
    const all = rows('moments').filter((item) => visible(item) && (!selected || item.authorId === selected)
      && (query.get('feed') !== 'friends' || item.authorId !== self))
      .sort((a, b) => (timeline ? Number(!!b.pinned) - Number(!!a.pinned) : 0) || newestFirst(a, b));
    const cursor = query.get('before');
    const offset = cursor ? all.findIndex((item) => item.id === cursor) + 1 : 0;
    const page = all.slice(offset, offset + 20);
    return { moments: page.map(project), next: all.length > offset + 20 ? page.at(-1)?.id ?? null : null };
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
    if (area === 'boundary') {
      if (!get) {
        if (method !== 'POST') throw new Error(unavailable);
        const chosen = new Set(strings(body.ids));
        store.reports = rows('reports').map((report) => body.all === true || chosen.has(report.id) ? { ...report, hidden: true } : report);
        return {};
      }
      const reports = rows('reports').slice().sort(newestFirst);
      const before = query.get('before');
      const page = reports.slice(before ? reports.findIndex(({ id }) => id === before) + 1 : 0)
        .filter((item) => !item.hidden).slice(0,51);
      return { reports: page.slice(0,50), next: page[50] ? page[49].id : null, actions: rows('enforcement'), canReview: false };
    }
    if (area === 'reports' && method === 'POST') {
      const existing = rows('reports').find((report) => report.clientId === body.clientId);
      if (existing) return { id: existing.id };
      const peer = relationships.some((friend) => friend.userId === body.peerId && friend.status === 'accepted');
      const group = body.groupId && find('groups', String(body.groupId))?.active &&
        rows('groupLines').some((line) => line.groupId === body.groupId && line.id === body.anchorId && line.senderId !== self);
      if (!(group || (peer && list(body.messages).some((line) => line.id === body.anchorId && line.mine === false))))
        throw new Error('请选择对方发送的消息。');
      const at = now();
      return save('reports', add({ clientId: body.clientId }, { status: 'pending', kind: body.kind, submittedAt: at, createdAt: at }));
    }
    if (area === 'groups' && action === 'call') {
      if (get) return { call: null, available: false };
      throw new Error('多人通话需要正式的 RTC 服务。可在单聊中查看本机通话预览。');
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
      if (find('items')?.chatRecordId && !remove && body.scope !== 'private') throw new Error('聊天收藏仅自己可见。');
      if (action === 'copy') return save('items', add(requireRow('items'), { ...owner, scope: 'private', author: demoUser.name }));
      return upsert('items', { ownerId: self, author: demoUser.name, tags: strings(body.tags), media: assetRefs(find('items')?.media) });
    }
    if (area === 'place-resonance') return { matches: [] };
    if (area === 'status') {
      const current = rows('status').find((row) => row.ownerId === (id || self));
      if (get) return { status: current && (current.ownerId === self || !current.scope || current.scope === 'friends'
        || (current.scope === 'selected' && strings(current.memberIds).includes(self))) &&
        (current.expiresAt === null || String(current.expiresAt) > now()) ? current : null };
      if (id && id !== self) throw new Error('只能修改自己的状态。');
      if (!remove && current?.expiresAt === null && body.expiresAt !== null) throw new Error('请更新朋聊后编辑这个长期状态。');
      if (!remove && body.scope === 'selected' && !strings(body.memberIds).length) throw new Error('请选择可见好友。');
      if (remove) return current ? drop('status', current) : {};
      return save('status', { ...(current ?? { id: self }), ...body, emoji: body.emoji ?? '', ownerId: self, media: assetRefs(current?.media),
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
