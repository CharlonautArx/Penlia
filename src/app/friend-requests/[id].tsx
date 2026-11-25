import { router, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

import { Button, Empty, Notice, Screen } from '../../components/ui';
import { requestStatuses, type FriendRequestStatus, type PublicPerson } from '../../features/friends/invitations';
import { PublicProfile } from '../../features/friends/PublicProfile';
import { back, useRecord } from '../../features/social/ui';
import { useFriends } from '../../services/friends';
import { space, styles } from '../../theme';

export default function ApplicantProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { refresh } = useFriends();
  const record = useRecord<{ person: PublicPerson; status: FriendRequestStatus; verificationMessage: string }>('/friend-requests/' + id);
  const data = record.data;
  function respond(action: 'accept' | 'decline') {
    void record.run(async () => {
      await record.request('/friends/' + action, { method: 'POST', body: { id } });
      await refresh();
      if (action === 'accept' && data) router.replace({ pathname: '/person/[id]', params: { id: data.person.id } });
    });
  }
  return <Screen title="公开资料" back={back}>
    {!!record.error && <Notice action="重试" onAction={() => void record.load()}>{record.error}</Notice>}
    {!data && !record.error && <Empty busy>正在读取公开资料…</Empty>}
    {data && <>
      <PublicProfile person={data.person} note={data.verificationMessage} />
      <Text style={styles.muted}>{requestStatuses[data.status]}</Text>
      {data.status === 'pending' && <View style={[styles.row, { gap: space.sm }]}>
        <Button label="拒绝" variant="quiet" disabled={record.busy} onPress={() => respond('decline')} />
        <View style={styles.grow}>
          <Button label="接受" variant="gradient" disabled={record.busy} onPress={() => respond('accept')} />
        </View>
      </View>}
      {data.person.isFriend && <Button label="查看好友主页" variant="gradient"
        onPress={() => router.replace({ pathname: '/person/[id]', params: { id: data.person.id } })} />}
    </>}
  </Screen>;
}
