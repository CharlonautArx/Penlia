import { Pressable, Text, View } from 'react-native';
import { Avatar, Empty, Icon } from '../../components/ui';
import { demoPortrait } from '../../demo/visuals';
import { displayName, emptyDirectory } from '../friends/directory';
import { useDirectory } from '../friends/store';
import type { Relationship } from '../../services/api';
import { colors, space, styles, touch } from '../../theme';

export function MemberChoices({
  friends,
  ids,
  update,
  portraits = false,
}: {
  friends: Relationship[];
  ids: string[];
  update: (ids: string[]) => void;
  portraits?: boolean;
}) {
  const { value: directory } = useDirectory();
  return friends.length ? (
    <View>
      {friends.map((person) => {
        const name = portraits ? displayName(person, directory ?? emptyDirectory) : person.name;
        const selected = ids.includes(person.userId);
        return (
          <Pressable
            key={person.userId}
            accessibilityRole="checkbox"
            accessibilityLabel={name}
            accessibilityState={{ checked: selected }}
            onPress={() => update(selected ? ids.filter((id) => id !== person.userId) : [...ids, person.userId])}
            style={[styles.row, { minHeight: touch, paddingHorizontal: space.xs }]}
          >
            <Icon name={selected ? 'checkbox' : 'square-outline'} color={selected ? colors.accent : colors.quiet} />
            {portraits && <Avatar userId={person.userId} name={person.name}
              source={demoPortrait(person.username)} size={36} />}
            <Text style={[styles.body, portraits && styles.grow]}>{name}</Text>
          </Pressable>
        );
      })}
    </View>
  ) : (
    <Empty>暂无可选好友。</Empty>
  );
}
