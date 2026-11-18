import { StyleSheet } from 'react-native';

export const colors = {
  backdrop: '#F7F8F3',
  panel: '#FFFFFF',
  border: '#E2E8DF',
  text: '#203329',
  muted: '#53695E',
  green: '#3C684F',
  sage: '#E6EFE1',
  deep: '#2D503D',
  peach: '#F6E8DA',
  danger: '#9B4639',
};

export const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    padding: 16,
    gap: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  strong: { color: colors.text, fontSize: 16, fontWeight: '700' },
  body: { color: colors.text, fontSize: 16, lineHeight: 25 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  small: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  section: { color: colors.text, fontSize: 18, fontWeight: '700' },
  input: {
    backgroundColor: colors.panel,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 16,
    minHeight: 48,
  },
});
