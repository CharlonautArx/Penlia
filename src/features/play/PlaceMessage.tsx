import { router } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, Tag } from '../../components/ui';
import { colors, radius, space, styles } from '../../theme';
import type { MessageLongPress } from '../chat/record-model';
import { usePlace } from './catalog';
import type { PlaceCardValue } from './place-card-model';
import { disclosure } from './places';

export function PlaceMessage({ value, onLongPress }: { value: PlaceCardValue; onLongPress?: MessageLongPress }) {
  const { place } = usePlace(value.id, value.provider);
  return <Pressable accessibilityRole="link" accessibilityLabel={'查看去处 ' + (place?.title ?? value.title)}
    onPress={() => router.push({ pathname: '/playground/place/[id]', params: { id: value.id, provider: value.provider } })}
    onLongPress={onLongPress} style={({ pressed }) => [local.card, pressed && local.pressed]}>
    {place?.image ? <Image source={place.image} resizeMode="cover" style={local.image} />
      : <View style={[local.image, local.fallback]}><Icon name="location-outline" size={32} color={colors.accent} /></View>}
    <View style={local.copy}>
      <View style={[styles.row, local.heading]}><Text style={[styles.strong, styles.grow]}>{place?.title ?? value.title}</Text>
        <Icon name="chevron-forward" size={15} color={colors.quiet} /></View>
      <Text style={styles.small}>{place ? place.city + ' · ' + place.district + ' / ' + place.category : value.area + ' / ' + value.category}</Text>
      {!!(place?.intro ?? value.intro) && <Text style={styles.muted} numberOfLines={2}>{place?.intro ?? value.intro}</Text>}
      <View style={{ alignSelf: 'flex-start' }}><Tag>{place ? disclosure(place) : value.source}</Tag></View>
    </View>
  </Pressable>;
}

const local = StyleSheet.create({
  card: { width: 236, maxWidth: '100%', overflow: 'hidden', backgroundColor: colors.panel, borderRadius: radius.control,
    borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth },
  image: { width: '100%', height: 101, backgroundColor: colors.lavender },
  fallback: { justifyContent: 'center', alignItems: 'center' },
  copy: { padding: space.sm, gap: space.xxs },
  heading: { gap: space.xxs },
  pressed: { opacity: 0.76 },
});
