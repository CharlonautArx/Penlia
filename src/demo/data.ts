import type { Relationship, User } from '../services/api';
import type { TextMessage } from '../services/im';

export const demoUser: User = { id: 'demo-self', username: 'qinghe', name: '青禾', bio: '慢慢认识有趣的人' };

export const demoPeople: User[] = [
  { id: 'demo-xiaoman', username: 'xiaoman', name: '小满', bio: '周末想去逛花市' },
  { id: 'demo-azhu', username: 'azhu', name: '阿竹', bio: '正在收集好听的歌' },
  { id: 'demo-linlu', username: 'linlu', name: '林鹿', bio: '今天也带了相机' },
  { id: 'demo-taozi', username: 'taozi', name: '桃子', bio: '咖啡和散步都很喜欢' },
  { id: 'demo-zhouzhou', username: 'zhouzhou', name: '周周', bio: '偶尔做点手工' },
];

export function demoRelationship(user: User, status: Relationship['status'], outgoing: boolean): Relationship {
  const { id, ...profile } = user;
  return { ...profile, id: 'relationship-' + id, userId: id, status, outgoing, chatReady: status === 'accepted' };
}

export const demoRelationships = demoPeople.slice(0, 4).map((user, index) =>
  demoRelationship(user, index === 3 ? 'pending' : 'accepted', false));

function sample(id: string, text: string, minutesAgo: number, mine = false): TextMessage {
  return { id, text, mine, timestamp: Date.now() - minutesAgo * 60_000 };
}

export const demoMessages: Record<string, TextMessage[]> = {
  'demo-xiaoman': [
    sample('demo-1', '刚发现花市附近有家新开的茶馆。', 26),
    sample('demo-2', '听起来不错！那边最近有什么花？', 23, true),
    sample('demo-3', '摊主说这周会有洋甘菊，还有几种没见过的绣球。', 21),
    sample('demo-4', '周末一起去逛花市吗？🌿', 18),
  ],
  'demo-azhu': [
    sample('demo-5', '给你留了一首今天的歌。', 76),
    sample('demo-6', '是那首适合下雨天听的吗？', 61, true),
    sample('demo-7', '对，特别适合戴着耳机散步。', 54),
  ],
  'demo-linlu': [
    sample('demo-8', '我把昨天散步的照片整理好啦。', 1500),
  ],
};

export const demoPosts = [
  {
    id: 'demo-post-1', author: '林鹿', text: '绕了一点路回家，在巷口遇到一棵开花的树。下次还想走这条路。',
    time: '今天 08:45', likes: 4, liked: false,
    comments: [{ id: 'demo-comment-1', author: '小满', text: '看到这种小事，心情会好一整天。' }],
  },
  {
    id: 'demo-post-2', author: '阿竹', text: '整理了一份适合下雨天听的歌单。第一首留给走路回家的人。',
    time: '昨天 19:30', likes: 2, liked: false, comments: [],
  },
];
