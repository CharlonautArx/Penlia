import { Pressable, Text, View } from 'react-native';
import { Empty, Icon } from '../../components/ui';
import type { Relationship } from '../../services/api';
import { colors, styles } from '../../theme';

export function MemberChoices({
  friends,
  ids,
  update,
}: {
  friends: Relationship[];
  ids: string[];
  update: (ids: string[]) => void;
}) {
  return friends.length ? (
    <View>
      {friends.map((person) => {
        const selected = ids.includes(person.userId);
        return (
          <Pressable
            key={person.userId}
            accessibilityRole="checkbox"
            accessibilityLabel={person.name}
            accessibilityState={{ checked: selected }}
            onPress={() => update(selected ? ids.filter((id) => id !== person.userId) : [...ids, person.userId])}
            style={[styles.row, { minHeight: 46, paddingHorizontal: 9 }]}
          >
            <Icon name={selected ? 'checkbox' : 'square-outline'} color={selected ? colors.accent : colors.quiet} />
            <Text style={styles.body}>{person.name}</Text>
          </Pressable>
        );
      })}
    </View>
  ) : (
    <Empty>暂无可选好友。</Empty>
  );
}
