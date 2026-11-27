import { isBuiltInStickerOnly } from '../../features/stickers/wire';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Empty, Icon, Notice, SearchField, Segments, Sheet, TopBar } from '../../components/ui';
import { useDemo } from '../../demo/state';
import { useChatHistory, useHistoryJump } from '../../features/chat/history';
import { fetchPeerPage, mergePeerRows } from '../../features/chat/peer-data';
import { useRecalls } from '../../features/chat/recalls';
import { calendarMonths, indexHistory, localDay, type SearchRow } from '../../features/chat/search-index';
import { ImageBubble } from '../../features/media/ImageBubble';
import { PeerFile, fileDetails } from '../../features/media/PeerFile';
import { PeerVideo } from '../../features/media/PeerVideo';
import { cachedAttachment, readPeerMessage, summaryOf, type ImageItem, type RichMessage } from '../../features/media/messages';
import { errorMessage } from '../../services/api';
import { useFriends } from '../../services/friends';
import { imUserId, useIm, type ImConnection } from '../../services/im';
import { useLocalPhotoUri } from '../../features/space/media';
import { useSession } from '../../services/session';
import { colors, contentWidth, radius, space, styles, type } from '../../theme';

type Category = 'date' | 'media' | 'sticker' | 'file';
const options: { id: Category; label: string }[] = [
  { id: 'date', label: '日期' }, { id: 'media', label: '图片与视频' }, { id: 'sticker', label: '表情' }, { id: 'file', label: '文件' },
];
const weekdays = ['日', '一', '二', '三', '四', '五', '六'];

export default function ChatSearch() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const { relationships } = useFriends();
  const accepted = !!relationships?.some((person) => person.userId === id && person.status === 'accepted');
  const { connection, online, revision, changed } = useIm();
  const demo = useDemo();
  const demoText = demo?.messages[id], demoMedia = demo?.media[id];
  const { hidden, ready } = useChatHistory('peer:' + id);
  const { peers, ready: recallsReady } = useRecalls();
  const marker = peers[id];
  const jump = useHistoryJump();
  const own = session?.user.id, peer = imUserId(id);
  const [rows, setRows] = useState<RichMessage[]>([]);
  const [query, setQuery] = useState('');
  const term = useDeferredValue(query.trim());
  const [category, setCategory] = useState<Category>();
  const [cursor, setCursor] = useState<string>();
  const [localCursor, setLocalCursor] = useState<string>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [preview, setPreview] = useState<RichMessage>();
  const lock = useRef(false);
  const generation = useRef(0);
  const convert = useCallback((incoming: Parameters<typeof readPeerMessage>[1][]) => !connection || !own ? [] :
    incoming.flatMap((item) => {
      const value = readPeerMessage(connection, item, imUserId(own), peer);
      return value && Number.isFinite(value.timestamp) ? [value] : [];
    }), [connection, own, peer]);

  useEffect(() => {
    if (!accepted || !connection) return;
    const round = ++generation.current;
    const { sdk, client } = connection;
    setRows([]);
    setLoaded(false);
    setCursor(undefined);
    setLocalCursor(undefined);
    const local = client.chatManager.getMsgs({ convId: peer, convType: sdk.ChatConversationType.PeerChat, startMsgId: '', loadCount: 50 });
    const remote = online ? fetchPeerPage(connection, peer) : Promise.resolve(undefined);
    void Promise.allSettled([local, remote]).then(([cached, network]) => {
      if (generation.current !== round) return;
      const base = cached.status === 'fulfilled' ? cached.value : [];
      if (base.length >= 50) setLocalCursor(convert(base).at(-1)?.id ?? base.at(-1)?.msgId);
      const page = network.status === 'fulfilled' ? network.value : undefined;
      setRows(mergePeerRows(convert(base), convert(page?.list ?? [])));
      setCursor(page?.cursor || undefined);
      setLoaded(true);
      if (network.status === 'rejected' && !base.length) setError('暂时无法读取聊天历史。');
    });
    return () => { generation.current++; };
  }, [accepted, connection, convert, online, peer]);
  useEffect(() => {
    if (!connection || !revision || !accepted) return;
    let active = true;
    const { client, sdk } = connection;
    void client.chatManager.getMsgs({ convId: peer, convType: sdk.ChatConversationType.PeerChat, startMsgId: '', loadCount: 40 })
      .then((recent) => { if (active) setRows((current) => mergePeerRows(current, convert(recent))); })
      .catch(() => {});
    return () => { active = false; };
  }, [accepted, connection, convert, peer, revision]);

  async function more() {
    if (lock.current || !connection || (!cursor && !localCursor)) return;
    lock.current = true;
    setBusy(true);
    setError('');
    const round = generation.current;
    try {
      if (cursor && online) {
        const page = await fetchPeerPage(connection, peer, cursor);
        if (round !== generation.current) return;
        setCursor(page.cursor && page.cursor !== cursor ? page.cursor : undefined);
        setRows((current) => mergePeerRows(current, convert(page.list ?? [])));
      } else {
        const page = await connection.client.chatManager.getMsgs({ convId: peer, convType: connection.sdk.ChatConversationType.PeerChat,
          startMsgId: localCursor!, loadCount: 50 });
        if (round !== generation.current) return;
        const older = convert(page).sort((a,b) => a.timestamp - b.timestamp)[0]?.id;
        setLocalCursor(page.length >= 50 && older !== localCursor ? older : undefined);
        setRows((current) => mergePeerRows(current, convert(page)));
      }
    } catch (failure) { if (round === generation.current) setError(errorMessage(failure)); }
    finally { lock.current = false; setBusy(false); }
  }

  const entries = useMemo(() => {
    if (!ready || !recallsReady || !accepted) return [];
    const history = demo ? mergePeerRows(demoText ?? [], demoMedia ?? []) : rows;
    return history.filter((row) => !hidden.has(row.id) && !Object.hasOwn(marker ?? {}, row.id));
  }, [accepted, demo, demoMedia, demoText, hidden, marker, ready, recallsReady, rows]);
  const index = useMemo(() => indexHistory(entries.map((row) => ({
    id: row.id, timestamp: row.timestamp, kind: 'text' in row ? row.sticker || isBuiltInStickerOnly(row.text) ? 'sticker' : 'text' : row.kind,
    caption: summaryOf(row), row,
  }))), [entries]);
  const results = useMemo(() => index.matching(term, category), [category, index, term]);
  const months = useMemo(() => calendarMonths(entries.at(-1)?.timestamp ?? Date.now()), [entries]);
  const back = () => router.canGoBack() ? router.back() : router.replace({ pathname: '/chat/[id]', params: { id } });
  function locate(message: RichMessage) {
    if (!jump || !entries.some((row) => row.id === message.id)) return;
    const position = entries.findIndex((row) => row.id === message.id);
    jump.current[id] = { id: message.id, window: entries.slice(Math.max(0, position - 14), position + 25) };
    Keyboard.dismiss();
    router.dismissTo({ pathname: '/chat/[id]', params: { id } });
  }

  const footer = !!(cursor || localCursor) && <Button label={busy ? '正在查找…' : '加载更早的聊天记录'} variant="quiet" onPress={() => void more()} disabled={busy} />;
  function resultRow(entry: SearchRow<RichMessage>) {
    const date = new Date(entry.timestamp).toLocaleString('zh-CN', { hour12: false });
    const hasPreview = ['image','video','file','sticker'].includes(entry.kind);
    return <View style={local.result}>
      <Pressable accessibilityRole="button" accessibilityLabel={entry.caption} style={styles.grow}
        onPress={() => hasPreview ? setPreview(entry.row) : locate(entry.row)}>
        <Text style={styles.body}>{entry.caption}</Text>
        <Text style={styles.small}>{'kind' in entry.row && entry.row.kind === 'file' ? fileDetails(entry.row) + ' · ' : ''}{date}</Text>
      </Pressable>
      {hasPreview && <Button label="定位" variant="quiet" onPress={() => locate(entry.row)} />}
    </View>;
  }

  return <SafeAreaView style={local.screen}>
    <TopBar title="查找聊天记录" back={back} />
    <View style={local.container}>
      <View style={local.controls}>
        <SearchField label="搜索聊天记录" variant="glass" placeholder="搜索当前聊天" value={query} onChangeText={setQuery} returnKeyType="search" />
        {accepted && <Segments<Category> label="查找分类" options={options} value={category} onChange={setCategory} />}
        {!!error && <Notice action="重试" onAction={() => void more()}>{error}</Notice>}
      </View>
      {!accepted ? <Empty busy={!relationships}>{relationships ? '此会话不可访问。' : '正在读取会话…'}</Empty>
        : category === 'date' && !term ? <>
          <View style={local.week}>{weekdays.map((day) => <Text key={day} style={[styles.small, local.dayText]}>{day}</Text>)}</View>
          <FlatList key="dates" data={months} keyExtractor={(item) => item.key} windowSize={5} initialNumToRender={2}
            ListFooterComponent={footer || undefined} keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => <View style={local.month}>
              <Text style={local.monthTitle}>{item.year}年 {item.month + 1}月</Text>
              <View style={local.calendar}>
                {Array.from({ length: item.first }, (_, blank) => <View key={'blank-' + blank} style={local.day} />)}
                {Array.from({ length: item.length }, (_, offset) => {
                  const day = offset + 1;
                  const key = item.key + '-' + String(day).padStart(2, '0');
                  const hit = index.dates.get(key);
                  return <Pressable key={key} accessibilityRole="button" accessibilityLabel={key + (hit ? ' 有聊天记录' : ' 无聊天记录')}
                    disabled={!hit} style={local.day} onPress={() => { if (hit) locate(hit.row); }}>
                    <Text style={[styles.body, !hit && local.dim]}>{day}</Text>
                  </Pressable>;
                })}
              </View>
            </View>} />
        </> : !term && !category ? <Empty>输入关键词，或选择一种分类查找。</Empty>
          : category === 'media' ? (
            <FlatList key="media" data={results} numColumns={3} keyExtractor={(item) => item.id}
              contentContainerStyle={local.list} windowSize={5} ListFooterComponent={footer || undefined}
              ListEmptyComponent={<Empty busy={!demo && !loaded && !!connection}>没有找到图片或视频。</Empty>}
              renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={'预览' + item.caption} style={local.media}
                onPress={() => setPreview(item.row)}>
                {'kind' in item.row && item.row.kind === 'image' ? <SearchPhoto item={item.row} connection={connection} />
                  : <><Icon name="play-circle-outline" size={29} /><Text style={styles.small}>视频</Text></>}
              </Pressable>} />
          ) : <FlatList key={category ?? 'keywords'} data={results} keyExtractor={(item) => item.id}
            contentContainerStyle={local.list} renderItem={({ item }) => resultRow(item)}
            keyboardShouldPersistTaps="handled" windowSize={7} ListFooterComponent={footer || undefined}
            ListEmptyComponent={<Empty busy={!demo && !loaded && !!connection}>没有找到相关消息。</Empty>} />}
    </View>
    {preview && entries.some((row) => row.id === preview.id) && <Sheet title="查看聊天消息" onClose={() => setPreview(undefined)}>
      <Text style={styles.small}>{localDay(preview.timestamp)}</Text>
      {'text' in preview ? <Text style={local.sticker}>{preview.text}</Text>
        : preview.kind === 'image' ? <ImageBubble item={preview} connection={connection} online={online} onDownloaded={changed} />
        : preview.kind === 'video' ? <PeerVideo item={preview} connection={connection} />
        : preview.kind === 'file' ? <PeerFile item={preview} connection={connection} /> : null}
      <Button label="定位原消息" variant="gradient" onPress={() => locate(preview)} />
    </Sheet>}
  </SafeAreaView>;
}

function SearchPhoto({ item, connection }: { item: ImageItem; connection: ImConnection | null }) {
  const localUri = useLocalPhotoUri(item.photoId);
  const uri = localUri ?? (connection && cachedAttachment(connection, item.source, true));
  return uri ? <Image source={{ uri }} resizeMode="cover" style={StyleSheet.absoluteFill} /> : <Icon name="image-outline" size={28} />;
}

const local = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.panel },
  container: { flex: 1, width: '100%', maxWidth: contentWidth, alignSelf: 'center' },
  controls: { paddingHorizontal: space.md, paddingVertical: space.sm, gap: space.sm },
  week: { ...styles.row, paddingHorizontal: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  dayText: { flex: 1, textAlign: 'center', paddingVertical: space.xs },
  month: { paddingHorizontal: space.md, paddingTop: space.md },
  monthTitle: { ...type.heading, color: colors.text, marginBottom: space.xs },
  calendar: { flexDirection: 'row', flexWrap: 'wrap' },
  day: { width: '14.2857%', minHeight: 45, paddingVertical: space.xs, justifyContent: 'center', alignItems: 'center' },
  dim: { color: colors.quiet },
  list: { paddingHorizontal: space.md, paddingBottom: space.xl },
  result: { ...styles.row, ...styles.divider, minHeight: 55, paddingVertical: space.sm, gap: space.xs },
  media: { width: '31.8%', marginRight: '1.5%', marginBottom: space.xxs, aspectRatio: 1, overflow: 'hidden',
    borderRadius: radius.small, backgroundColor: colors.search, alignItems: 'center', justifyContent: 'center' },
  sticker: { ...type.display, color: colors.ink, textAlign: 'center' },
});
