import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { Button, Empty, ListRow, Notice, Screen, Section } from '../../components/ui';
import { reportKinds } from '../../features/social/ReportSheet';
import { back, Choices, Field, formatTime, useRecord } from '../../features/social/ui';
import { styles } from '../../theme';

const penaltyNames = {
  warning: '提醒',
  limit_contact: '限制主动联系',
  limit_sending: '限制发送',
  limit_account: '限制账号通信',
};
type Item = {
  id: string;
  kind: keyof typeof reportKinds;
  provenance: string;
  status: string;
  appeal?: string;
};
type Evidence = {
  kind: keyof typeof reportKinds;
  provenance: string;
  status: string;
  evidence: {
    explanation?: string;
    anchorId: string;
    messages: { id: string; content: string; senderId?: string; mine?: boolean; attachmentCount?: number }[];
  };
};
const sources: Record<string, string> = {
  group: '服务端群聊记录',
  private_pending: '待核验私聊证据',
  private_verified: '已核验私聊证据',
};

export default function Review() {
  const { id, appeal } = useLocalSearchParams<{ id: string; appeal?: string }>();
  if (id === 'queue') return <Queue />;
  return appeal === '1' ? <Appeal id={id} /> : <Case id={id} />;
}

function Queue() {
  const { data, error, load } = useRecord<{ queue: Item[] }>('/p1/reviews');
  return (
    <Screen title="审核工作台" back={back} onRefresh={() => void load()}>
      {!!error && <Notice>{error}</Notice>}
      {data && !data.queue.length && <Empty>暂无待处理工单。</Empty>}
      {data?.queue.map((item) => (
        <ListRow
          key={item.id}
          title={reportKinds[item.kind]}
          detail={item.appeal === 'pending' ? '待独立复核' : sources[item.provenance]}
          onPress={() =>
            router.push({
              pathname: '/review/[id]',
              params: { id: item.id, appeal: item.appeal === 'pending' ? '1' : '0' },
            })
          }
        />
      ))}
    </Screen>
  );
}
function Case({ id }: { id: string }) {
  const base = '/p1/reviews/' + id;
  const { data, error, request, run, busy } = useRecord<Evidence>(base + '/evidence');
  const [penalty, setPenalty] = useState<keyof typeof penaltyNames>('warning');
  const [duration, setDuration] = useState('24');
  const [reason, setReason] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [audit, setAudit] = useState<{ action: string; recordedAt: string }[]>();
  const kinds = { warning: '提醒', limit_contact: '限制主动联系', limit_sending: '限制发送' };
  const act = (action: string, body: Record<string, unknown>) =>
    request(base + '/' + action, { method: 'POST', body });
  return (
    <Screen title="举报工单" back={back}>
      {!!error && <Notice>{error}</Notice>}
      {data && (
        <>
          <Section title={reportKinds[data.kind]} detail={sources[data.provenance]} />
          {!!data.evidence.explanation && <Text style={styles.body}>{data.evidence.explanation}</Text>}
          {data.evidence.messages.map((line) => (
            <View style={styles.card} key={line.id}>
              <Text style={styles.strong}>
                {line.id === data.evidence.anchorId ? '举报锚点' : '上下文'}
                {line.senderId ? ' · ' + line.senderId : ''}
              </Text>
              <Text style={styles.body}>
                {line.content || '无文字'}
                {line.attachmentCount ? ' · 附件 ' + line.attachmentCount : ''}
              </Text>
            </View>
          ))}
          {data.status === 'pending' && (
            <>
              {data.provenance === 'private_pending' && (
                <Button
                  label="核验私聊原始证据"
                  variant="soft"
                  disabled={busy}
                  onPress={() => void run(() => act('verify', {}))}
                />
              )}
              {data.kind === 'boundary' ? (
                <Choices
                  labels={kinds}
                  value={penalty === 'limit_account' ? undefined : penalty}
                  set={setPenalty}
                />
              ) : (
                <Choices labels={penaltyNames} value={penalty} set={setPenalty} />
              )}
              {data.kind !== 'boundary' && (
                <ListRow
                  title="紧急风险，立即生效"
                  trailing={<Switch accessibilityLabel="紧急风险" value={urgent} onValueChange={setUrgent} />}
                />
              )}
              <Field
                title="处置小时数"
                value={duration}
                onChangeText={setDuration}
                keyboardType="number-pad"
              />
              <Field title="内部审核依据" value={reason} onChangeText={setReason} multiline maxLength={300} />
              <Button
                label="确认违规并提交处置"
                variant="danger"
                disabled={busy || !reason.trim() || data.provenance === 'private_pending'}
                onPress={() =>
                  void run(async () => {
                    await act('decision', {
                      decision: 'confirm',
                      penalty,
                      durationHours: Number(duration),
                      reason,
                      urgent,
                    });
                    router.back();
                  }, false)
                }
              />
              <Button
                label="证据不足，关闭工单"
                variant="quiet"
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    await act('decision', { decision: 'dismiss' });
                    router.back();
                  }, false)
                }
              />
            </>
          )}
          <Button
            label="查看审核轨迹"
            variant="soft"
            onPress={() =>
              void run(async () => {
                setAudit((await request<{ audit: NonNullable<typeof audit> }>(base + '/audit')).audit);
              }, false)
            }
          />
          {audit?.map((row, index) => (
            <ListRow key={index} title={row.action} detail={formatTime(row.recordedAt)} />
          ))}
        </>
      )}
    </Screen>
  );
}
function Appeal({ id }: { id: string }) {
  const base = '/p1/appeals/' + id;
  const { data, error, request, run, busy } = useRecord<{
    appeal: { kind: keyof typeof penaltyNames; reason: string; explanation: string; status: string };
  }>(base);
  const [resolution, setResolution] = useState('');
  return (
    <Screen title="独立申诉复核" back={back}>
      {!!error && <Notice>{error}</Notice>}
      {data && (
        <>
          <Section title={penaltyNames[data.appeal.kind]} />
          <Text style={styles.muted}>{data.appeal.reason}</Text>
          <Text style={styles.body}>{data.appeal.explanation}</Text>
          <Button
            label="查看原证据"
            variant="soft"
            onPress={() => router.push({ pathname: '/review/[id]', params: { id } })}
          />
          {data.appeal.status === 'pending' && (
            <>
              <Field
                title="内部复核依据"
                value={resolution}
                onChangeText={setResolution}
                maxLength={300}
                multiline
              />
              {(['upheld', 'overturned'] as const).map((decision) => (
                <Button
                  key={decision}
                  label={decision === 'upheld' ? '维持处置' : '撤销处置'}
                  disabled={busy || !resolution.trim()}
                  variant={decision === 'upheld' ? 'danger' : 'soft'}
                  onPress={() =>
                    void run(async () => {
                      await request(base + '/decision', { method: 'POST', body: { decision, resolution } });
                      router.back();
                    }, false)
                  }
                />
              ))}
            </>
          )}
        </>
      )}
    </Screen>
  );
}
