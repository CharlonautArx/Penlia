import { Image, Platform, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { styles } from '../../theme';
import { findSticker } from './catalog';
import { isBuiltInStickerOnly, splitStickerMessage } from './wire';

export function StickerText({ text, style, compact = false, numberOfLines }: {
  text: string;
  style?: StyleProp<TextStyle>;
  compact?: boolean; numberOfLines?: number;
}) {
  // Keep the same paragraph layout for text that does not contain encoded stickers.
  if (!text.includes('〔表情:')) return <Text numberOfLines={numberOfLines} style={style ?? styles.body}>{text}</Text>;
  const parts = splitStickerMessage(text);
  const large = !compact && isBuiltInStickerOnly(text) && parts.filter((part) => part.kind === 'sticker').length === 1;
  const size = large ? 65 : compact ? 25 : 34;
  const label = parts.map((part) => part.kind === 'text' ? part.value :
    ' ' + (findSticker(part.packId, part.stickerId)?.label ?? '表情') + ' ').join('').trim();
  const children = parts.map((part, i) => {
    if (part.kind === 'text') return <Text key={i} style={[style ?? styles.body, Platform.OS === 'web' && { flexShrink: 1 }]}>{part.value}</Text>;
    const item = findSticker(part.packId, part.stickerId);
    return item ? <Image key={i} source={item.source} accessibilityLabel={item.label} fadeDuration={0}
      resizeMode="contain" style={{ width: size, height: size, ...(Platform.OS === 'web' && { verticalAlign: 'middle' as const }) }} />
      : <Text key={i} style={style ?? styles.body}>[表情]</Text>;
  });
  // The web image component is a block view. Native text uses inline image attachments.
  if (Platform.OS === 'web') return <View accessible accessibilityLabel={label}
    style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', maxWidth: '100%' }}>{children}</View>;
  return <Text accessibilityLabel={label} numberOfLines={numberOfLines} style={[style ?? styles.body, { lineHeight: Math.max(size, compact ? 26 : 35) }]}>{children}</Text>;
}
