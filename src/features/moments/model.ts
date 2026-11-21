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
  body: string;
  createdAt: string;
  revision: number;
  scope: Audience | null;
  groupId: string | null;
  memberIds: string[] | null;
  media: Media[];
};
