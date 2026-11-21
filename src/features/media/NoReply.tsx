import Feather from '@expo/vector-icons/Feather';
import { StyleSheet, Text, View } from 'react-native';
import { type } from '../../theme';

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
