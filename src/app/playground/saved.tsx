import { router } from 'expo-router';

import { Empty, Notice, Screen } from '../../components/ui';
import { PlaceCard } from '../../features/play/Cards';
import { discoveryCatalog } from '../../features/play/catalog';
import { useSavedPlaces } from '../../features/play/Gather';

export default function SavedPlaces() {
  const { saved, error } = useSavedPlaces();
  const places = discoveryCatalog().filter((place) => saved?.includes(place.id));
  return <Screen title="想去的地方" back={() => router.canGoBack() ? router.back() : router.replace('/play')}>
    {!!error && <Notice>{error}</Notice>}
    {places.map((place) => <PlaceCard key={place.id} place={place} compact />)}
    {!places.length && !error && <Empty icon="bookmark-outline" busy={!saved}>
      {saved ? '在去处详情点收藏，想去的地方就会出现在这里。' : '正在读取本机收藏…'}
    </Empty>}
  </Screen>;
}
