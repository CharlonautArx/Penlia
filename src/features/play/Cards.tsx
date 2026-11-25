import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { GlassLayer } from '../../components/material';
import { Icon, Tag } from '../../components/ui';
import { colors, radius, space, styles, touch, type } from '../../theme';
import type { Game } from './games';
import { disclosure, type Place } from './places';

export function Chips<T extends string>({ items, value, onChange, horizontal = false }: {
  items: readonly T[]; value?: T; onChange: (value: T) => void; horizontal?: boolean;
}) {
  const choices = items.map((item) => <Pressable key={item} accessibilityRole="button" accessibilityLabel={item}
      accessibilityState={{ selected: value === item }} onPress={() => onChange(item)}
      style={({ pressed }) => [local.chip, pressed && local.pressed]}>
      {value === item && <GlassLayer tone="control" roundness={radius.pill} />}
      <Text style={[styles.muted, value === item && local.chosenText]}>{item}</Text>
    </Pressable>);
  return horizontal
    ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={local.chipsHorizontal}>
      {choices}
    </ScrollView>
    : <View style={local.chips}>{choices}</View>;
}

export function GameCard({ game, featured = false }: { game: Game; featured?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={game.title}
    onPress={() => router.push({ pathname: '/playground/game/[id]', params: { id: game.id } })}
    style={({ pressed }) => [featured ? local.hero : local.gameRow, pressed && local.pressed]}>
    <Image source={game.image} style={featured ? local.heroImage : local.square} />
    {featured ? <>
      <LinearGradient colors={['#251C2DEB', '#2C223233', '#2C223200']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill} />
      <View style={local.heroCopy}>
        <Text style={local.featuredMeta}>{game.players}</Text>
        <Text style={local.featuredTitle}>{game.title}</Text>
        <Text style={local.featuredMeta}>{game.subtitle}</Text>
      </View>
      <View style={local.heroArrow}><Icon name="play" size={17} color="#312633" /></View>
    </> : <>
      <View style={styles.grow}>
        <Text style={styles.strong}>{game.title}</Text>
        <Text style={styles.small}>{game.players}</Text>
      </View>
      <Icon name="chevron-forward" size={16} color={colors.quiet} />
    </>}
  </Pressable>;
}

export function PlaceCard({ place, compact = false }: { place: Place; compact?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={'查看' + place.title}
    onPress={() => router.push({ pathname: '/playground/place/[id]', params: { id: place.id } })}
    style={({ pressed }) => [local.place, compact && local.placeCompact, pressed && local.pressed]}>
    {place.image && <Image source={place.image} style={compact ? local.thumbnail : local.placePhoto} />}
    <View style={[local.placeCopy, compact && local.compactCopy]}>
      <View style={local.placeHeading}>
        <Text style={[styles.strong, styles.grow]} numberOfLines={2}>{place.title}</Text>
        <Tag>{disclosure(place)}</Tag>
      </View>
      <Text style={styles.small}>{place.city} · {place.district}　|　{place.category}　|　{place.group}</Text>
      <Text style={styles.muted} numberOfLines={2}>{place.intro}</Text>
    </View>
  </Pressable>;
}

const local = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  chipsHorizontal: { gap: space.xs },
  chip: { minHeight: touch, minWidth: touch, paddingHorizontal: space.sm, paddingVertical: space.xxs,
    borderRadius: radius.pill, justifyContent: 'center', alignItems: 'center',
    backgroundColor: colors.panel, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  chosenText: { ...type.control, color: colors.ink },
  pressed: { opacity: 0.7 },
  hero: { minHeight: 127, borderRadius: radius.surface, backgroundColor: '#3B2843', overflow: 'hidden', justifyContent: 'center' },
  heroImage: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', resizeMode: 'cover' },
  heroCopy: { paddingLeft: space.md, paddingRight: 68, paddingVertical: space.md, gap: space.xxs },
  featuredMeta: { ...type.caption, color: '#FFFFFF' },
  featuredTitle: { ...type.title, color: '#FFFFFF' },
  heroArrow: { width: 43, height: 43, borderRadius: 14, backgroundColor: '#FFFFFFD9',
    alignItems: 'center', justifyContent: 'center', position: 'absolute', bottom: 14, right: 13 },
  gameRow: { ...styles.row, gap: 10, minHeight: 64, padding: 7, paddingRight: 12, backgroundColor: colors.panel,
    borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.control },
  square: { width: 54, height: 45, borderRadius: 8, backgroundColor: colors.lavender },
  thumbnail: { width: 88, height: 82, borderRadius: radius.control, resizeMode: 'cover', backgroundColor: colors.lavender },
  place: { borderRadius: radius.surface, backgroundColor: colors.panel, borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  placeCompact: { ...styles.row, padding: space.xs, gap: space.sm },
  placePhoto: { width: '100%', height: 168, resizeMode: 'cover', backgroundColor: colors.lavender },
  placeCopy: { padding: space.sm, gap: space.xxs },
  compactCopy: { flex: 1, minWidth: 0, padding: 0 },
  placeHeading: { ...styles.row, gap: 4 },
});
