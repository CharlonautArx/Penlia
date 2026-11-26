import { useState } from 'react';
import { Text } from 'react-native';
import { Button, ListRow, Notice, Screen, Sheet } from '../../features/together/ui';
import { DataEmpty } from '../../features/life/ui';
import { back, useRecord } from '../../features/social/ui';
import { styles } from '../../theme';

type Item = { id: string; title: string };
export default function CapsuleDrafts() {
  const { data, error, request, busy, run } = useRecord<{ entries: Item[] }>('/p2/capsule-entries');
  const [choice, setChoice] = useState<Item>();
  return (
    <Screen title="我的胶囊投稿" back={back}>
      {!!error && <Notice>{error}</Notice>}
      {!data?.entries.length && !error && <DataEmpty loading={!data}>还没有胶囊投稿。</DataEmpty>}
      {data?.entries.map((item) => (
        <ListRow
          key={item.id}
          title={item.title}
          detail="退出胶囊后仍可撤回"
          trailing={<Button label="撤回" variant="danger" onPress={() => setChoice(item)} />}
        />
      ))}
      {choice && (
        <Sheet title="撤回这条投稿" onClose={() => setChoice(undefined)}>
          <Text style={styles.muted}>此操作会移除你在这个胶囊里的文字和附件。</Text>
          {!!error && <Notice>{error}</Notice>}
          <Button
            label="确认撤回"
            variant="danger"
            disabled={busy}
            onPress={() =>
              void run(async () => {
                await request('/p2/capsule-entries/' + choice.id, { method: 'DELETE' });
                setChoice(undefined);
              })
            }
          />
        </Sheet>
      )}
    </Screen>
  );
}
