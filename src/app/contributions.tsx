import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Empty, ListRow, Notice, Screen, Sheet } from '../components/ui';
import { ContributionAudienceSheet } from '../features/social/ContributionAudienceSheet';
import { back, useRecord } from '../features/social/ui';
import { styles } from '../theme';

type Item = {
  id: string;
  title: string;
  body: string;
  removedAt: string | null;
  kind: 'journal' | 'collaboration';
};
export default function Contributions() {
  const { data, error, request, busy, run } = useRecord<{ contributions: Item[] }>('/p1/contributions');
  const [audienceId, setAudienceId] = useState<string>();
  const [selected, setSelected] = useState<Item>();
  return (
    <Screen title="我贡献的内容" back={back}>
      {!!error && <Notice>{error}</Notice>}
      {data && !data.contributions.length && <Empty>你还没有补充共同记录。</Empty>}
      {data?.contributions.map((item) => (
        <ListRow
          key={item.id}
          title={item.title}
          detail={item.removedAt ? '已撤回' : item.body || '含媒体附件'}
          trailing={
            !item.removedAt ? (
              <View>
                {item.kind === 'collaboration' && (
                  <Button label="管理读者" variant="soft" onPress={() => setAudienceId(item.id)} />
                )}
                <Button label="撤回" variant="danger" onPress={() => setSelected(item)} />
              </View>
            ) : undefined
          }
        />
      ))}
      {audienceId && <ContributionAudienceSheet id={audienceId} onClose={() => setAudienceId(undefined)} />}
      {selected && (
        <Sheet title="撤回内容" onClose={() => setSelected(undefined)}>
          <Text style={styles.muted}>文字和附件将从共同记录中移除。</Text>
          {!!error && <Notice>{error}</Notice>}
          <Button
            label="确认撤回"
            variant="danger"
            disabled={busy}
            onPress={() =>
              void run(async () => {
                await request('/p1/contributions/' + selected.id, { method: 'DELETE' });
                setSelected(undefined);
              })
            }
          />
        </Sheet>
      )}
    </Screen>
  );
}
