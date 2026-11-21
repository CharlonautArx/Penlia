import { DynamicColorIOS, Platform, PlatformColor, StyleSheet, type ColorValue } from 'react-native';
import palette from './palette.json';
import { type } from './typography';

export { palette };
export { type, weight } from './typography';
export const brandGradient = ['#FF768D', '#EAC8D5', '#AEFFF8'] as const;
export const colorNames = Object.keys(palette.light) as (keyof typeof palette.light)[];
type ColorName = typeof colorNames[number];
export const colors = Object.fromEntries(colorNames.map((name) => [
  name, Platform.OS === 'ios' ? DynamicColorIOS({ light: palette.light[name], dark: palette.dark[name] })
    : Platform.OS === 'android' ? PlatformColor('@color/penlia_' + name)
    : `var(--penlia-${name}, ${palette.light[name]})`,
])) as Record<ColorName, Exclude<ColorValue, number | null | undefined>>;

export const space = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32 } as const;
export const radius = { small: 8, control: 12, surface: 16, sheet: 24, pill: 999 } as const;
export const motion = { press: 160, feedback: 200, sheet: 240, transition: 300 } as const;
export const touch = Platform.OS === 'ios' ? 44 : 48;
export const contentWidth = 620;
export const fixed = {
  onAction: '#FFFFFF', onBrand: '#312633', lens: '#141318',
  onLens: '#F9F6F9', overlay: '#16131975', photoShade: '#17131DCE',
} as const;

export const elevation = { inline: colors.backdrop, surface: colors.panel, raised: colors.search } as const;
export const styles = StyleSheet.create({
  card: { backgroundColor: elevation.surface, borderRadius: radius.surface, padding: space.md, gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  grow: { flex: 1, minWidth: 0 },
  strong: { color: colors.text, ...type.emphasis },
  body: { color: colors.text, ...type.body },
  muted: { color: colors.muted, ...type.support },
  small: { color: colors.quiet, ...type.caption },
  section: { color: colors.text, ...type.heading, flexShrink: 1 },
  input: {
    backgroundColor: elevation.raised, color: colors.text, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    borderRadius: radius.control, paddingHorizontal: space.sm, paddingVertical: space.xs, ...type.body, minHeight: touch,
  },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});
