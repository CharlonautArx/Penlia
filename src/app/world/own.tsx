import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, ListRow, Notice, Screen, Sheet } from '../../components/ui';
import { DataEmpty } from '../../features/life/ui';
import { back, formatTime, useRecord } from '../../features/social/ui';
import type { Page, WorldRecord } from '../../features/world/model';
import { styles } from '../../theme';

type Item = Pick<WorldRecord,'id'|'kind'|'body'|'createdAt'>;
const labels = { contribution:'瞬间投稿', link:'记录连结', decoration:'世界摆件' };

export default function Own() {
  const [offset,setOffset] = useState(0);
  const { data, busy, run, error, request, load } = useRecord<Page<Item>>('/p3/own?offset=' + offset);
  const [target,setTarget] = useState<Item>();
  return (
    <Screen title="我的投稿与摆件" back={back} refreshing={busy} onRefresh={() => void load()}>
      <Text style={styles.muted}>离开空间后仍可在这里撤回你自己的记录。</Text>
      {!!error && !target && <Notice>{error}</Notice>}
      {!data?.records.length && !error && <DataEmpty loading={!data}>还没有你的投稿或摆件。</DataEmpty>}
      {data?.records.map((item) => <ListRow key={item.id} title={item.body || labels[item.kind]} detail={formatTime(item.createdAt)}
        onPress={() => setTarget(item)} />)}
      <View style={styles.row}>
        {offset > 0 && <Button label="上一页" variant="quiet" onPress={() => setOffset(Math.max(0,offset-20))} />}
        {data?.next != null && <Button label="下一页" variant="soft" onPress={() => setOffset(data.next!)} />}
      </View>
      {target && <Sheet title={'撤回' + labels[target.kind]} onClose={() => setTarget(undefined)}>
        <Text style={styles.muted}>你在空间内分享的这条记录将立即停止访问。</Text>
        {!!error && <Notice>{error}</Notice>}
        <Button label="确认撤回" variant="danger" disabled={busy} onPress={() => void run(async () => {
          await request('/p3/records/'+target.id,{method:'DELETE'});
          setTarget(undefined);
        })} />
      </Sheet>}
    </Screen>
  );
}
