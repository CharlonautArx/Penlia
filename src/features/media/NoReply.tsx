import { Icon } from '../../components/ui';
import Feather from '@expo/vector-icons/Feather';
import { StyleSheet, Text, View } from 'react-native';
import { colors, type } from '../../theme';

export function NoReply() {
  return (
    <View accessibilityLabel="只是分享" style={styles.pill}>
      <Feather name="feather" size={12} color="#FFFFFF" />
      <Text style={styles.text}>只是分享</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    marginTop: 3,
    borderRadius: 8,
    backgroundColor: '#544456',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  text: { ...type.tag, color: '#FFFFFF', fontSize: 11 },
});

export function MessageMarks({ sharing, silent }: { sharing?: boolean; silent?: boolean }) {
  if (!sharing && !silent) return null;
  return <View style={{ alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
    {sharing && <Feather accessible accessibilityLabel="只是分享" name="feather" size={13} color="#FFFFFF"
      style={{ textShadowColor: '#646773', textShadowOffset: { width: 0, height: 0.5 }, textShadowRadius: 1.5 }} />}
    {silent && <View accessible accessibilityLabel="安静送达"><Icon name="moon" size={13} color={colors.moon} /></View>}
  </View>;
}
