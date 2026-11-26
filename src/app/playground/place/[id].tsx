import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Empty, Icon, IconButton, Notice, Screen, Sheet, Tag } from '../../../components/ui';
import { pilot } from '../../../features/design/pilot';
import { usePlace } from '../../../features/play/catalog';
import { useSavedPlaces } from '../../../features/play/Gather';
import { PlaceShareButton } from '../../../features/play/PlaceShare';
import { bookingUrl, disclosure } from '../../../features/play/places';
import { colors, contentWidth, radius, space, styles } from '../../../theme';

export default function PlaceScreen() {
  const { id, provider } = useLocalSearchParams<{ id: string; provider?: string }>();
  const { place, loading } = usePlace(id, provider);
  const { saved, toggle, busy, error } = useSavedPlaces();
  const [confirm, setConfirm] = useState(false);
  const [linkError, setLinkError] = useState('');
  const external = place && bookingUrl(place);
  const bookmark = place && saved?.includes(place.id);
  const sample = place?.origin.type === 'sample';
  const offer = place?.offer && Date.parse(place.offer.expiresAt) > Date.now() ? place.offer : undefined;

  return <Screen title="去处详情" back={() => router.canGoBack() ? router.back() : router.replace('/play')}
    actions={place && <IconButton label={bookmark ? '取消收藏' : '收藏去处'} icon={bookmark ? 'bookmark' : 'bookmark-outline'}
      tinted={!!bookmark} disabled={!saved || busy} onPress={() => void toggle(place.id)} />}
    renderScroll={(props) => <>
      <ScrollView {...props} style={styles.grow} />
      {place && <View style={[pilot.rule, local.dock]}>
        <View style={local.dockInner}>
          <Text accessibilityRole="header" style={pilot.itemTitle}>约朋友一起去</Text>
          <View style={local.dockAction}><PlaceShareButton place={place} prominent={!external} /></View>
        </View>
      </View>}
    </>}>
    {place ? <>
      {place.image && <View style={local.cover}>
        <Image source={place.image} style={[pilot.photo, local.coverImage]} accessibilityLabel={sample ? '场所示意图' : place.title} />
      </View>}
      <View style={pilot.section}>
        <Text accessibilityRole="header" style={pilot.display}>{place.title}</Text>
        <View style={local.facts}>
          <View style={local.meta}>
            <Icon name="location-outline" size={18} color={colors.accent} />
            <Text style={[styles.muted, styles.grow]}>{place.city} · {place.district}　/　{place.category}</Text>
          </View>
          <View style={local.meta}>
            <Icon name="people-outline" size={18} color={colors.accent} />
            <Text style={[styles.muted, styles.grow]}>{place.group}</Text>
          </View>
        </View>
        <View style={local.source}>
          <Tag>{disclosure(place)}</Tag>
          {sample && <Text style={pilot.note}>虚构场所 · 图片为示意 · 暂无预订入口</Text>}
          {place.origin.type === 'partner' && <Text style={pilot.note}>赞助方 {place.origin.sponsor}</Text>}
        </View>
      </View>
      {!!place.price && <Text style={styles.muted}>价格 {place.price.label} · 核实于 {place.price.verifiedOn}</Text>}
      {!!place.rating && <Text style={styles.muted}>评分 {place.rating.label} · 来源 {place.rating.source}</Text>}
      {!!offer && <Text style={styles.muted}>合作优惠 {offer.label} · 有效至 {new Date(offer.expiresAt).toLocaleDateString('zh-CN')}</Text>}
      <View style={[pilot.rule, local.description]}>
        <Text accessibilityRole="header" style={pilot.itemTitle}>适合怎样的聚会</Text>
        <Text style={pilot.copy}>{place.description}</Text>
      </View>
      {!!(error || linkError) && <Notice>{error || linkError}</Notice>}
      {external && <Button label="前往合作方预订" icon="open-outline" variant="gradient" onPress={() => setConfirm(true)} />}
      {external && confirm && <Sheet title="前往合作方" onClose={() => setConfirm(false)}>
        <Text style={styles.body}>将在浏览器打开 {new URL(external).hostname}。</Text>
        <Button label="继续" variant="primary" onPress={() => {
          setConfirm(false);
          void Linking.openURL(external).catch(() => setLinkError('暂时无法打开该页面。'));
        }} />
      </Sheet>}
    </> : <View style={pilot.surface}>
      <Empty icon="location-outline" busy={loading}>{loading ? '正在读取去处…' : '这个去处暂时不可用。'}</Empty>
    </View>}
  </Screen>;
}

const local = StyleSheet.create({
  cover: { width: '100%', aspectRatio: 1.55, borderRadius: radius.sheet, overflow: 'hidden' },
  coverImage: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
  facts: { gap: space.xs },
  meta: { ...styles.row, gap: space.xs },
  source: { ...styles.row, flexWrap: 'wrap', rowGap: space.xxs, columnGap: space.xs },
  description: { gap: space.xs, paddingTop: space.lg },
  dock: { backgroundColor: colors.panel },
  dockInner: { ...styles.row, flexWrap: 'wrap', justifyContent: 'space-between', width: '100%',
    maxWidth: contentWidth, alignSelf: 'center', paddingHorizontal: space.md, paddingVertical: space.sm },
  dockAction: { flexGrow: 1, flexBasis: 160 },
});
