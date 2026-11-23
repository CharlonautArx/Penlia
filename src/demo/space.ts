import { allFriends, blankDraft, emptySpace, type Album, type Entry, type Photo, type SpaceCard } from '../features/space/model';
import { demoPeople, demoPosts } from './data';

const coffee: Photo = { type: 'sample', id: 'coffee' };
const alley: Photo = { type: 'sample', id: 'alley' };
const pottery: Photo = { type: 'sample', id: 'pottery' };
const cinema: Photo = { type: 'sample', id: 'cinema' };
const ago = (hours: number) => Date.now() - hours * 3_600_000;
const ownerId = 'demo-self';

export function spaceSamples() {
  const entries: Entry[] = demoPosts.map(({ id, username, text, photo, likes, comments }, index) => ({
    ...blankDraft('thought'), id, ownerId: demoPeople.find((p) => p.username === username)!.id,
    at: ago(index * 8 + 1), text, photos: photo ? [{ type: 'sample', id: photo }] : [],
    likes, liked: false, comments: comments.map((comment) => ({
      id: comment.id, text: comment.text, authorId: 'demo-xiaoman', at: ago(0.5),
    })),
    ...(index === 0 && { location: '上海 · 梧桐街区' }),
  }));
  entries.push(
    { ...blankDraft('thought'), id: 'sample-thought-slow', ownerId, at: ago(4),
      text: '晴天留给散步。今天路过一扇光线很好的窗，和 @xiaoman 约好下次一起来。☕',
      photos: [coffee, alley], location: '上海 · 静安', mentions: ['demo-xiaoman'], likes: 4, liked: false, comments: [
        { id: 'sample-reply-window', authorId: 'demo-xiaoman', text: '下次记得叫我！', at: ago(3.2) },
      ] },
    { ...blankDraft('thought'), id: 'sample-video-walk', ownerId: 'demo-xiaoman', at: ago(16),
      text: '留十五秒给下班路上慢慢变蓝的天。', photos: [alley], videoPreview: true, likes: 6, liked: false, comments: [] },
    { ...blankDraft('journal'), id: 'sample-journal-city', ownerId, at: ago(30),
      title: '把周末留给城市的另一面', location: '上海', photos: [alley, coffee], likes: 7, liked: false, comments: [],
      text: '上周三，小满说起她新买的相机。我们临时决定，周六下午不做计划，随便挑一条小路走下去。\n\n午后的咖啡馆里，窗台上的植物晃来晃去。我们聊了一些没说完的近况，也安安静静坐了一会儿。原来靠近一座城市，并不总需要很明确的目的地。\n\n天慢慢暗下来，路灯亮起来的时候，我拍下了这条巷子。下次有空，也许还会来走同样的路。' },
    { ...blankDraft('journal'), id: 'sample-journal-hands', ownerId, at: ago(24 * 8),
      title: '第一只歪歪的杯子', photos: [pottery], likes: 3, liked: false, comments: [],
      audience: { mode: 'allow', ids: ['demo-xiaoman'] },
      text: '周日下午去学做陶。一开始以为杯子应该做得很端正，最后留下的却是最歪的那只。\n\n它很适合装热茶，也很适合提醒我，一件慢慢做的东西，歪一点也无妨。' },
    { ...blankDraft('thought'), id: 'sample-thought-self', ownerId, at: ago(52),
      text: '给自己备忘：这周记得把相机里的胶卷取出来。', audience: { mode: 'self', ids: [] },
      likes: 0, liked: false, comments: [] },
  );

  const albums: Album[] = [
    { id: 'sample-album-days', ownerId, title: '慢慢过的日子', theme: '日常', cover: 0, photos: [coffee, alley, pottery], at: ago(4) },
    { id: 'sample-album-friends', ownerId, title: '见面的理由', theme: '聚会', cover: 0, photos: [cinema, coffee], at: ago(18) },
    { id: 'sample-album-walk', ownerId: 'demo-xiaoman', title: '散步相簿', theme: '日常', cover: 0, photos: [alley, coffee], at: ago(10) },
  ];
  const space: SpaceCard = {
    ...emptySpace(), region: '上海', status: '周末去散步',
    guestbook: [{ id: 'sample-note', authorId: 'demo-xiaoman', text: '路过，留一杯咖啡 ☕', at: ago(1.4) }],
  };
  const friendSpace: Record<string, SpaceCard> = {
    'demo-xiaoman': { ...emptySpace(), region: '上海', status: '胶卷还没拍完', cover: { tone: 'dawn', photo: coffee },
      privacy: { ...emptySpace().privacy, access: allFriends() } },
  };
  return { entries, albums, space, friendSpace };
}
