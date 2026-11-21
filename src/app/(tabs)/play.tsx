import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Empty, Icon, IconButton, Screen, Section, Segments, Sheet } from '../../components/ui';
import { isUiDemo } from '../../demo/mode';
import { Chips, GameCard, PlaceCard } from '../../features/play/Cards';
import { discoveryCatalog } from '../../features/play/catalog';
import { InviteButton } from '../../features/play/Gather';
import { gameModes, games } from '../../features/play/games';
import { categories, cities, type City, visiblePlaces } from '../../features/play/places';
import { colors, styles } from '../../theme';
import { LifeHub } from '../../features/life/Hub';

const sections = ['一起生活', '为你推荐', '小游戏', '线下去处'] as const;
const hero = require('../../../assets/identity/hero.jpg');

export default function PlayScreen() {
  const [section, setSection] = useState<typeof sections[number]>(isUiDemo ? '为你推荐' : '一起生活');
  const [gameMode, setGameMode] = useState<typeof gameModes[number]>('全部');
  const [category, setCategory] = useState<typeof categories[number]>('全部');
  const [city, setCity] = useState<City>('上海');
  const [choosingCity, setChoosingCity] = useState(false);
  const localPlaces = discoveryCatalog().filter((place) => place.city === city);
  const places = visiblePlaces(localPlaces.filter((place) => category === '全部' || place.category === category));
  const playable = games.filter((game) => gameMode === '全部' || game.mode === gameMode);

  return <Screen title="玩乐" actions={section !== '一起生活' && <>
    <Pressable accessibilityRole="button" accessibilityLabel={'选择城市，当前' + city} onPress={() => setChoosingCity(true)}
      style={({ pressed }) => [local.city, pressed && local.pressed]}>
      <Icon name="location-outline" size={17} color={colors.accent} />
      <Text style={styles.strong}>{city}</Text>
      <Icon name="chevron-down" size={13} color={colors.quiet} />
    </Pressable>
    <IconButton label="想去的地方" icon="bookmark-outline" onPress={() => router.push('/playground/saved')} />
  </>}>
    <Segments label="玩乐分类" value={section} onChange={setSection}
      options={sections.filter((item) => !isUiDemo || item !== '一起生活').map((item) => ({ id: item, label: item }))} />
    {section === '一起生活' && !isUiDemo && <LifeHub />}
    {section === '为你推荐' && <>
      <View style={local.hero}>
        <Image source={hero} style={local.heroImage} />
        <LinearGradient colors={['#FFD9E5', '#F3DCECF0', '#E8EEED00']} locations={[0, 0.45, 1]}
          start={{ x: 0, y: 0.6 }} end={{ x: 1, y: 0.55 }} style={StyleSheet.absoluteFill} />
        <View style={local.heroCopy}>
          <Text style={local.heroTitle}>今天，玩点什么？</Text>
          <Text style={local.heroSub}>线上一起玩，线下一起去。</Text>
        </View>
      </View>
      <View style={local.block}>
        <Section title="玩点什么">
          <Pressable accessibilityRole="button" onPress={() => { setGameMode('全部'); setSection('小游戏'); }} style={local.more}>
            <Text style={local.moreText}>全部小游戏</Text><Icon name="chevron-forward" size={14} color={colors.accent} />
          </Pressable>
        </Section>
        <GameCard game={games[0]} featured />
        <Chips items={['单人', '双人', '多人'] as const} value={gameMode === '全部' ? undefined : gameMode}
          onChange={(value) => { if (value) { setGameMode(value); setSection('小游戏'); } }} />
      </View>
      <View style={local.block}>
        <Section title="去哪儿玩">
          <Pressable accessibilityRole="button" onPress={() => { setCategory('全部'); setSection('线下去处'); }} style={local.more}>
            <Text style={local.moreText}>更多去处</Text><Icon name="chevron-forward" size={14} color={colors.accent} />
          </Pressable>
        </Section>
        <Chips items={categories.slice(1)} value={undefined} onChange={(value) => { if (value) { setCategory(value); setSection('线下去处'); } }} />
        {localPlaces[0] ? <PlaceCard place={localPlaces[0]} /> : <Empty icon="map-outline">这个城市暂时没有推荐。</Empty>}
      </View>
      <View style={local.invite}>
        <Section title="朋友一起去" />
        <InviteButton label="发起聚会提议" message="这周找一天一起出去走走？你想喝咖啡、看电影，还是试个新活动？" />
      </View>
    </>}
    {section === '小游戏' && <>
      <Section title="选一个小游戏" detail="本机可玩" />
      <Chips items={gameModes} value={gameMode} onChange={(value) => { if (value) setGameMode(value); }} />
      {playable.map((game, index) => <GameCard key={game.id} game={game} featured={index === 0} />)}
      <View style={local.invite}>
        <Text style={styles.body}>约好见面，再一起玩。</Text>
        <InviteButton message="下次见面来玩一局？我们可以在同一部手机上轮流出招。" />
      </View>
    </>}
    {section === '线下去处' && <>
      <Section title="精选好去处" detail={isUiDemo ? '虚构推荐 · ' + city : city} />
      <Chips items={categories} value={category} onChange={(value) => { if (value) setCategory(value); }} />
      {places.map((place, index) => <PlaceCard key={place.id} place={place} compact={index > 0} />)}
      {!places.length && <Empty icon="map-outline">这个类别暂时没有推荐。可以换个城市或类别。</Empty>}
    </>}
    {choosingCity && <Sheet title="选择城市" onClose={() => setChoosingCity(false)}>
      <Text style={styles.muted}>手动选城市即可浏览。</Text>
      <Chips items={cities} value={city} onChange={(value) => { if (value) { setCity(value); setChoosingCity(false); } }} />
    </Sheet>}
  </Screen>;
}

const local = StyleSheet.create({
  city: { ...styles.row, gap: 4, minHeight: 44, paddingHorizontal: 5 },
  pressed: { opacity: 0.65 },
  hero: { minHeight: 111, backgroundColor: colors.pink, borderRadius: 15, justifyContent: 'center', overflow: 'hidden' },
  heroImage: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', marginLeft: '16%', resizeMode: 'cover' },
  heroCopy: { paddingHorizontal: 15, gap: 5 },
  heroTitle: { fontSize: 22, lineHeight: 30, color: '#321D36', fontWeight: '800', letterSpacing: -0.6 },
  heroSub: { fontSize: 13, lineHeight: 19, color: '#4D3A52' },
  block: { gap: 9 },
  more: { flexDirection: 'row', alignItems: 'center', marginLeft: 'auto', minHeight: 44, gap: 2 },
  moreText: { fontSize: 12, lineHeight: 17, color: colors.accent, fontWeight: '700' },
  invite: { ...styles.card, gap: 8 },
});
