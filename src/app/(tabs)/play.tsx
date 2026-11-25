import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassLayer } from '../../components/material';
import { Empty, Icon, IconButton, Screen, Section, Sheet } from '../../components/ui';
import { isUiDemo } from '../../demo/mode';
import { Chips, PlaceCard } from '../../features/play/Cards';
import { usePlaces } from '../../features/play/catalog';
import { DiscoveryEntrance } from '../../features/play/DiscoveryEntrance';
import { InviteButton } from '../../features/play/Gather';
import { categories, cities, type City, visiblePlaces } from '../../features/play/places';
import { colors, radius, space, styles, touch, type } from '../../theme';

export default function PlayScreen() {
  const [category, setCategory] = useState<typeof categories[number]>('全部');
  const [city, setCity] = useState<City>('上海');
  const [choosingCity, setChoosingCity] = useState(false);
  const { places: result, loading, error } = usePlaces(city, category === '全部' ? undefined : category);
  const places = visiblePlaces(result);

  return <Screen>
    <DiscoveryEntrance onPress={() => router.push('/life')} />
    <View style={local.discovery}>
      <View style={[styles.row, local.heading]}>
        <View style={local.headingActions}>
          <Text accessibilityRole="header" style={styles.section}>线下去处</Text>
          <IconButton label="想去的地点" icon="bookmark-outline" onPress={() => router.push('/playground/saved')} />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={'选择城市，当前' + city}
          onPress={() => setChoosingCity(true)} style={({ pressed }) => [local.city, pressed && local.pressed]}>
          <GlassLayer roundness={radius.pill} />
          <Icon name="location-outline" size={16} color={colors.ink} />
          <Text style={local.cityLabel}>{city}</Text>
          <Icon name="chevron-down-outline" size={13} color={colors.ink} />
        </Pressable>
      </View>
      <Chips items={categories} value={category} onChange={setCategory} horizontal />
    </View>
    <View style={local.places}>
      <Section title="精选好去处" detail={isUiDemo ? '虚构推荐 · ' + city : city} />
      {places.map((place, index) => <PlaceCard key={place.id} place={place} compact={index > 0} />)}
      {!places.length && <Empty icon="map-outline" busy={loading}>{loading ? '正在读取去处…' : error ? '暂时无法读取去处。' : '这个类别暂时没有推荐。可以换个城市或类别。'}</Empty>}
    </View>
    <InviteButton label="发起聚会提议" message="这周找一天一起出去走走？你想喝咖啡、看电影，还是试个新活动？" />
    {choosingCity && <Sheet title="选择城市" onClose={() => setChoosingCity(false)}>
      <Text style={styles.muted}>手动选城市即可浏览。</Text>
      <Chips items={cities} value={city} onChange={(value) => { setCity(value); setChoosingCity(false); }} />
    </Sheet>}
  </Screen>;
}

const local = StyleSheet.create({
  discovery: { gap: space.xs },
  heading: { justifyContent: 'space-between', flexWrap: 'wrap' },
  headingActions: { ...styles.row, gap: 0, flexShrink: 1 },
  city: { ...styles.row, minHeight: touch, gap: 4, paddingHorizontal: space.sm, paddingVertical: space.xxs },
  cityLabel: { ...type.control, color: colors.ink },
  places: { gap: space.sm },
  pressed: { opacity: 0.78 },
});
