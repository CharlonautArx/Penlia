const prefix = 'penlia:place:1:';
const identifier = /^[a-zA-Z0-9_-]{1,80}$/;

export type PlaceCardValue = {
  id: string; provider: string; title: string; area: string; category: string; intro: string; source: string;
  cover?: string; official?: string;
};

function field(value: unknown, maximum: number, required = true) {
  return typeof value === 'string' && value.length <= maximum && (value.length > 0 || !required)
    && !/[\u0000-\u001F\u007F]/.test(value);
}
function validLink(value: unknown) {
  return typeof value === 'string' && value.length <= 240 && /^https:\/\/[A-Za-z0-9.-]+(?:\/[^\s]*)?$/.test(value);
}
export function parsePlaceCard(text: string): PlaceCardValue | undefined {
  if (!text.startsWith(prefix) || text.length > 1000) return;
  try {
    const value = JSON.parse(text.slice(prefix.length));
    if (!value || !identifier.test(value.id) || !identifier.test(value.provider)
      || typeof value.id !== 'string' || typeof value.provider !== 'string'
      || !field(value.title, 64) || !field(value.area, 72) || !field(value.category, 24)
      || !field(value.intro, 120, false) || !field(value.source, 48)
      || (value.cover !== undefined && (!field(value.cover, 96) || !identifier.test(value.cover)))
      || (value.official !== undefined && !validLink(value.official))) return;
    const { id, provider, title, area, category, intro, source, cover, official } = value;
    return { id, provider, title, area, category, intro, source, cover, official };
  } catch { /* A malformed card stays an ordinary message. */ }
}

export function encodePlaceCard(value: PlaceCardValue) {
  const message = prefix + JSON.stringify(value);
  if (!parsePlaceCard(message)) throw new Error('这个去处暂时无法分享。');
  return message;
}

export function placeCaption(text: string) {
  const card = parsePlaceCard(text);
  return card ? '[去处] ' + card.title : text;
}
