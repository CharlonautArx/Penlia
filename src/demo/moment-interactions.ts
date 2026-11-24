import { randomUUID } from 'expo-crypto';

import type { Relationship } from '../services/api';
import { demoPeople, demoUser } from './data';
import { type Row, type Rows } from './life-fixtures';

type Input = Record<string, unknown>;
const self = demoUser.id;
const array = (value: unknown): string[] => Array.isArray(value) ? value : [];
const missing = () => new Error('这条动态或授权当前不可用。');
const permission = () => new Error('这条动态当前无法转发。');
const name = (id: unknown) => id === self ? demoUser.name : demoPeople.find((person) => person.id === id)?.name ?? '好友';

export function demoMomentInteractions(store: Rows, relationships: Relationship[]) {
  const rows = (key: string) => store[key] ?? [];
  const find = (key: string, id: unknown) => rows(key).find((row) => row.id === id);
  function save(key: string, row: Row) {
    store[key] = [row, ...rows(key).filter((other) => other.id !== row.id)];
    return row;
  }
  const accepted = (id: unknown) => relationships.some((friend) => friend.userId === id && friend.status === 'accepted');
  const friends = (a: unknown, b: unknown) => a !== b && (a === self ? accepted(b) : b === self ? accepted(a) : accepted(a) && accepted(b));
  const blocked = (a: unknown, b: unknown) => (a === self && !!find('blocks', b)) || (b === self && !!find('blocks', a));
  const restricted = (owner: unknown, viewer: unknown) => owner === self && !!find('restrictions', viewer);
  const baseVisible = (post: Row, viewer: unknown) => post.authorId === viewer ||
    (friends(post.authorId, viewer) && !blocked(post.authorId, viewer) && !restricted(post.authorId, viewer) && (
      post.scope === 'friends' || post.scope == null ||
      (post.scope === 'selected' && array(post.memberIds).includes(String(viewer))) ||
      (post.authorId === self && (post.scope === 'group' || post.scope === 'circle') &&
        rows('relationGroups').some((group) => (post.scope === 'circle' ? group.circle === true : group.id === post.groupId) &&
          array(group.memberIds).includes(String(viewer))) &&
        (post.scope === 'circle' || !Array.isArray(post.memberIds) || array(post.memberIds).includes(String(viewer))))
    ));
  const canForward = (post: Row) => !post.sourceMomentId && post.allowForward !== false && post.scope !== 'private';

  function visible(post: Row, viewer: unknown = self): boolean {
    if (!baseVisible(post, viewer)) return false;
    if (!post.sourceMomentId) return true;
    const source = find('moments', post.sourceMomentId);
    return !!source && canForward(source) && baseVisible(source, viewer) && baseVisible(source, post.authorId) &&
      rows('momentForwards').some((item) => item.momentId === source.id && item.publishedId === post.id &&
        item.requester === post.authorId && item.status === 'published');
  }

  const commentVisible = (post: Row, item: Row) => visible(post, item.authorId)
    && !blocked(item.authorId, self) && !restricted(item.authorId, self);

  function project(post: Row) {
    const { sourceMomentId, demoLikes, allowForward, ...data } = post;
    const likes = array(demoLikes).filter((actor) => visible(post, actor) && !blocked(actor, self) && !restricted(actor, self));
    const comments = rows('momentComments').filter((item) => item.momentId === post.id &&
      commentVisible(post, item));
    return { ...data, authorUsername: post.authorId === self ? demoUser.username : demoPeople.find((person) => person.id === post.authorId)?.username,
      pinned: post.authorId === self ? !!post.pinned : null, forwarded: !!sourceMomentId,
      ...(post.authorId === self && { allowForward: allowForward !== false }),
      canForward: canForward(post), forwardRequest: rows('momentForwards').find((item) => item.momentId === post.id && item.requester === self),
      liked: likes.includes(self), likeCount: likes.length, commentCount: comments.length };
  }

  function notify(moment: Row, actor: unknown, recipient: unknown, kind: string, key: string, commentId?: string, requestId?: string) {
    if (actor === recipient || rows('momentNotifications').some((item) => item.kind === kind && item.key === key && item.recipient === recipient)) return;
    save('momentNotifications', { id: randomUUID(), momentId: moment.id, actorId: actor, recipient, kind, key,
      commentId, requestId, createdAt: new Date().toISOString(), unread: true });
  }

  function revoke(moment: string) {
    const post = find('moments', moment);
    store.momentForwards = rows('momentForwards').map((item) => {
      if (item.momentId !== moment || !['pending','approved','published'].includes(String(item.status))) return item;
      if (post) notify(post, post.authorId, item.requester, 'forward_result', item.id + ':revoked', undefined, item.id);
      return { ...item, status: 'revoked' };
    });
    store.momentShares = rows('momentShares').filter((item) => item.momentId !== moment);
  }

  function forwardRequest(post: Row, requester: string) {
    if (!canForward(post) || !visible(post, requester)) throw permission();
    const previous = rows('momentForwards').find((item) => item.momentId === post.id && item.requester === requester);
    if (previous) return previous;
    const request = save('momentForwards', { id: randomUUID(), momentId: post.id, requester,
      status: post.authorId === requester ? 'approved' : 'pending' });
    notify(post, requester, post.authorId, 'forward_request', request.id, undefined, request.id);
    return request;
  }

  function forwardAction(id: string, body: Input) {
    const request = find('momentForwards', id);
    const post = request && find('moments', request.momentId);
    if (!request || !post) throw missing();
    const action = String(body.action);
    const allowed = canForward(post) && visible(post, request.requester);
    if (action === 'publish') {
      if (request.requester !== self || !allowed) throw permission();
      if (request.status === 'published' && find('moments', request.publishedId)) return request;
      if (request.status !== 'approved') throw permission();
      const forward = save('moments', { id: randomUUID(), authorId: self, author: demoUser.name,
        body: '', media: [], scope: 'friends', sourceMomentId: post.id, createdAt: new Date().toISOString(), revision: 1 });
      return save('momentForwards', { ...request, status: 'published', publishedId: forward.id });
    }
    const simulated = body.simulateAuthor === true && request.requester === self && post.authorId !== self;
    if (post.authorId !== self && !simulated) throw missing();
    const status = ({ approve: 'approved', reject: 'rejected', revoke: 'revoked' } as Record<string,string>)[action];
    if (!status || (action === 'revoke' ? !['published','approved'].includes(String(request.status)) :
      request.status !== 'pending' || (action === 'approve' && !allowed))) throw permission();
    notify(post, post.authorId, request.requester, 'forward_result', request.id + ':' + status, undefined, request.id);
    return save('momentForwards', { ...request, status });
  }

  function share(post: Row, receiver: unknown) {
    if (!canForward(post) || !visible(post) || !visible(post, receiver) || !friends(self, receiver) || blocked(self, receiver))
      throw new Error('这位好友当前没有查看这条动态的权限。');
    return rows('momentShares').find((item) => item.momentId === post.id && item.sender === self && item.receiver === receiver) ??
      save('momentShares', { id: randomUUID(), momentId: post.id, sender: self, receiver });
  }

  function shared(id: string) {
    const ticket = find('momentShares', id);
    const post = ticket && find('moments', ticket.momentId);
    if (!ticket || !post || ![ticket.sender, ticket.receiver].includes(self) || !canForward(post) ||
      !friends(ticket.sender, ticket.receiver) || blocked(ticket.sender, ticket.receiver) ||
      !visible(post, ticket.sender) || !visible(post, ticket.receiver)) throw missing();
    return { moment: project(post) };
  }

  function notificationRoute(area: string | undefined, body: Input, query: URLSearchParams) {
    if (area === 'read') {
      store.momentNotifications = rows('momentNotifications').map((item) => item.recipient === self &&
        array(body.ids).includes(item.id) ? { ...item, unread: false } : item);
      return {};
    }
    if (area === 'simulate') {
      const post = rows('moments').find((item) => item.authorId === self && canForward(item));
      const actor = relationships.find((person) => post && visible(post, person.userId) && person.status === 'accepted')?.userId;
      if (!post || !actor) throw new Error('先发布一条允许好友查看的动态，再模拟互动。');
      const key = 'demo-interactions:' + post.id + ':' + actor;
      if (find('momentDemoEvents', key)) return {};
      save('moments', { ...post, demoLikes: [...new Set([...array(post.demoLikes), actor])] });
      const comment = save('momentComments', { id: randomUUID(), momentId: post.id, authorId: actor,
        author: name(actor), body: '这段生活我也喜欢。', createdAt: new Date().toISOString() });
      notify(post, actor, self, 'ye', post.id + ':' + actor);
      notify(post, actor, self, 'comment', comment.id, comment.id);
      forwardRequest(post, actor);
      save('momentDemoEvents', { id: key });
      return {};
    }
    const notifications = rows('momentNotifications').filter((item) => {
      const post = find('moments', item.momentId);
      return item.recipient === self && !!post && visible(post) && visible(post, item.actorId) &&
        !blocked(self, item.actorId) && !restricted(item.actorId, self);
    }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || b.id.localeCompare(a.id));
    if (query.get('badge') === '1') return { unread: notifications.some((item) => item.unread) };
    const cursor = query.get('before');
    const index = cursor ? notifications.findIndex((item) => item.id === cursor) + 1 : 0;
    const page = notifications.slice(index, index + 30);
    return { notifications: page.map((item) => ({
      id: item.id, momentId: item.momentId, actorId: item.actorId, actor: name(item.actorId),
      kind: item.kind, unread: item.unread, createdAt: item.createdAt, requestId: item.requestId,
      decision: item.kind === 'forward_result' ? String(item.key).split(':')[1] : undefined,
      comment: find('momentComments', item.commentId)?.body, status: find('momentForwards', item.requestId)?.status,
    })), next: notifications.length > index + 30 ? page.at(-1)?.id ?? null : null };
  }

  return { visible, project, commentVisible, notify, revoke, forwardRequest, forwardAction, share, shared, notificationRoute };
}
