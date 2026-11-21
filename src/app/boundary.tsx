import { isUiDemo } from '../demo/mode';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { Button, Empty, ListRow, Notice, Screen, Section, Sheet } from '../components/ui';
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
type Report = { id: string; kind: keyof typeof reportKinds; status: 'pending' | 'closed' };
export default function Boundary() {
  const { data, error, run, busy, request, load } = useRecord<{
    reports: Report[];
    actions: Action[];
    canReview: boolean;
  }>('/p1/boundary');
  const [selected, setSelected] = useState<Action>();
  const [reason, setReason] = useState('');
  return (
    <Screen title="生活边界保护" back={back} refreshing={busy} onRefresh={() => void load()}>
      <Text style={styles.muted}>{isUiDemo ? '长按群聊消息可体验举报预览。演示记录留在本机。' : '长按聊天消息可以举报。确认提交前，可以查看将交给审核人员的内容。'}</Text>
      {!!error && <Notice>{error}</Notice>}
      {data?.canReview && (
        <ListRow title="审核工作台" detail="处理工单和申诉" onPress={() => router.push('/review/queue')} />
      )}
      <Section title="我的举报" />
      {data?.reports.map((item) => (
        <ListRow
          key={item.id}
          title={reportKinds[item.kind]}
          detail={isUiDemo ? '本机演示' : item.status === 'pending' ? '等待审核' : '已处理'}
        />
      ))}
      {data && !data.reports.length && <Empty>暂无举报记录。</Empty>}
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
