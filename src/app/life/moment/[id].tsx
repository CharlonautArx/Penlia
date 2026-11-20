import { router, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { Button, Notice, Screen, Section } from '../../../components/ui';
import { type Moment } from '../../../features/moments/Feed';
import { back, formatTime, useRecord } from '../../../features/social/ui';
import { DataEmpty, MediaStrip } from '../../../features/life/ui';
import { styles } from '../../../theme';
export default function SharedMoment() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, load } = useRecord<{ moment: Moment }>('/moments/' + id);
  const moment = data?.moment;
  return (
    <Screen title="生活动态" back={back}>
      {!!error && (
        <Notice action="重试" onAction={() => void load()}>
          {error}
        </Notice>
      )}
      {!moment && !error && <DataEmpty loading>暂无动态。</DataEmpty>}
      {moment && (
        <View style={styles.card}>
          <Section title={moment.author} detail={formatTime(moment.createdAt)} />
          {!!moment.body && <Text style={styles.body}>{moment.body}</Text>}
          <MediaStrip media={moment.media} />
          {moment.collaborationId && (
            <Button
              label="查看共同创作"
              variant="soft"
              onPress={() =>
                router.push({ pathname: '/collection/[id]', params: { id: moment.collaborationId! } })
              }
            />
          )}
        </View>
      )}
    </Screen>
  );
}
