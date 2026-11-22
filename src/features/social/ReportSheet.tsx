import { randomUUID } from 'expo-crypto';
import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { isUiDemo } from '../../demo/mode';
import { Button, Notice, Sheet } from '../../components/ui';
import { errorMessage } from '../../services/api';
import { useSession } from '../../services/session';
import { styles } from '../../theme';
import { CheckRow, Choices, Field } from './ui';

export type EvidenceLine = { id: string; content: string; mine: boolean; author?: string };
export const reportKinds = { boundary: '生活边界骚扰', harassment: '恶意骚扰', threat: '严重威胁' };

export function ReportSheet({
  groupId,
  peerId,
  anchor,
  lines,
  onClose,
}: {
  groupId?: string;
  peerId?: string;
  anchor: EvidenceLine;
  lines: EvidenceLine[];
  onClose: () => void;
}) {
  const { request } = useSession();
  const [clientId] = useState(randomUUID);
  const [kind, setKind] = useState<keyof typeof reportKinds>('boundary');
  const [chosen, setChosen] = useState<string[]>([anchor.id]);
  const [explanation, setExplanation] = useState('');
  const [status, setStatus] = useState<'choose' | 'preview' | 'submitted'>('choose');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const selection = lines.filter((line) => chosen.includes(line.id));
  async function submit() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await request('/p1/reports', {
        method: 'POST',
        body: {
          clientId,
          kind,
          groupId,
          peerId,
          anchorId: anchor.id,
          explanation,
          ...(groupId
            ? { messageIds: chosen }
            : { messages: selection.map(({ id, content, mine }) => ({ id, content, mine })) }),
        },
      });
      setStatus('submitted');
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Sheet
      title={
        status === 'submitted' ? (isUiDemo ? '举报已在本机保存' : '举报已受理') : status === 'preview' ? '确认提交的证据' : '生活边界保护举报'
      }
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {status === 'choose' && (
        <>
          <Choices labels={reportKinds} value={kind} set={setKind} />
          <Text style={styles.muted}>只提交选中的消息，可加上必要上下文，共 1–5 条。</Text>
          {lines.map((line) => (
            <CheckRow
              key={line.id}
              label={(line.author ?? (line.mine ? '我' : '对方')) + ' · ' + line.content}
              selected={chosen.includes(line.id)}
              action={() =>
                setChosen((current) =>
                  line.id === anchor.id
                    ? current
                    : current.includes(line.id)
                      ? current.filter((id) => id !== line.id)
                      : current.length < 5
                        ? [...current, line.id]
                        : current,
                )
              }
            />
          ))}
          <Field
            title="补充说明（可选）"
            value={explanation}
            maxLength={500}
            multiline
            onChangeText={setExplanation}
          />
          <Button label="预览提交内容" variant="gradient" onPress={() => setStatus('preview')} />
        </>
      )}
      {status === 'preview' && (
        <>
          <Text style={styles.strong}>{reportKinds[kind]}</Text>
          {selection.map((line) => (
            <View style={styles.card} key={line.id}>
              <Text style={styles.muted}>{line.author ?? (line.mine ? '我' : '对方')}</Text>
              <Text style={styles.body}>{line.content}</Text>
            </View>
          ))}
          {!!explanation && <Text style={styles.body}>{explanation}</Text>}
          <Text style={styles.muted}>{isUiDemo ? '举报仅保存在本机，证据不会发送给审核人员。' : '仅授权审核人员可查阅证据。群聊所选消息的原附件会一并加密提交。私聊原始证据需单独核验。'}</Text>
          <Button
            label={busy ? '正在提交…' : '确认举报'}
            variant="gradient"
            disabled={busy}
            onPress={() => void submit()}
          />
          <Button label="返回选择" variant="quiet" disabled={busy} onPress={() => setStatus('choose')} />
        </>
      )}
      {status === 'submitted' && (
        <>
          <Text style={styles.body}>处理状态可在「我的」里的生活边界保护查看。</Text>
          <Button label="完成" onPress={onClose} />
        </>
      )}
      {!!error && <Notice>{error}</Notice>}
    </Sheet>
  );
}
