import type { ReactNode } from 'react';
import { randomUUID } from 'expo-crypto';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Field, formatTime, useRecord } from '../social/ui';
import { styles } from '../../theme';
import { Button, Notice, Sheet } from './ui';

type Message = { id: string; name: string; body: string; mine: boolean; createdAt: string };

export function ActivityDiscussion({ id, ended, trigger }: { id: string; ended: boolean; trigger?: (open: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {trigger ? trigger(() => setOpen(true)) : <Button label="活动留言" variant="soft" onPress={() => setOpen(true)} />}
      {open && <DiscussionPanel key={id} id={id} ended={ended} close={() => setOpen(false)} />}
    </>
  );
}

function DiscussionPanel({ id, ended, close }: { id: string; ended: boolean; close: () => void }) {
  const path = '/p1/gatherings/' + id + '/discussion';
  const { data, request, run, error, busy } = useRecord<{ joined: boolean; messages: Message[] }>(
    path,
    15000,
  );
  const [text, setText] = useState('');
  const [clientId, setId] = useState(randomUUID);
  const send = (action: string, extra: Record<string, unknown> = {}) =>
    request(path, { method: 'POST', body: { action, ...extra } });
  return (
    <Sheet title="活动留言" onClose={close} avoidKeyboard>
      <Text style={styles.muted}>留言仅分享给发送时已加入留言区的朋友。退出会移除自己的留言和阅读授权。</Text>
      {data && !data.joined && !ended && (
        <Button label="自愿加入留言区" onPress={() => void run(() => send('join'))} />
      )}
      {data?.joined && (
        <>
          {!ended && (
            <>
              <Field title="写下留言" value={text} maxLength={240} multiline onChangeText={setText} />
              <Button
                label="分享给当前留言区成员"
                disabled={busy || !text.trim()}
                onPress={() =>
                  void run(async () => {
                    await send('post', { text, clientId });
                    setText('');
                    setId(randomUUID());
                  })
                }
              />
            </>
          )}
          {data.messages.map((m) => (
            <View key={m.id} style={styles.card}>
              <Text style={styles.muted}>
                {m.name} · {formatTime(m.createdAt)}
              </Text>
              <Text style={styles.body}>{m.body}</Text>
              {m.mine && (
                <Button
                  label="撤回留言"
                  variant="quiet"
                  onPress={() => void run(() => send('withdraw', { id: m.id }))}
                />
              )}
            </View>
          ))}
          <Button
            label="退出留言区并移除我的留言"
            variant="quiet"
            onPress={() => void run(() => send('leave'))}
          />
        </>
      )}
      {ended && !data?.joined && <Text style={styles.muted}>活动已结束。</Text>}
      {!!error && <Notice>{error}</Notice>}
    </Sheet>
  );
}
