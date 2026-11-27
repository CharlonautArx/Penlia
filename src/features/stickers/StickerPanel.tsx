import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, styles } from '../../theme';
import { encodeOfficialDraft, officialPackId } from './catalog';
import { makeStickerToken } from './wire';
import { StickerText } from './StickerText';
import { officialStickers } from './official';
import type { OfficialSticker } from './types';

export function StickerPanel({ draft, limit, onSelect, disabled }: {
  draft: string; limit: number; onSelect: (sticker: OfficialSticker) => void; disabled?: boolean;
}) {
  const [width, setWidth] = useState(0);
  const columns = width >= 320 ? 8 : 7;
  const encoded = encodeOfficialDraft(draft);
  return <>
    {encoded !== draft && <View style={local.preview}><StickerText text={encoded} compact /></View>}
    {encoded.length + makeStickerToken(officialPackId, officialStickers[0].id).length > limit && <Text style={styles.small}>这条消息快满了，可以先发送。</Text>}
    <View accessibilityLabel="朋聊官方表情" onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}
    style={local.grid}>
    {officialStickers.map((sticker) => <Pressable key={sticker.id} accessibilityRole="button"
      accessibilityLabel={sticker.label} disabled={disabled || encoded.length + makeStickerToken(officialPackId, sticker.id).length > limit} onPress={() => onSelect(sticker)}
      style={({ pressed }) => [local.cell, { width: (100 / columns) + '%' }, pressed && local.pressed]}>
      <Image source={sticker.source} accessible={false} resizeMode="contain" fadeDuration={0} style={local.art} />
    </Pressable>)}
    </View>
  </>;
}

const local = StyleSheet.create({
  preview: { paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 3 },
  cell: { minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: radius.control },
  art: { width: '94%', maxWidth: 48, aspectRatio: 1 },
  pressed: { backgroundColor: colors.search, transform: [{ scale: 0.93 }] },
});
