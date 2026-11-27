import { encodeStickerDraft, stickerShortcode } from './draft';
import { officialStickers } from './official';
import type { OfficialSticker } from './types';

export const officialPackId = 'penlia-classic';
const packs = new Map([
  [officialPackId, new Map(officialStickers.map((sticker) => [sticker.id, sticker]))],
]);
const officialByLabel = new Map(officialStickers.map(({ label, id }) => [label, id]));

export const findSticker = (packId: string, id: string) => packs.get(packId)?.get(id);
export const encodeOfficialDraft = (draft: string) => encodeStickerDraft(draft, officialByLabel, officialPackId);

export function appendOfficialSticker(draft: string, sticker: OfficialSticker, limit: number) {
  const next = draft + stickerShortcode(sticker.label);
  return encodeOfficialDraft(next).length <= limit ? next : draft;
}
