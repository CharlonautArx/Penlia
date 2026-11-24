import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Icon, ListRow, Notice, SettingGroup, TopBar } from '../components/ui';
import { WallpaperImage } from '../features/chat/background/WallpaperImage';
import type { LocalPicture } from '../features/chat/background/model';
import { deletePicture, nativeChatBackgrounds, pickBackground, useChatBackgrounds } from '../features/chat/background/store';
import { useFriends } from '../services/friends';
import { colors, contentWidth, radius, space, styles } from '../theme';

export default function ChatBackgroundScreen() {
  const { peer: requestedPeer, mode, currentOnly } = useLocalSearchParams<{ peer?: string; mode?: string; currentOnly?: string }>();
  const voice = mode === 'voice';
  const { relationships } = useFriends();
  const friend = relationships?.find((entry) => entry.userId === requestedPeer && entry.status === 'accepted');
  const peer = voice ? undefined : friend?.userId;
  const store = useChatBackgrounds();
  const [draft, setDraft] = useState<LocalPicture>();
  const [dragging, setDragging] = useState(false);
  const [operation, setOperation] = useState<'pick' | 'save'>();
  const [notice, setNotice] = useState('');
  const active = useRef(true);
  const busy = useRef(false);
  const staging = useRef<string | undefined>(undefined);
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const available = Math.max(1, Math.min(contentWidth, window.width - insets.left - insets.right));
  const aspect = available / Math.max(1, window.height - insets.top - insets.bottom);
  const previewWidth = Math.min(Math.max(1, available - space.md * 2), aspect * Math.min(360, window.height * 0.43));

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      if (!busy.current && staging.current) deletePicture(staging.current);
    };
  }, []);

  function discard() {
    if (staging.current) deletePicture(staging.current);
    staging.current = undefined;
    setDraft(undefined);
  }

  async function choose() {
    if (busy.current) return;
    busy.current = true;
    setOperation('pick');
    setNotice('');
    try {
      const selected = await pickBackground();
      if (!selected) return;
      if (!active.current) { deletePicture(selected.uri); return; }
      discard();
      staging.current = selected.uri;
      setDraft(selected);
    } catch (failure) {
      if (active.current) setNotice(failure instanceof Error ? failure.message : '暂时无法读取这张照片。');
    } finally {
      busy.current = false;
      if (active.current) setOperation(undefined);
      else if (staging.current) deletePicture(staging.current);
    }
  }

  async function apply(scope: string | undefined, picture: LocalPicture | null | undefined, success: string) {
    if (busy.current) return;
    busy.current = true;
    setOperation('save');
    setNotice('');
    try {
      await store.save(scope, picture, voice);
      if (active.current) {
        discard();
        setNotice(success);
      }
    } catch {
      if (active.current) setNotice('暂时无法保存聊天背景。请重试。');
    } finally {
      busy.current = false;
      if (active.current) setOperation(undefined);
      else if (staging.current) deletePicture(staging.current);
    }
  }

  const picture = draft ?? store.resolve(peer, voice);
  const inherited = !!peer && !Object.hasOwn(store.value.peers, peer);
  const ready = nativeChatBackgrounds && (voice || !requestedPeer || !!friend) && !store.loading && !store.error;
  return <SafeAreaView style={local.screen}>
    <TopBar title={voice ? '语音通话背景' : '聊天背景'} back={() => {
      if (busy.current) return;
      if (router.canGoBack()) router.back();
      else router.replace('/me');
    }} />
    <ScrollView scrollEnabled={!dragging} contentContainerStyle={local.content}>
      {store.error ? <Notice action="重试" onAction={store.retry}>暂时无法读取聊天背景。</Notice>
        : store.loading ? <Text style={styles.muted}>正在读取聊天背景…</Text>
          : !ready ? <Notice>当前无法设置聊天背景。</Notice>
            : <>
              <Text style={styles.section}>{draft ? '预览' : voice ? '所有语音通话' : friend ? friend.name + '的聊天背景' : '所有聊天'}</Text>
              {!!notice && <Notice>{notice}</Notice>}
              <View style={local.previewStage}>
                <View style={[local.preview, voice && { backgroundColor: '#000000' }, { width: previewWidth, aspectRatio: aspect }]}>
                  {picture && <WallpaperImage picture={picture} style={StyleSheet.absoluteFill}
                    onDrag={setDragging} onPosition={draft && ((position) => setDraft((current) => current && { ...current, ...position }))} />}
                  {voice ? <View pointerEvents="none" style={local.voiceSample}><Icon name="person-circle-outline" size={36} color="#FFFFFF" /></View> : <View style={local.previewMessages} pointerEvents="none" accessible={false}
                    importantForAccessibility="no-hide-descendants" aria-hidden>
                    <Text style={[local.sample, local.received]}>在这里预览聊天效果</Text>
                    <Text style={[local.sample, local.sent]}>选一张喜欢的照片</Text>
                  </View>}
                </View>
              </View>
              {draft ? <>
                <Text style={styles.muted}>拖动照片调整取景</Text>
                {peer && <Button label="应用到当前聊天" disabled={!!operation} onPress={() => void apply(peer, draft, '已应用到当前聊天。')} />}
                {!currentOnly && <Button label={voice ? '应用到语音通话' : '应用到所有聊天'} variant={peer ? 'soft' : 'primary'} disabled={!!operation}
                  onPress={() => void apply(undefined, draft, voice ? '已应用到语音通话。' : '已更新全局聊天背景，单独设置优先。')} />}
                <Button label="取消预览" variant="quiet" disabled={!!operation} onPress={discard} />
              </> : <SettingGroup>
                <ListRow title={operation === 'pick' ? '正在读取照片…' : '从手机相册选择'}
                  left={<Icon name="image-outline" />} onPress={operation ? undefined : () => void choose()} />
                <ListRow title={voice ? '恢复纯黑背景' : '恢复默认背景'} left={<Icon name="refresh-outline" />}
                  onPress={operation ? undefined : () => void apply(peer, peer ? null : undefined, '已恢复默认背景。')}
                  separator={!!peer && !inherited} />
                {!!peer && !inherited && <ListRow title="跟随全局背景" left={<Icon name="layers-outline" />}
                  onPress={operation ? undefined : () => void apply(peer, undefined, '当前聊天已跟随全局背景。')} separator={false} />}
              </SettingGroup>}
              {!draft && !voice && !currentOnly && <ListRow title="语音通话背景" left={<Icon name="call-outline" />} onPress={() => router.push({ pathname: '/chat-background', params: { mode: 'voice' } })} />}
              {!draft && <Text style={styles.small}>{inherited ? '当前聊天跟随全局背景。' : '背景只保存在这台设备上。'}</Text>}
            </>}
    </ScrollView>
  </SafeAreaView>;
}

const local = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.panel },
  content: { width: '100%', maxWidth: contentWidth, alignSelf: 'center', padding: space.md, gap: space.sm, paddingBottom: space.xl },
  previewStage: { alignItems: 'center', paddingVertical: space.sm, backgroundColor: colors.backdrop, borderRadius: radius.surface },
  preview: { maxWidth: '100%', overflow: 'hidden', borderRadius: radius.control, backgroundColor: colors.panel },
  voiceSample: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', paddingBottom: 30 },
  previewMessages: { ...StyleSheet.absoluteFill, padding: space.sm, justifyContent: 'center', gap: space.xs },
  sample: { ...styles.small, color: colors.text, paddingHorizontal: space.xs, paddingVertical: space.xxs, borderRadius: radius.control },
  received: { backgroundColor: colors.chatReceived, alignSelf: 'flex-start' },
  sent: { backgroundColor: colors.lavender, alignSelf: 'flex-end' },
});
