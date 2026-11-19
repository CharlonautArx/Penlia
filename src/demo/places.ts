import type { Place } from '../features/play/places';

export const samplePlaces: Place[] = [
  {
    id: 'sample-coffee', title: '里弄七码咖啡', category: '咖啡', city: '上海', district: '静安',
    group: '2–4 人 · 慢聊', intro: '窗边长桌适合久坐，聊完还能顺路散步。',
    description: '适合约久没见的朋友。挑靠窗的位置，在午后的光里各点一杯咖啡。聊够了再到附近街区走一圈，不必把行程排得太满。',
    image: require('../../assets/demo/coffee.jpg'), origin: { type: 'sample' },
  },
  {
    id: 'sample-pottery', title: '白釉制物室', category: '手作', city: '上海', district: '徐汇',
    group: '2–6 人 · 同做一件事', intro: '留两个小时，和朋友各做一只自己的杯子。',
    description: '适合第一次接触陶艺的朋友。想做同一款也可以，最后看看谁的杯子最有自己的样子。实际活动需以正式场所安排为准。',
    image: require('../../assets/demo/pottery.jpg'), origin: { type: 'sample' },
  },
  {
    id: 'sample-cinema', title: '暮色放映室', category: '电影', city: '上海', district: '黄浦',
    group: '2–4 人 · 看完接着聊', intro: '约一部电影，散场后留点时间交换感想。',
    description: '适合对电影有兴趣的小聚。挑一部都没看过的片子，散场后互相推荐一部最想让对方看的电影。',
    image: require('../../assets/play/cinema.jpg'), origin: { type: 'sample' },
  },
  {
    id: 'sample-board', title: '夜航桌游社', category: '桌游', city: '上海', district: '长宁',
    group: '4–6 人 · 破冰小聚', intro: '从能五分钟学会的轻策略游戏开始。',
    description: '适合新朋友一起破冰。先选规则简单、每轮时间短的桌游，等大家都熟悉后再换一局。',
    image: require('../../assets/demo/board.jpg'), origin: { type: 'sample', sponsoredPreview: true },
  },
];
