import { stickerCaption } from '../../../features/stickers/wire';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { Avatar, Empty, Notice, Screen } from '../../../components/ui';
import type { RecordEntry } from '../../../features/chat/MessageManagement';
import { useSavedSender } from '../../../features/life/ChatFavorite';
import { PlaceMessage } from '../../../features/play/PlaceMessage';
import { parsePlaceCard } from '../../../features/play/place-card-model';
import { MomentMediaGrid } from '../../../features/moments/media';
import { useRecord } from '../../../features/social/ui';
import { createdTime } from '../../../features/space/model';
import { styles } from '../../../theme';

export default function ChatRecord() {
  const { id, favorite } = useLocalSearchParams<{ id: string; favorite?: string }>();
  const focused = useIsFocused();
  return <Screen title={favorite ? '收藏详情' : '聊天记录'} solid back={() => router.canGoBack() ? router.back() : router.replace('/life/items')}>
    {focused && <Content key={id} id={id} favorite={favorite === '1'} />}
  </Screen>;
}

function Content({ id, favorite }: { id: string; favorite: boolean }) {
  const { data, error, load } = useRecord<{ lines: RecordEntry[]; savedAt?: string }>('/chat-records/' + id, 10000);
  if (error) return <Notice action="重试" onAction={() => void load()}>{error}</Notice>;
  if (!data) return <Empty busy>正在读取聊天记录…</Empty>;
  return <>
    {data.lines.map((line, index) => favorite ? <FavoriteEntry key={index} line={line} /> :
      <View key={index} style={[styles.card, styles.divider]}>
        <Text style={styles.strong}>{line.author}</Text>
        <Text style={styles.small}>{createdTime(line.time)}</Text>
        <EntryBody line={line} />
      </View>)}
    {favorite && !!data.savedAt && <Text style={styles.small}>收藏于 {createdTime(Date.parse(data.savedAt))}</Text>}
  </>;
}

function FavoriteEntry({ line }: { line: RecordEntry }) {
  const sender = useSavedSender(line);
  return <View style={[styles.card, styles.divider]}>
    <View style={styles.row}>
      <Avatar userId={sender.id} name={sender.name} source={sender.source} size={37} />
      <View style={[styles.grow, { gap: 2 }]}>
        <Text style={styles.strong}>{sender.name}</Text>
        <Text style={styles.small}>{createdTime(line.time)}</Text>
      </View>
    </View>
    <EntryBody line={line} />
  </View>;
}

function EntryBody({ line }: { line: RecordEntry }) {
  const place = parsePlaceCard(line.body);
  return <>
    {!!line.quote && <Text style={styles.small}>{'引用：' + line.quote}</Text>}
    {place ? <PlaceMessage value={place} /> : !!line.body && <Text style={styles.body}>{stickerCaption(line.body)}</Text>}
    <MomentMediaGrid media={line.media} />
  </>;
}
