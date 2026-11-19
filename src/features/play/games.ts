export const gameModes = ['全部', '单人', '双人', '多人'] as const;
export type GameMode = Exclude<typeof gameModes[number], '全部'>;
export type GameId = 'hands' | 'reflex' | 'prompts';

export const games = [
  {
    id: 'hands', title: '石头剪刀布', mode: '双人', players: '2 人同机 · 可单人练习',
    subtitle: '不用猜心思，三局两胜。',
    note: '和朋友轮流在同一部手机上出招，或先和电脑练练手。',
    image: require('../../../assets/play/hands.jpg'),
  },
  {
    id: 'reflex', title: '反应力挑战', mode: '单人', players: '1 人 · 本机',
    subtitle: '信号出现后，看看你的反应有多快。',
    note: '轻触开始，等颜色和文字改变后立刻按下。提前按要重新开始。',
    image: require('../../../assets/play/reflex.jpg'),
  },
  {
    id: 'prompts', title: '聚会话题卡', mode: '多人', players: '2 人以上 · 同机',
    subtitle: '从一个问题聊到意想不到的地方。',
    note: '轮流抽一张并回答。遇到不想答的题，随时换一题。',
    image: require('../../../assets/play/prompts.jpg'),
  },
] as const;

export function getGame(id: string) {
  return games.find((game) => game.id === id);
}
export type Game = typeof games[number];
