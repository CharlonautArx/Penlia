export const fontSizes = [
  { label: '小', scale: 0.9 }, { label: '中', scale: 1 },
  { label: '大', scale: 1.15 }, { label: '超大', scale: 1.3 },
] as const;
export type FontSize = 0 | 1 | 2 | 3;
export function readFontSize(value: number): FontSize {
  return value === 0 || value === 2 || value === 3 ? value : 1;
}
export function effectiveFontScale(size: FontSize, systemScale: number) {
  return systemScale > 1 ? Math.max(systemScale, fontSizes[size].scale) : fontSizes[size].scale;
}
