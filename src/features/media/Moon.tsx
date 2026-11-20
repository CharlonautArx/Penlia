import { Text, View } from 'react-native';
import { Icon } from '../../components/ui';

import { colors } from '../../theme';

export function Moon({ words = false }: { words?: boolean }) {
  return (
    <View
      accessible
      accessibilityLabel="安静送达"
      style={{ alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}
    >
      <Icon name="moon" color={colors.moon} size={12} />
      {words && <Text style={{ color: colors.moon, fontSize: 12 }}>安静送达</Text>}
    </View>
  );
}
