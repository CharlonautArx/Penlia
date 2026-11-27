const stickerToken = /〔表情:([a-z][a-z0-9-]{0,23})\/([a-z0-9][a-z0-9-]{0,23})〕/g;

export function makeStickerToken(packId: string, stickerId: string) {
  return '〔表情:' + packId + '/' + stickerId + '〕';
}

type TextPart = { kind: 'text'; value: string };
type StickerPart = { kind: 'sticker'; packId: string; stickerId: string };
export type StickerMessagePart = TextPart | StickerPart;

export function splitStickerMessage(text: string): StickerMessagePart[] {
  const parts: StickerMessagePart[] = [];
  let end = 0;
  for (const match of text.matchAll(stickerToken)) {
    if (match.index > end) parts.push({ kind: 'text', value: text.slice(end, match.index) });
    parts.push({ kind: 'sticker', packId: match[1], stickerId: match[2] });
    end = match.index + match[0].length;
  }
  if (end < text.length) parts.push({ kind: 'text', value: text.slice(end) });
  return parts;
}

export function isBuiltInStickerOnly(text: string) {
  if (!text.trimStart().startsWith('〔表情:')) return false;
  let hasSticker = false;
  for (const part of splitStickerMessage(text)) {
    if (part.kind === 'sticker') hasSticker = true;
    else if (part.value.trim()) return false;
  }
  return hasSticker;
}

export function clipStickerText(text: string, limit: number) {
  if (text.length <= limit) return text;
  let result = '';
  for (const part of splitStickerMessage(text)) {
    const room = limit - result.length;
    if (part.kind === 'text') {
      result += part.value.slice(0, room);
      if (part.value.length >= room) break;
    } else {
      const token = makeStickerToken(part.packId, part.stickerId);
      if (token.length > room) break;
      result += token;
    }
  }
  return result;
}

export function stickerCaption(text: string) {
  if (!text.includes('〔表情:')) return text;
  return splitStickerMessage(text).map((part) => part.kind === 'sticker' ? '[表情]' : part.value).join('');
}
