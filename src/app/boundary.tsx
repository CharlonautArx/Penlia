import { isUiDemo } from '../demo/mode';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Empty, Icon, IconButton, ListRow, Notice, Screen, Section, Sheet } from '../components/ui';
import { reportKinds } from '../features/social/ReportSheet';
import { back, Field, formatTime, useRecord } from '../features/social/ui';
import { styles } from '../theme';

export const penaltyNames = {
  warning: '提醒',
  limit_contact: '暂时限制主动联系',
  limit_sending: '暂时限制消息发送',
  limit_account: '暂时限制账号通信',
};
type Action = {
  id: string;
  kind: keyof typeof penaltyNames;
  reason: string;
  expiresAt: string;
  overturned: boolean;
  appeal: string | null;
  resolution: string | null;
};
type Report = { id: string; kind: keyof typeof reportKinds; status: 'pending' | 'closed'; submittedAt?: string };
type HistoryPage = { reports: Report[]; next?: string | null };
export default function Boundary() {
  const { data, error, run, busy, request, load } = useRecord<{
    reports: Report[];
    next?: string | null;
    actions: Action[];
    canReview: boolean;
  }>('/p1/boundary');
  const [selected, setSelected] = useState<Action>();
  const [reason, setReason] = useState('');
  const [checked, setChecked] = useState<Set<string>>();
  const [deleting, setDeleting] = useState<{ ids?: string[]; all?: true }>();
  const [older, setOlder] = useState<HistoryPage>();
  useEffect(() => { setOlder(undefined); }, [data]);
  const reports = [...(data?.reports ?? []), ...(older?.reports ?? [])];
  const next = older ? older.next : data?.next;
  function toggle(id: string) {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else if (next.size < 100) next.add(id);
      return next;
    });
  }
  return (
    <Screen title="生活边界保护计划" back={back} refreshing={busy} onRefresh={() => void load()}>
      <Text style={styles.muted}>{isUiDemo ? '长按单聊或群聊消息即可举报。预览版的记录保存在本机。' : '长按聊天消息可以举报。确认提交前，可以查看将交给审核人员的内容。'}</Text>
      {!!error && <Notice>{error}</Notice>}
      {data?.canReview && (
        <ListRow title="审核工作台" detail="处理工单和申诉" onPress={() => router.push('/review/queue')} />
      )}
      <Section title="我的举报" />
      {!!reports.length && <View style={styles.row}>
        <Button label={checked ? '退出多选' : '多选'} variant="quiet" disabled={busy}
          onPress={() => setChecked(checked ? undefined : new Set())} />
        {checked ? <Button label={'删除已选 ' + checked.size + ' 条'} variant="danger" disabled={!checked.size || busy}
          onPress={() => setDeleting({ ids: [...checked] })} />
          : <Button label="清空举报历史" variant="quiet" disabled={busy} onPress={() => setDeleting({ all: true })} />}
      </View>}
      {reports.map((item) => (
        <ListRow key={item.id} title={reportKinds[item.kind]}
          detail={[isUiDemo ? '保存在本机' : item.status === 'pending' ? '等待审核' : '已处理',
            item.submittedAt ? formatTime(item.submittedAt) : ''].filter(Boolean).join(' · ')}
          onPress={checked ? () => toggle(item.id) : undefined}
          left={checked ? <Icon name={checked.has(item.id) ? 'checkmark-circle' : 'ellipse-outline'} /> : undefined}
          trailing={checked ? undefined : <IconButton label="删除举报记录" icon="trash-outline" disabled={busy}
            onPress={() => setDeleting({ ids: [item.id] })} />} />
      ))}
      {!!next && <Button label="查看更多举报" disabled={busy} variant="soft" onPress={() => void run(async () => {
        const page = await request<HistoryPage>('/p1/boundary?before=' + encodeURIComponent(next));
        setOlder((current) => ({ reports: [...(current?.reports ?? []), ...page.reports], next: page.next }));
      }, false)} />}
      {data && !reports.length && <Empty>暂无举报记录。</Empty>}
      {deleting && <Sheet title={deleting.all ? '清空举报历史' : '删除举报记录'}
        onClose={() => { if (!busy) setDeleting(undefined); }}>
        <Text style={styles.body}>{isUiDemo ? '确认从个人举报历史移除这些记录？' :
          '所选记录会从你的举报历史移除。已提交的举报仍按原流程审核和处理。'}</Text>
        {!!error && <Notice>{error}</Notice>}
        <Button label={deleting.all ? '确认清空历史' : '确认删除记录'} variant="danger" disabled={busy}
          onPress={() => void run(async () => {
            await request('/p1/boundary', { method: 'POST', body: deleting });
            setDeleting(undefined);
            setChecked(undefined);
          })} />
      </Sheet>}
      {!!data?.actions.length && <Section title="处置与申诉" />}
      {data?.actions.map((item) => (
        <ListRow
          key={item.id}
          title={penaltyNames[item.kind]}
          detail={
            item.reason +
            '\n' +
            (item.overturned ? '已撤销' : '到期 ' + formatTime(item.expiresAt)) +
            (item.appeal ? ' · ' + (item.resolution || '复核中') : '')
          }
          trailing={
            !item.appeal ? (
              <Button
                label="申诉"
                variant="soft"
                onPress={() => {
                  setReason('');
                  setSelected(item);
                }}
              />
            ) : undefined
          }
        />
      ))}
      {selected && (
        <Sheet
          title="提交申诉"
          onClose={() => {
            if (!busy) setSelected(undefined);
          }}
        >
          <Field title="申诉说明" value={reason} onChangeText={setReason} maxLength={1000} multiline />
          {!!error && <Notice>{error}</Notice>}
          <Button
            label="提交申诉"
            variant="gradient"
            disabled={busy || !reason.trim()}
            onPress={() =>
              void run(async () => {
                await request('/p1/enforcement/' + selected.id + '/appeal', {
                  method: 'POST',
                  body: { explanation: reason },
                });
                setSelected(undefined);
              })
            }
          />
        </Sheet>
      )}
    </Screen>
  );
}
