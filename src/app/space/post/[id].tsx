import { Redirect, router, useLocalSearchParams } from 'expo-router';

import { Empty, Screen } from '../../../components/ui';
import { EntryCard } from '../../../features/space/EntryCard';
import { useSpace } from '../../../features/space/store';

export default function PostScreen() {
  const { id, viewer } = useLocalSearchParams<{ id: string; viewer?: string }>();
  const state = useSpace();
  const original = state.value?.entries.find((item) => item.id === id);
  if (original?.cloudId && !viewer && state.owns(original.ownerId)) return <Redirect
    href={{ pathname: '/life/moment/[id]', params: { id: original.cloudId } }} />;
  const entry = original && state.entryVisible(original, viewer) ? original : undefined;
  return <Screen title={entry?.kind === 'journal' ? '日志详情' : '动态详情'}
    back={() => router.canGoBack() ? router.back() : router.replace('/moments')} solid>
    {entry ? <EntryCard entry={entry} viewer={viewer} full />
      : <Empty busy={state.loading}>{state.error || (state.loading ? '正在读取动态…' : '这条动态当前不可见。')}</Empty>}
  </Screen>;
}
