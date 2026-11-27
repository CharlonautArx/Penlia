import { useIdentityResolver } from '../../services/friends';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { Avatar } from '../../components/ui';
import { colors, space, styles, type } from '../../theme';

export function MomentAuthor({ id, name, photo, stamp, visibility, onPress, children, typography }: {
  id: string; name: string; photo?: ImageSourcePropType; stamp: string; visibility: string;
  typography?: { text: string; muted: string };
  onPress?: () => void; children?: ReactNode;
}) {
  name = useIdentityResolver()(id)?.name ?? name;
  const avatar = <Avatar userId={id} name={name} source={photo} size={36} />;
  return <View style={local.row}>
    {onPress ? <Pressable accessibilityRole="button" accessibilityLabel={name + '的动态'} onPress={onPress}
      hitSlop={4}>{avatar}</Pressable> : avatar}
    <View style={styles.grow}>
      <Text style={[local.name, typography && { color: typography.text }]} numberOfLines={2}>{name}</Text>
      <Text style={[styles.small, typography && { color: typography.muted, fontSize: 13, lineHeight: 19 }]}>{stamp} · {visibility}</Text>
    </View>
    {children}
  </View>;
}

const local = StyleSheet.create({
  row: { ...styles.row, gap: space.xs },
  name: { ...type.control, fontWeight: '400', color: colors.text },
});
