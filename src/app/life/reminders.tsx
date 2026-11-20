import { router } from 'expo-router';
import { ListRow, Notice, Screen } from '../../components/ui';
import { back, useRecord } from '../../features/social/ui';
import { DataEmpty } from '../../features/life/ui';
type Reminder = {
  subjectId: string;
  kind: 'memory' | 'capsule';
  title: string;
  dueDay: string;
  readAt: string | null;
};
export default function Reminders() {
  const { data, error, load, busy, run, request } = useRecord<{ reminders: Reminder[] }>(
    '/p2/reminders',
    20000,
  );
  return (
    <Screen title="生活提醒" back={back} refreshing={busy} onRefresh={() => void load()}>
      {!!error && (
        <Notice action="重试" onAction={() => void load()}>
          {error}
        </Notice>
      )}
      {!data?.reminders.length && !error && <DataEmpty loading={!data}>还没有生活提醒。</DataEmpty>}
      {data?.reminders.map((item) => (
        <ListRow
          key={item.kind + item.subjectId + item.dueDay}
          title={item.kind === 'capsule' ? '可以开启时光胶囊' : '一段共同回忆'}
          detail={item.title + ' · ' + item.dueDay + (item.readAt ? '' : ' · 新')}
          onPress={() =>
            void run(async () => {
              await request('/p2/reminders/' + item.subjectId + '/read', {
                method: 'POST',
                body: { kind: item.kind, dueDay: item.dueDay },
              });
              if (item.kind === 'capsule')
                router.push({
                  pathname: '/life/project/[id]',
                  params: { id: item.subjectId, kind: 'capsule' },
                });
              else router.push({ pathname: '/life/memories', params: { id: item.subjectId } });
            }, false)
          }
        />
      ))}
    </Screen>
  );
}
