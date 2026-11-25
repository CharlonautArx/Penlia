import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Avatar, Button, Empty, ListRow, Notice, Screen, Segments, SettingGroup } from '../../components/ui';
import { demoPortrait } from '../../demo/visuals';
import { requestStatuses, type FriendRequest } from '../../features/friends/invitations';
import { orderFriendRequests } from '../../features/friends/request-order';
import { useAppearance } from '../../components/appearance';
import { back, useRecord } from '../../features/social/ui';
import { useFriends } from '../../services/friends';
import { styles } from '../../theme';

type Direction = 'incoming' | 'outgoing';

export default function FriendRequests() {
  const [direction, setDirection] = useState<Direction>('incoming');
  const { scheme } = useAppearance();
  const requests = useRecord<{ requests: FriendRequest[] }>('/friend-requests');
  const { refresh } = useFriends();
  const items = requests.data && orderFriendRequests(requests.data.requests.filter((item) => item.outgoing === (direction === 'outgoing')));
  function respond(id: string, action: 'accept' | 'decline') {
    void requests.run(async () => {
      await requests.request('/friends/' + action, { method: 'POST', body: { id } });
      await refresh();
    });
  }
  return <Screen title="好友申请" back={back} refreshing={requests.busy} onRefresh={() => void requests.load()}>
    <Segments<Direction> label="好友申请" value={direction} onChange={setDirection}
      options={[{ id: 'incoming', label: '收到的申请' }, { id: 'outgoing', label: '发出的申请' }]} />
    {!!requests.error && <Notice action="重试" onAction={() => void requests.load()}>{requests.error}</Notice>}
    {!items && !requests.error && <Empty busy>正在读取好友申请…</Empty>}
    {items?.length === 0 && <Empty icon="people-outline">{direction === 'incoming' ? '还没有收到好友申请。' : '还没有发出的好友申请。'}</Empty>}
    {!!items?.length && <SettingGroup>
      {items.map((item, index) => <ListRow key={item.id} title={item.name}
        detail={[requestStatuses[item.status], item.verificationMessage].filter(Boolean).join(' · ')}
        separator={index !== items.length - 1}
        style={item.status === 'pending' && { backgroundColor: scheme === 'dark' ? '#FF768D18' : '#FF768D0E' }}
        left={<Avatar userId={item.friendId} name={item.name} size={40} source={item.avatar ? { uri: 'data:image/jpeg;base64,' + item.avatar } : demoPortrait(item.demoPortraitKey ?? '')} />}
        onPress={!item.outgoing ? () => router.push({ pathname: '/friend-requests/[id]', params: { id: item.id } }) :
          item.friendId ? () => router.push({ pathname: '/person/[id]', params: { id: item.friendId! } }) : undefined}
        trailing={!item.outgoing && item.status === 'pending' ? <View style={styles.row}>
          <Button label="拒绝" variant="quiet" disabled={requests.busy} onPress={() => respond(item.id, 'decline')} />
          <Button label="接受" variant="gradient" disabled={requests.busy} onPress={() => respond(item.id, 'accept')} />
        </View> : undefined} />)}
    </SettingGroup>}
  </Screen>;
}
