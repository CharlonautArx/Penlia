import { StyleSheet } from 'react-native';
import { colors, radius, space, type, weight } from '../../theme';

// Scoped to the discovery and composer pilot. Shared theme values keep system appearance and font scaling intact.
export const pilot = StyleSheet.create({
  surface: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sheet,
  },
  photo: {
    backgroundColor: colors.lavender,
    resizeMode: 'cover',
  },
  display: { ...type.display, fontWeight: weight.semibold, color: colors.text },
  heading: { ...type.title, fontWeight: weight.semibold, color: colors.text },
  itemTitle: { ...type.heading, fontWeight: weight.semibold, color: colors.text },
  copy: { ...type.body, lineHeight: 26, color: colors.text },
  note: { ...type.support, color: colors.quiet },
  section: { gap: space.sm },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  pressed: { opacity: 0.78 },
});
