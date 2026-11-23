import { router, useIsFocused } from 'expo-router';
import { Empty, Notice, Screen } from '../../components/ui';
import { useRecord } from '../social/ui';
import { type Moment } from './model';
import { PostCard } from './PostCard';

export function MomentDetail({ path, protectedReference }: { path: string; protectedReference?: boolean }) {
  const focused = useIsFocused();
  return <Screen title={protectedReference ? '转发动态' : '生活动态'} solid inset={false}
    back={() => router.canGoBack() ? router.back() : router.replace('/moments')}>
    {focused && <Content key={path} path={path} protectedReference={protectedReference} />}
  </Screen>;
}

function Content({ path, protectedReference }: { path: string; protectedReference?: boolean }) {
  const { data, error, load } = useRecord<{ moment: Moment }>(path, protectedReference ? 10000 : undefined);
  return error ? <Notice action="重试" onAction={() => void load()}>{error}</Notice> :
    data?.moment ? <PostCard item={data.moment} /> : <Empty busy>正在读取动态…</Empty>;
}
