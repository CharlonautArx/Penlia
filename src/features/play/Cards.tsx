import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '../../components/ui';
import { colors, styles } from '../../theme';
import type { Game } from './games';
import { disclosure, type Place } from './places';

export function Chips<T extends string>({ items, value, onChange }: {
  items: readonly T[]; value?: T; onChange: (value: T) => void;
}) {
  return <View style={local.chips}>
    {items.map((item) => <Pressable key={item} accessibilityRole="button" accessibilityLabel={item}
      accessibilityState={{ selected: value === item }} onPress={() => onChange(item)}
      style={({ pressed }) => [local.chip, value === item && local.chosen, pressed && local.pressed]}>
      <Text style={[styles.muted, value === item && local.chosenText]}>{item}</Text>
    </Pressable>)}
  </View>;
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
      <View style={local.heroArrow}><Icon name="play" size={17} color={colors.ink} /></View>
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
    <View style={[local.placeCopy, compact && styles.grow]}>
      <View style={local.placeHeading}>
        <Text style={[styles.strong, styles.grow]} numberOfLines={1}>{place.title}</Text>
        <Text style={local.tag}>{disclosure(place)}</Text>
      </View>
      <Text style={styles.small}>{place.city} · {place.district}　|　{place.category}　|　{place.group}</Text>
      <Text style={styles.muted} numberOfLines={compact ? 1 : 2}>{place.intro}</Text>
    </View>
  </Pressable>;
}

const local = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { minHeight: 44, minWidth: 47, paddingHorizontal: 10, borderRadius: 10, justifyContent: 'center',
    alignItems: 'center', backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  chosen: { backgroundColor: colors.pink, borderColor: '#F2C8D4' },
  chosenText: { color: colors.accent, fontWeight: '700' },
  pressed: { opacity: 0.7 },
  hero: { minHeight: 127, borderRadius: 14, backgroundColor: '#3B2843', overflow: 'hidden', justifyContent: 'center' },
  heroImage: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', resizeMode: 'cover' },
  heroCopy: { paddingLeft: 15, paddingRight: 65, paddingVertical: 14, gap: 5 },
  featuredMeta: { color: '#FCF1F9', fontSize: 12, lineHeight: 17 },
  featuredTitle: { color: '#FFFFFF', fontSize: 25, lineHeight: 32, fontWeight: '800' },
  heroArrow: { width: 43, height: 43, borderRadius: 14, backgroundColor: '#FFFFFFD9',
    alignItems: 'center', justifyContent: 'center', position: 'absolute', bottom: 14, right: 13 },
  gameRow: { ...styles.row, gap: 10, minHeight: 64, padding: 7, paddingRight: 12, backgroundColor: colors.panel,
    borderColor: colors.border, borderWidth: 1, borderRadius: 12 },
  square: { width: 54, height: 45, borderRadius: 8, backgroundColor: colors.lavender },
  thumbnail: { width: 84, height: '100%', minHeight: 94, backgroundColor: colors.lavender },
  place: { borderRadius: 14, backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1, overflow: 'hidden' },
  placeCompact: { flexDirection: 'row' },
  placePhoto: { width: '100%', height: 143, resizeMode: 'cover', backgroundColor: colors.lavender },
  placeCopy: { padding: 11, gap: 4 },
  placeHeading: { ...styles.row, gap: 4 },
  tag: { paddingHorizontal: 5, borderRadius: 5, overflow: 'hidden', lineHeight: 17, fontSize: 10, color: colors.accent, backgroundColor: colors.pink },
});
