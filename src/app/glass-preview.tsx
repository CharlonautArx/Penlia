import { router, type Href } from 'expo-router';
import { Icon, ListRow, Screen, SettingGroup } from '../components/ui';
import { isLiquidGlass } from '../demo/mode';

const examples: { title: string; rows: readonly (readonly [string, Href])[] }[] = [
  { title: '聊天与好友', rows: [
    ['小满 · 单聊', '/chat/demo-xiaoman'],
    ['周末散步 · 群聊', '/group/preview-weekend'],
    ['聊天设置', '/chat-settings/demo-xiaoman'],
    ['待处理好友申请', '/friend-requests/relationship-demo-taozi'],
    ['小满 · 视频通话模拟', { pathname: '/peer-call', params: { peer: 'demo-xiaoman', kind: 'video' } }],
  ] },
  { title: '动态与好友空间', rows: [
    ['发布动态', { pathname: '/space/compose', params: { kind: 'thought' } }],
    ['小满 · 动态', '/life/timeline/demo-xiaoman'],
    ['动态通知', '/life/moment-notifications'],
    ['生活状态', '/life/status'],
  ] },
  { title: '一起与玩乐', rows: [
    ['晚风小院 · 共同世界', '/world/preview-world?together=1'],
    ['同一场黄昏 · 瞬间共鸣', '/world/preview-relay?together=1'],
    ['周末到河边喝杯咖啡 · 约局', '/gathering/preview-gathering?together=1'],
    ['共享日程', '/life/calendar?together=1'],
    ['临海两日 · 共同旅行', '/life/project/preview-trip?kind=trip&together=1'],
    ['散步地图 · 共同愿望地图', '/life/project/preview-map?kind=map&together=1'],
    ['留给下个夏天的一封信 · 时间胶囊', '/life/project/preview-capsule?kind=capsule&together=1'],
    ['周末清单 · 共同清单', '/life/project/preview-list?kind=list&together=1'],
    ['共同回忆', '/life/memories?together=1'],
    ['沿河一直走 · 共同日记', '/collection/preview-journal?together=1'],
    ['里弄七码咖啡 · 地点详情', '/playground/place/sample-coffee'],
  ] },
  { title: '个人与安全', rows: [
    ['我的二维码', '/my-qr'],
    ['本机空间隐私', '/space/privacy'],
    ['生活边界保护计划', '/boundary'],
    ['字体大小', '/font-size'],
  ] },
];

export default function GlassPreview() {
  if (!isLiquidGlass) return null;
  return <Screen title="体验入口" back={() => router.canGoBack() ? router.back() : router.replace('/me')}>
    {examples.map((section) => <SettingGroup title={section.title} key={section.title}>
      {section.rows.map(([title, path], index) => <ListRow key={title} title={title}
        left={<Icon name="arrow-forward-circle-outline" size={18} />}
        separator={index < section.rows.length - 1} onPress={() => router.push(path)} />)}
    </SettingGroup>)}
  </Screen>;
}
