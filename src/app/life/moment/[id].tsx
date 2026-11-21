import { useLocalSearchParams } from 'expo-router';
import { Notice, Screen } from '../../../components/ui';
import { type Moment } from '../../../features/moments/Feed';
import { back, useRecord } from '../../../features/social/ui';
import { DataEmpty } from '../../../features/life/ui';
import { PostCard } from '../../../features/moments/PostCard';
export default function SharedMoment() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, load } = useRecord<{ moment: Moment }>('/moments/' + id);
  const moment = data?.moment;
  return (
    <Screen title="生活动态" back={back} solid inset={false}>
      {!!error && (
        <Notice action="重试" onAction={() => void load()}>
          {error}
        </Notice>
      )}
      {!moment && !error && <DataEmpty loading>暂无动态。</DataEmpty>}
      {moment && <PostCard item={moment} />}
    </Screen>
  );
}
