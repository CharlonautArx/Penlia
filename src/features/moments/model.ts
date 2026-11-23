import type { Media } from './media';

export type Audience = 'private' | 'friends' | 'circle' | 'group' | 'selected';
export const scopes: Record<Audience, string> = {
  private: '仅自己',
  friends: '全部好友',
  circle: '亲密圈',
  group: '自定义关系组',
  selected: '指定好友',
};

export const momentShareCaption = '看我在朋聊分享的动态';
export const momentSharePath = '/life/moment/';

export type Moment = {
  id: string;
  collaborationId?: string | null;
  authorId: string;
  author: string;
  authorUsername?: string;
  body: string;
  createdAt: string;
  revision: number;
  forwardRequest?: ForwardRequest | null;
  forwarded?: boolean;
  canForward?: boolean;
  allowForward?: boolean | null;
  pinned?: boolean | null;
  liked?: boolean;
  likeCount?: number;
  commentCount?: number;
  scope: Audience | null;
  groupId: string | null;
  memberIds: string[] | null;
  media: Media[];
};


export type MomentComment = {
  id: string;
  authorId: string;
  author: string;
  body: string;
  createdAt: string;
};

export const momentChatSharePath = '/life/moment-share/';

export type ForwardStatus = 'pending' | 'approved' | 'rejected' | 'published' | 'revoked';
export type ForwardRequest = { id: string; status: ForwardStatus; publishedId?: string | null };
export const forwardLabels: Record<ForwardStatus, string> = {
  pending: '待同意', approved: '已同意', rejected: '已拒绝', published: '已转发', revoked: '授权已撤回',
};

export type MomentNotice = {
  id: string; momentId: string; actorId: string; actor: string; createdAt: string; unread: boolean;
  kind: 'ye' | 'comment' | 'forward_request' | 'forward_result';
  comment?: string | null; requestId?: string | null; status?: ForwardStatus | null; decision?: ForwardStatus | null;
};
