import { makeStickerToken } from './wire.ts';

const shortcodes = /［([^［］\n]{1,24})］/g;

export const stickerShortcode = (label: string) => '［' + label + '］';

export function encodeStickerDraft(draft: string, byLabel: ReadonlyMap<string, string>, packId: string) {
  return draft.replace(shortcodes, (whole, label: string) => {
    const id = byLabel.get(label);
    return id ? makeStickerToken(packId, id) : whole;
  });
}
