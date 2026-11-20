import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Empty, Notice, Sheet } from '../../components/ui';
import { styles } from '../../theme';
import { CheckRow, Choices, useRecord } from './ui';

const channels = { workspace: '共创成员', publication: '动态读者' };
type Channel = keyof typeof channels;
type Plan = {
  version: string;
  viewers: { id: string; name: string; allowed: boolean }[];
  available: boolean;
  hasConsent: boolean;
};

export function ContributionAudienceSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const [channel, setChannel] = useState<Channel>('workspace');
  const path = '/p1/contributions/' + id + '/audience?channel=' + channel;
  const { data, error, busy, load, request, run } = useRecord<Plan>(path);
  const [ids, setIds] = useState<string[]>([]);
  const [saved, setSaved] = useState('');
  const [revoke, setRevoke] = useState(false);
  useEffect(() => {
    setIds(data?.viewers.filter((p) => p.allowed).map((p) => p.id) ?? []);
  }, [data]);
  const current = data?.viewers.filter((p) => p.allowed).map((p) => p.id) ?? [];
  const changed = ids.length !== current.length || ids.some((id) => !current.includes(id));
  return (
    <Sheet
      title="这条贡献的可见范围"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <Choices
        labels={channels}
        value={channel}
        set={(next) => {
          if (!busy) {
            setSaved('');
            setRevoke(false);
            setChannel(next);
          }
        }}
      />
      <Text style={styles.muted}>
        {channel === 'workspace'
          ? '仅授权你勾选的现有共创成员。以后加入的成员需要你另行授权。'
          : '可以从符合动态范围的好友和共创成员中选人。新增读者仍需你亲自确认。'}
      </Text>
      {!!error && (
        <Notice action="刷新" onAction={() => void load()}>
          {error}
        </Notice>
      )}
      {!!saved && !error && <Notice>{saved}</Notice>}
      {!data && !error && <Empty busy>正在读取可见范围…</Empty>}
      {data && !data.available && <Empty>发起者发布共创动态后，可以选择动态读者。</Empty>}
      {data?.available && !data.viewers.length && <Empty>当前没有可授权的读者。</Empty>}
      {data?.viewers.map((viewer) => (
        <CheckRow
          key={viewer.id}
          label={viewer.name}
          selected={ids.includes(viewer.id)}
          action={() => {
            if (!busy) {
              setSaved('');
              setIds((old) =>
                old.includes(viewer.id) ? old.filter((id) => id !== viewer.id) : [...old, viewer.id],
              );
            }
          }}
        />
      ))}
      {data?.available && changed && (
        <Button
          label="确认所选读者"
          variant="gradient"
          disabled={busy}
          onPress={() =>
            void run(async () => {
              await request(path, { method: 'PATCH', body: { version: data.version, viewerIds: ids } });
              setSaved('已更新这条贡献的可见范围。');
            })
          }
        />
      )}
      {data?.hasConsent && (
        <View>
          {revoke && <Text style={styles.muted}>确认后，这个范围内的原读者将立即失去新的访问权限。</Text>}
          <Button
            label={revoke ? '确认撤销全部授权' : '撤销此范围的全部授权'}
            variant="danger"
            disabled={busy}
            onPress={() => {
              if (!revoke) {
                setRevoke(true);
                return;
              }
              void run(async () => {
                await request(path, { method: 'DELETE' });
                setRevoke(false);
                setSaved('已撤销授权。');
              });
            }}
          />
        </View>
      )}
    </Sheet>
  );
}
