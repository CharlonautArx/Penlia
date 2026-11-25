import type { Relationship, User } from '../services/api';
import type { TextMessage } from '../services/im';

export const demoUser: User = { id: 'demo-self', username: 'qinghe', name: '青禾', bio: '最近在收集好喝的店。' };

export const demoPeople: User[] = [
  { id: 'demo-xiaoman', username: 'xiaoman', name: '小满', bio: '在城市里慢慢走。' },
  { id: 'demo-azhu', username: 'azhu', name: '阿竹', bio: '歌单常驻更新中' },
  { id: 'demo-linlu', username: 'linlu', name: '林鹿', bio: '带相机出门的人' },
  { id: 'demo-shenyan', username: 'shenyan', name: '沈言', bio: '有空来一局桌游' },
  { id: 'demo-chenmo', username: 'chenmo', name: '陈默', bio: '下班就切换飞行模式' },
  { id: 'demo-taoxi', username: 'taoxi', name: '桃溪', bio: '做陶容易，收拾很难。' },
  { id: 'demo-beiyang', username: 'beiyang', name: '北洋', bio: '这周想看场电影' },
  { id: 'demo-yucheng', username: 'yucheng', name: '余橙', bio: '走到哪儿吃到哪儿' },
  { id: 'demo-xiaohe', username: 'xiaohe', name: '小何', bio: '想把周末过得慢一点' },
  { id: 'demo-taozi', username: 'taozi', name: '桃子', bio: '咖啡和散步都很喜欢' },
  { id: 'demo-zhouzhou', username: 'zhouzhou', name: '周周', bio: '偶尔做点手工' },
];

export function demoRelationship(user: User, status: Relationship['status'], outgoing: boolean): Relationship {
  const { id, ...profile } = user;
  return { ...profile, id: 'relationship-' + id, userId: id, status, outgoing, chatReady: status === 'accepted' };
}

export const demoRelationships = demoPeople.slice(0, 10).map((user, index) =>
  ({
    ...demoRelationship(user, index === 9 ? 'pending' : 'accepted', false),
    requestedAt: new Date(Date.now() - (index + 1) * 86_400_000).toISOString(),
    ...(index === 9 ? { verificationMessage: '你好，我是桃子。上次在手作活动见过，想和你交换一下陶艺照片。' } : {}),
  }));

function sample(id: string, text: string, minutesAgo: number, mine = false): TextMessage {
  return { id, text, mine, timestamp: Date.now() - minutesAgo * 60_000 };
}

export const demoMessages: Record<string, TextMessage[]> = {
  'demo-xiaoman': [
    sample('demo-17', '对了，你那台老相机修好了吗？', 144),
    sample('demo-18', '修好了！换了个快门线，还没来得及试。', 141, true),
    sample('demo-19', '那得找个晴天好好试一下。', 138),
    sample('demo-1', '周末天气好像不错，想不想出来走走？', 66),
    sample('demo-2', '想！我收藏了几家店，都是你会喜欢的那种。', 63, true),
    sample('demo-3', '哈哈你太懂我了。先喝杯咖啡，再一起去看花？', 61),
    sample('demo-4', '可以呀。花市旁边那条小路也想去，之前每次路过都没进去。', 59, true),
    sample('demo-5', '对了，帮我记得带上胶卷 📷', 58),
    sample('demo-20', '刚把路线存好了，坐地铁到街口就行。', 54, true),
    sample('demo-21', '好，到时我在出口等你。', 52),
    sample('demo-6', '记下了！我周六两点到。', 23, true),
    sample('demo-7', '咖啡我请，等你来挑豆子。', 19),
    sample('demo-8', '周六两点，老地方见？🌿', 18),
  ],
  'demo-azhu': [
    sample('demo-9', '给你留了一首今天的歌。', 76),
    sample('demo-10', '是那首适合下雨天听的吗？', 61, true),
    sample('demo-11', '那首适合一个人走路听的歌，我找到了。', 54),
  ],
  'demo-linlu': [sample('demo-12', '昨天的照片洗出来了，给你留了一张。', 128)],
  'demo-shenyan': [sample('demo-13', '下次带上你上次推荐的桌游。', 365, true)],
  'demo-chenmo': [sample('demo-14', '又发现一家可以久坐的小店。', 1470)],
  'demo-taoxi': [sample('demo-15', '我们的杯子终于出窑了！', 1562)],
  'demo-beiyang': [sample('demo-16', '这部电影看完很想和你聊聊。', 4333, true)],
  'demo-yucheng': [sample('demo-22', '那家面馆的番茄面可以再去吃一次。', 4465)],
  'demo-xiaohe': [sample('demo-23', '下周日见！我带杯子和野餐垫。', 8600)],
};

export const demoUnread = { 'demo-xiaoman': 3, 'demo-azhu': 1, 'demo-taoxi': 2 };

export const demoPosts = [
  {
    id: 'demo-post-1', author: '林鹿', username: 'linlu',
    text: '昨晚下班没走大路。在巷子里看到那排灯亮起来，突然觉得这座城市也有很慢的一面。',
    time: '今天 18:42', photo: 'alley' as const, likes: 8, liked: false,
    comments: [{ id: 'demo-comment-1', author: '小满', text: '这光好温柔，下次带我走这条路。' }],
  },
  {
    id: 'demo-post-2', author: '桃溪', username: 'taoxi',
    text: '第一次拉坯，右边歪得很有坚持。决定留下来，专门装朋友来家里时的第一杯茶。',
    time: '今天 12:16', photo: 'pottery' as const, likes: 5, liked: false, comments: [],
  },
  {
    id: 'demo-post-3', author: '阿竹', username: 'azhu',
    text: '整理了一份适合下雨天听的歌单。第一首留给走路回家的人。',
    time: '昨天 19:30', likes: 2, liked: false, comments: [],
  },
];
