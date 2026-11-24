import type { Moment } from '../moments/model';
import type { AlbumCategory } from './album-categories';
export const audienceOptions = [
  { key: 'friends', name: '所有好友可见', help: '已互相添加的好友可以看到。' },
  { key: 'self', name: '仅自己可见', help: '只显示在你自己的空间里。' },
  { key: 'allow', name: '部分好友可见', help: '只有你选中的好友可以看到。' },
  { key: 'deny', name: '部分好友不可见', help: '你选中的好友看不到。' },
] as const;

export type Audience = { mode: typeof audienceOptions[number]['key']; ids: string[] };
export type EntryKind = 'thought' | 'journal';
export type Photo = { type: 'sample' | 'local'; id: string; after?: number };
export type Cover = { tone: 'mist' | 'dawn' | 'blue'; photo?: Photo; focus?: { x: number; y: number } };
export type Privacy = {
  access: Audience;
  history: 'all' | '3d' | '180d';
  interact: 'friends' | 'closed';
  revealReplies: 'viewers' | 'author';
};
export type Reply = { id: string; authorId: string; text: string; at: number; replyTo?: string; photoId?: string };
export type EntryDraft = {
  kind: EntryKind;
  title: string;
  text: string;
  photos: Photo[];
  location: string;
  mentions: string[];
  audience: Audience;
  videoPreview?: boolean;
  sourceId?: string;
};
export type Entry = EntryDraft & {
  id: string;
  pinned?: boolean;
  clientId?: string;
  cloudId?: string;
  ownerId: string;
  at: number;
  editedAt?: number;
  likes: number;
  liked: boolean;
  reaction?: string;
  comments: Reply[];
};
export type Album = { id: string; ownerId: string; title: string; theme?: string; categoryId?: string; photos: Photo[]; cover: number; at: number };
export type SpaceCard = {
  cover: Cover;
  privacy: Privacy;
  status: string;
  region: string;
  guestbook: Reply[];
};
export type SpaceDocument = {
  timelineCache?: Moment[];
  entries: Entry[];
  drafts: Partial<Record<EntryKind, EntryDraft>>;
  albums: Album[];
  categories?: AlbumCategory[];
  space: SpaceCard;
  guestNotes: Record<string, Reply[]>;
};

export const allFriends = (): Audience => ({ mode: 'friends', ids: [] });
export const defaultPrivacy = (): Privacy => ({ access: allFriends(), history: 'all', interact: 'friends', revealReplies: 'viewers' });
export const emptySpace = (): SpaceCard => ({
  cover: { tone: 'mist' }, privacy: defaultPrivacy(), status: '', region: '', guestbook: [],
});
export const blankDraft = (kind: EntryKind): EntryDraft => ({
  kind, title: '', text: '', photos: [], location: '', mentions: [], audience: allFriends(),
});

export function audienceName(audience: Audience) {
  return audienceOptions.find(({ key }) => key === audience.mode)?.name ?? '仅自己可见';
}

export function audienceAllows(audience: Audience, ownerId: string, viewerId: string, friends: boolean) {
  if (ownerId === viewerId) return true;
  if (!friends) return false;
  switch (audience.mode) {
    case 'friends': return true;
    case 'allow': return audience.ids.includes(viewerId);
    case 'deny': return !audience.ids.includes(viewerId);
    default: return false;
  }
}

export function canSeeEntry(entry: Entry, privacy: Privacy, viewerId: string, friends: boolean, now = Date.now()) {
  if (entry.ownerId === viewerId) return true;
  if (!audienceAllows(privacy.access, entry.ownerId, viewerId, friends)
    || !audienceAllows(entry.audience, entry.ownerId, viewerId, friends)) return false;
  if (privacy.history === 'all') return true;
  const days = privacy.history === '3d' ? 3 : 180;
  return now - entry.at <= days * 86_400_000;
}

export function selectableAudience(audience: Audience, friendIds: string[]) {
  if (audience.mode !== 'allow' && audience.mode !== 'deny') return { mode: audience.mode, ids: [] };
  return { mode: audience.mode, ids: [...new Set(audience.ids)].filter((id) => friendIds.includes(id)) };
}

export function createdTime(at: number) {
  const date = new Date(at);
  const today = new Date();
  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (today.toDateString() === date.toDateString()) return '今天 ' + time;
  today.setDate(today.getDate() - 1);
  if (today.toDateString() === date.toDateString()) return '昨天 ' + time;
  return date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric',
    ...(date.getFullYear() !== new Date().getFullYear() && { year: 'numeric' }) }) + ' ' + time;
}

export function copyDraft(entry: Entry): EntryDraft {
  const { kind, title, text, photos, location, mentions, audience, sourceId, videoPreview } = entry;
  return { kind, title, text, photos, location, mentions, audience, sourceId, videoPreview };
}
