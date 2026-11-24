import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { Empty, Notice, Screen } from '../../../components/ui';
import type { RecordEntry } from '../../../features/chat/MessageManagement';
import { MomentMediaGrid } from '../../../features/moments/media';
import { useRecord } from '../../../features/social/ui';
import { createdTime } from '../../../features/space/model';
import { styles } from '../../../theme';

export default function ChatRecord() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const focused = useIsFocused();
  return <Screen title="聊天记录" solid back={() => router.canGoBack() ? router.back() : router.replace('/')}>
    {focused && <Content key={id} id={id} />}
  </Screen>;
}

function Content({ id }: { id: string }) {
  const { data, error, load } = useRecord<{ lines: RecordEntry[] }>('/chat-records/' + id, 10000);
  return error ? <Notice action="重试" onAction={() => void load()}>{error}</Notice> : !data
    ? <Empty busy>正在读取聊天记录…</Empty>
    : <>{data.lines.map((line, index) => <View key={index} style={[styles.card, styles.divider]}>
      <Text style={styles.strong}>{line.author}</Text>
      <Text style={styles.small}>{createdTime(line.time)}</Text>
      {!!line.quote && <Text style={styles.small}>{'引用：' + line.quote}</Text>}
      {!!line.body && <Text style={styles.body}>{line.body}</Text>}
      <MomentMediaGrid media={line.media} />
    </View>)}</>;
}
