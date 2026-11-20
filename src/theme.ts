import { DynamicColorIOS, Platform, PlatformColor, StyleSheet, type ColorValue } from 'react-native';
import palette from './palette.json';

export { palette };
export const brandGradient = ['#FF768D', '#EAC8D5', '#AEFFF8'] as const;
type ColorName = keyof typeof palette.light;
export const colors = Object.fromEntries((Object.keys(palette.light) as ColorName[]).map((name) => [
  name, Platform.OS === 'ios' ? DynamicColorIOS({ light: palette.light[name], dark: palette.dark[name] })
    : Platform.OS === 'android' ? PlatformColor('@color/penlia_' + name) : palette.light[name],
])) as Record<ColorName, Exclude<ColorValue, number | null | undefined>>;

export const styles = StyleSheet.create({
  card: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 16, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  strong: { color: colors.text, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  body: { color: colors.text, fontSize: 15, lineHeight: 23 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  small: { color: colors.quiet, fontSize: 12, lineHeight: 17 },
  section: { color: colors.text, fontSize: 18, lineHeight: 25, fontWeight: '700' },
  input: {
    backgroundColor: colors.backdrop, color: colors.text, borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10, fontSize: 15, minHeight: 46,
  },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});
