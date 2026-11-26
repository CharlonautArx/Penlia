import { useTogether, useTogetherRouter } from '../../features/together/navigation';
import { ListRow, Notice, Screen } from '../../features/together/ui';
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
  const together=useTogether();
  const router = useTogetherRouter();
  const { data, error, load, busy, run, request } = useRecord<{ reminders: Reminder[] }>(
    '/p2/reminders',
    20000,
  );
  return (
    <Screen title="生活提醒" back={back} refreshing={busy} onRefresh={() => void load()}>
      {together && <ActivityReminders other={data?.reminders.length}/>}
      {!!error && (
        <Notice action="重试" onAction={() => void load()}>
          {error}
        </Notice>
      )}
      {!together && !data?.reminders.length && !error && <DataEmpty loading={!data}>还没有生活提醒。</DataEmpty>}
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

function ActivityReminders({other}:{other?:number}) {
  const router=useTogetherRouter();
  const {data,error}=useRecord<{reminders:{id:string;title:string;startsAt:string}[]}>('/p1/activity-reminders',30000);
  return <>{!error && other===0 && data?.reminders.length===0 && <DataEmpty loading={false}>还没有生活提醒。</DataEmpty>}{!!error && <Notice>{error}</Notice>}{data?.reminders.map(item=><ListRow key={item.id} title={item.title}
    detail={'活动即将开始 · '+new Date(item.startsAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}
    onPress={()=>router.push({pathname:'/gathering/[id]',params:{id:item.id}})}/>)}</>;
}
