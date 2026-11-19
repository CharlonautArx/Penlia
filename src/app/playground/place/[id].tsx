import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Linking, StyleSheet, Text, View } from 'react-native';

import { Button, Empty, Icon, IconButton, Notice, Screen, Section, Sheet } from '../../../components/ui';
import { discoveryCatalog } from '../../../features/play/catalog';
import { InviteButton, useSavedPlaces } from '../../../features/play/Gather';
import { bookingUrl, disclosure } from '../../../features/play/places';
import { colors, styles } from '../../../theme';

export default function PlaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const place = discoveryCatalog().find((item) => item.id === id);
  const { saved, toggle, busy, error } = useSavedPlaces();
  const [confirm, setConfirm] = useState(false);
  const [linkError, setLinkError] = useState('');
  const external = place && bookingUrl(place);
  const bookmark = place && saved?.includes(place.id);
  const sample = place?.origin.type === 'sample';
  const offer = place?.offer && Date.parse(place.offer.expiresAt) > Date.now() ? place.offer : undefined;

  return <Screen title="去处详情" back={() => router.canGoBack() ? router.back() : router.replace('/play')}
    actions={place && <IconButton label={bookmark ? '取消收藏' : '收藏去处'} icon={bookmark ? 'bookmark' : 'bookmark-outline'}
      tinted={!!bookmark} disabled={!saved || busy} onPress={() => void toggle(place.id)} />}>
    {place ? <>
      {place.image && <Image source={place.image} style={local.image} accessibilityLabel={sample ? '场所示意图' : place.title} />}
      <View style={local.identity}>
        <View style={styles.row}>
          <Text style={[local.title, styles.grow]}>{place.title}</Text>
          <Text style={local.tag}>{disclosure(place)}</Text>
        </View>
        <View style={[styles.row, local.meta]}>
          <Icon name="location-outline" size={17} color={colors.accent} />
          <Text style={styles.body}>{place.city} · {place.district}　/　{place.category}</Text>
        </View>
        <View style={[styles.row, local.meta]}>
          <Icon name="people-outline" size={17} color={colors.accent} />
          <Text style={styles.body}>{place.group}</Text>
        </View>
        {sample && <Text style={styles.small}>虚构场所 · 图片为示意 · 暂无预订入口</Text>}
        {place.origin.type === 'partner' && <Text style={styles.small}>赞助方 {place.origin.sponsor}</Text>}
      </View>
      {!!place.price && <Text style={styles.muted}>价格 {place.price.label} · 核实于 {place.price.verifiedOn}</Text>}
      {!!place.rating && <Text style={styles.muted}>评分 {place.rating.label} · 来源 {place.rating.source}</Text>}
      {!!offer && <Text style={styles.muted}>合作优惠 {offer.label} · 有效至 {new Date(offer.expiresAt).toLocaleDateString('zh-CN')}</Text>}
      <View style={local.block}>
        <Section title="适合怎样的聚会" />
        <Text style={styles.body}>{place.description}</Text>
      </View>
      {!!(error || linkError) && <Notice>{error || linkError}</Notice>}
      <View style={local.block}>
        <Section title="约朋友一起去" />
        <InviteButton label="发个聚会提议"
          message={sample ? `我在朋聊看到一个演示场所「${place.title}」，下次见面我们也找个类似的地方？`
            : `下次一起去「${place.title}」？${place.city} · ${place.district}`} />
      </View>
      {external && <Button label="前往合作方预订" icon="open-outline" variant="gradient" onPress={() => setConfirm(true)} />}
      {external && confirm && <Sheet title="前往合作方" onClose={() => setConfirm(false)}>
        <Text style={styles.body}>将在浏览器打开 {new URL(external).hostname}。</Text>
        <Button label="继续" variant="primary" onPress={() => {
          setConfirm(false);
          void Linking.openURL(external).catch(() => setLinkError('暂时无法打开该页面。'));
        }} />
      </Sheet>}
    </> : <Empty icon="location-outline">这个去处暂时不可用。</Empty>}
  </Screen>;
}

const local = StyleSheet.create({
  image: { width: '100%', height: 215, borderRadius: 15, backgroundColor: colors.lavender },
  identity: { gap: 7 },
  title: { fontSize: 26, lineHeight: 35, fontWeight: '800', letterSpacing: -0.5, color: colors.text },
  tag: { color: colors.accent, backgroundColor: colors.pink, paddingHorizontal: 8, borderRadius: 6,
    overflow: 'hidden', fontSize: 11, lineHeight: 20 },
  meta: { gap: 7 },
  block: { ...styles.card, gap: 8 },
});
