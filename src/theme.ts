import { StyleSheet } from 'react-native';

export const brandGradient = ['#FF768D', '#EAC8D5', '#AEFFF8'] as const;
export const colors = {
  backdrop: '#F7F8FA',
  panel: '#FFFFFF',
  border: '#EAECEF',
  text: '#111111',
  muted: '#666666',
  quiet: '#6B6F78',
  accent: '#A22D50',
  pink: '#FDF0F3',
  ice: '#EDF9F8',
  ink: '#2C2835',
  lavender: '#F2EFF8',
  danger: '#AA2E44',
};

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
