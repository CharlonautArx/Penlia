import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassLayer } from '../../components/material';
import { useFontScale } from '../../components/Typography';
import { Empty, Icon, Notice, Screen, Sheet } from '../../components/ui';
import { isUiDemo } from '../../demo/mode';
import { pilot } from '../../features/design/pilot';
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
  const fontScale = useFontScale();
  const { places: result, loading, error } = usePlaces(city, category === '全部' ? undefined : category);
  const places = visiblePlaces(result);

  return <Screen>
    <DiscoveryEntrance onPress={() => router.push('/life')} />
    <View style={pilot.section}>
      <View style={local.heading}>
        <Text accessibilityRole="header" style={pilot.heading}>线下去处</Text>
        <View style={local.headingActions}>
          <Pressable accessibilityRole="button" accessibilityLabel={'选择城市，当前' + city}
            onPress={() => setChoosingCity(true)} style={({ pressed }) => [local.city, pressed && pilot.pressed]}>
            <GlassLayer tone="chrome" roundness={radius.pill} />
            <Icon name="location-outline" size={16} color={colors.ink} />
            <Text style={local.cityLabel}>{city}</Text>
            <Icon name="chevron-down-outline" size={13} color={colors.ink} />
          </Pressable>
        </View>
      </View>
      <Chips items={categories} value={category} onChange={setCategory} horizontal={fontScale <= 1} />
    </View>
    <View style={pilot.section}>
      <View style={[pilot.rule, local.resultsHeading]} accessibilityLiveRegion="polite">
        <Text accessibilityRole="header" style={pilot.itemTitle}>精选好去处</Text>
        <Text style={pilot.note}>{isUiDemo ? '虚构推荐 · ' + city : city}</Text>
      </View>
      {places.map((place, index) => <PlaceCard key={place.id} place={place} compact={index > 0} editorial />)}
      {!places.length && <View style={pilot.surface}>
        {error ? <Notice>暂时无法读取去处。</Notice> :
          <Empty icon="map-outline" busy={loading}>{loading ? '正在读取去处…' : '这个类别暂时没有推荐。可以换个城市或类别。'}</Empty>}
      </View>}
    </View>
    <InviteButton label="发起聚会提议" message="这周找一天一起出去走走？你想喝咖啡、看电影，还是试个新活动？" />
    {choosingCity && <Sheet title="选择城市" onClose={() => setChoosingCity(false)}>
      <Text style={styles.muted}>手动选城市即可浏览。</Text>
      <Chips items={cities} value={city} onChange={(value) => { setCity(value); setChoosingCity(false); }} />
    </Sheet>}
  </Screen>;
}

const local = StyleSheet.create({
  heading: { ...styles.row, justifyContent: 'space-between', flexWrap: 'wrap', rowGap: space.xxs },
  headingActions: { ...styles.row, gap: space.xxs, marginLeft: 'auto' },
  city: { ...styles.row, minHeight: touch, gap: 4, paddingHorizontal: space.sm, paddingVertical: space.xxs },
  cityLabel: { ...type.control, color: colors.ink },
  resultsHeading: { ...styles.row, flexWrap: 'wrap', alignItems: 'baseline', columnGap: space.sm, rowGap: space.xxs,
    paddingTop: space.md },
});
