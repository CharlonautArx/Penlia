import { router, useLocalSearchParams } from 'expo-router';
import { isUiDemo } from '../demo/mode';
import { useChatBackgrounds } from '../features/chat/background/store';
import { CallStage, CallAction } from '../features/calls/CallStage';
import { DemoCall } from '../demo/calls';
import { Empty, Screen } from '../components/ui';
import { useSession } from '../services/session';
import { useFriends } from '../services/friends';

export default function PeerCallRoute() {
  const { peer, kind, incoming } = useLocalSearchParams<{ peer?: string; kind?: string; incoming?: string }>();
  const account = useSession().session?.user.id;
  const backgrounds = useChatBackgrounds();
  const { relationships } = useFriends();
  const person = relationships?.find((entry) => entry.userId === peer && entry.status === 'accepted');
  const close = () => router.canGoBack() ? router.back() : router.replace('/');
  if (!person || (kind !== 'voice' && kind !== 'video')) return <Screen title="通话" back={close}>
    <Empty busy={!relationships}>{relationships ? '无法发起此通话。' : '正在读取联系人…'}</Empty>
  </Screen>;
  if (!isUiDemo) return <CallStage name={person.name}
    avatar={person.avatar ? { uri: 'data:image/jpeg;base64,' + person.avatar } : undefined} video={kind === 'video'} compact={false}
    background={kind === 'voice' ? backgrounds.resolve(undefined, true) : undefined}
    status="通话服务尚未启用，目前无法拨打。" controls={<CallAction action={{ label: '返回聊天', icon: 'close-outline', onPress: close }} />} />;
  if (!account) return null;
  return <DemoCall kind={kind} username={person.username} name={person.name}
    account={account} peerId={person.userId} incoming={incoming === '1'} onClose={close} />;
}
