import { useTogetherRouter } from '../../features/together/navigation';
import { useLocalSearchParams } from 'expo-router';
import { Button, Screen } from '../../features/together/ui';
import { back } from '../../features/social/ui';
import { ItemsView } from '../../features/life/items';

export default function ItemsScreen() {
  const router = useTogetherRouter();
  const { kind: requested, item } = useLocalSearchParams<{ kind?: 'saved' | 'place'; item?: string }>();
  const kind = requested === 'place' ? 'place' : 'saved';
  return (
    <Screen title={kind === 'place' ? '愿望地图' : '我的收藏与好友推荐'} back={back}>
      <ItemsView kind={kind} itemId={item} />
      <Button
        label={kind === 'place' ? '打开共同地图列表' : '打开共同清单'}
        variant="quiet"
        onPress={() =>
          router.push({ pathname: '/life/projects', params: { kind: kind === 'place' ? 'map' : 'list' } })
        }
      />
    </Screen>
  );
}
