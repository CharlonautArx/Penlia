import { isUiDemo } from '../../demo/mode';

export const isDesignPilot = isUiDemo && process.env.EXPO_PUBLIC_PENLIA_DESIGN_PILOT === '1';
export const variants = ['original', 'A', 'B', 'C', 'D'] as const;
export type PilotVariant = typeof variants[number];
export const isVariant = (value: unknown): value is PilotVariant => variants.some((v) => v === value);

export const scenes = [
  { key: 'inbox', name: '聊天', route: '/', icon: 'chatbubbles-outline' },
  { key: 'chat', name: '与小满聊天', route: '/chat/demo-xiaoman', icon: 'chatbubble-outline' },
  { key: 'moments', name: '好友动态', route: '/moments', icon: 'images-outline' },
  { key: 'world', name: '共同世界', route: '/world/preview-world?together=1', icon: 'planet-outline' },
  { key: 'gathering', name: '约局详情', route: '/gathering/preview-gathering?together=1', icon: 'calendar-outline' },
] as const;

export function routeScene(pathname: string) {
  return scenes.find((scene) => scene.route.split('?')[0] === pathname)?.key;
}

export const variantNames: Record<PilotVariant, string> = {
  original: '原版对照', A: '温润生活主义', B: '现代原生极简主义', C: 'Apple 风格', D: 'Claude 风格',
};

export interface PilotColors {
  background: string;
  surface: string;
  text: string;
  muted: string;
  line: string;
  accent: string;
  tint: string;
}

type ColorTuple = [string, string, string, string, string, string, string];
const day: Record<PilotVariant, ColorTuple> = {
  original: ['#FAFBFC', '#FFFFFF', '#23242A', '#565964', '#E5E5E9', '#514655', '#EEEAF1'],
  A: ['#F8F6F0', '#FFFEF9', '#222D27', '#596458', '#D8DBCE', '#34614D', '#E1EADC'],
  B: ['#FFFFFF', '#F4F7F7', '#152527', '#4B6063', '#D8E1E1', '#006963', '#D6EFEB'],
  C: ['#F1F2F6', '#FFFFFF', '#16171B', '#565866', '#D6D7DF', '#494175', '#E8E5F4'],
  D: ['#F8F4EC', '#FCFAF5', '#302822', '#695E52', '#DED6C9', '#9B482F', '#F0DDCF'],
};
const night: Record<PilotVariant, ColorTuple> = {
  original: ['#14151A', '#1C1D24', '#F4F0F1', '#C1BBC6', '#363740', '#C9ECE6', '#2D303D'],
  A: ['#18211C', '#212B24', '#F1F2E9', '#B6C4B5', '#3C4A3E', '#ACD8B8', '#314738'],
  B: ['#11191A', '#1C2728', '#EFF5F3', '#A9BFBD', '#354546', '#83DCCF', '#234641'],
  C: ['#16161A', '#242429', '#F5F4F9', '#C1BDC9', '#414048', '#CCC0FA', '#39334C'],
  D: ['#221F1C', '#2C2824', '#F7EEDF', '#C8BBAB', '#493F36', '#F1AE8E', '#50392E'],
};

export function pilotColors(variant: PilotVariant, dark: boolean): PilotColors {
  const [background, surface, text, muted, line, accent, tint] = (dark ? night : day)[variant];
  return { background, surface, text, muted, line, accent, tint };
}
