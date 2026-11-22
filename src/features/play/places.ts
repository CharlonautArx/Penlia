import type { ImageSourcePropType } from 'react-native';

export const categories = ['全部', '咖啡', '聚餐', '电影', '手作', '桌游'] as const;
export type Category = Exclude<typeof categories[number], '全部'>;
export const cities = ['上海', '杭州', '成都'] as const;
export type City = typeof cities[number];

type Origin =
  | { type: 'editorial' }
  | { type: 'community' }
  | { type: 'partner'; sponsor: string; partnerId: string; bookingUrl?: string }
  | { type: 'sample'; sponsoredPreview?: boolean };

export type Place = {
  id: string;
  title: string;
  category: Category;
  city: City;
  district: string;
  group: string;
  intro: string;
  description: string;
  image?: ImageSourcePropType;
  price?: { label: string; verifiedOn: string };
  rating?: { label: string; source: string };
  offer?: { label: string; expiresAt: string };
  origin: Origin;
};

type Partner = { bookingHosts: readonly string[] };
export type PartnerRegistry = Readonly<Record<string, Partner>>;

// Register a partner and its exact booking domains after authorization.
const partners: PartnerRegistry = Object.freeze({});

export function bookingUrl(place: Place, registry = partners) {
  const { origin } = place;
  if (origin.type !== 'partner' || !origin.bookingUrl) return undefined;
  const partner = Object.hasOwn(registry, origin.partnerId) ? registry[origin.partnerId] : undefined;
  if (!partner) return undefined;
  try {
    const url = new URL(origin.bookingUrl);
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port
      && partner.bookingHosts.includes(url.hostname)) return url.toString();
  } catch { return undefined; }
}

function isSponsored(place: Place) {
  return place.origin.type === 'partner' || (place.origin.type === 'sample' && !!place.origin.sponsoredPreview);
}

export function visiblePlaces(places: Place[]) {
  const organic = places.filter((place) => !isSponsored(place));
  const sponsored = places.find(isSponsored);
  return sponsored && organic.length >= 3 ? [...organic.slice(0, 3), sponsored, ...organic.slice(3)] : organic;
}

export function disclosure(place: Place) {
  switch (place.origin.type) {
    case 'sample': return place.origin.sponsoredPreview ? '赞助样式示例' : '示例推荐';
    case 'partner': return '赞助';
    case 'community': return '朋友分享';
    case 'editorial': return '编辑推荐';
  }
}
