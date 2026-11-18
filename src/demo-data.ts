export type Person = {
  id: string;
  name: string;
  bio: string;
  color: string;
};

const people: Person[] = [
  { id: 'xiaoman', name: '小满', bio: '周末想去逛花市', color: '#E4EDDB' },
  { id: 'azu', name: '阿竹', bio: '正在收集好听的歌', color: '#F3E4CF' },
  { id: 'lin', name: '林鹿', bio: '今天也带了相机', color: '#E4E5F4' },
  { id: 'tao', name: '桃子', bio: '咖啡和散步都很喜欢', color: '#F7E2DC' },
  { id: 'zhou', name: '周周', bio: '偶尔做点手工', color: '#DCEDEA' },
];

export const peopleById = new Map(people.map((person) => [person.id, person]));
export const self = { id: 'me', name: '青禾', bio: '慢慢认识有趣的人', color: '#DCEAD8' };

export type Message = {
  id: string;
  mine: boolean;
  text: string;
  time: string;
  timestamp: number;
};

type DemoComment = { id: string; text: string; authorId: string };
type PostTopic = '散步' | '音乐' | '日常';

export type Post = {
  id: string;
  authorId: string;
  time: string;
  text: string;
  topic: PostTopic;
  likes: number;
  liked: boolean;
  comments: DemoComment[];
};

export type DemoState = {
  profile: { name: string; bio: string };
  friendIds: string[];
  requestIds: string[];
  unreadIds: string[];
  messages: Record<string, Message[]>;
  posts: Post[];
};

export const initialDemo: DemoState = {
  profile: { name: self.name, bio: self.bio },
  friendIds: ['xiaoman', 'azu', 'lin'],
  requestIds: ['tao', 'zhou'],
  unreadIds: ['xiaoman', 'azu'],
  messages: {
    xiaoman: [
      { id: 'm1', mine: false, text: '刚发现花市附近有家新开的茶馆。', time: '10:21', timestamp: 3 },
      { id: 'm2', mine: false, text: '周末一起去逛花市吗？🌿', time: '10:24', timestamp: 4 },
    ],
    azu: [{ id: 'm3', mine: false, text: '给你留了一首今天的歌。', time: '09:16', timestamp: 2 }],
    lin: [{ id: 'm4', mine: false, text: '我把昨天散步的照片整理好啦。', time: '昨天', timestamp: 1 }],
  },
  posts: [
    {
      id: 'p1', authorId: 'lin', time: '今天 08:45', topic: '散步', likes: 4, liked: false,
      text: '绕了一点路回家，在巷口遇到一棵开花的树。下次还想走这条路。',
      comments: [{ id: 'c1', authorId: 'xiaoman', text: '看到这种小事，心情会好一整天。' }],
    },
    {
      id: 'p2', authorId: 'azu', time: '昨天', topic: '音乐', likes: 2, liked: false,
      text: '整理了一份适合下雨天听的歌单。第一首留给走路回家的人。', comments: [],
    },
  ],
};

export function formatTime(date: Date) {
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
