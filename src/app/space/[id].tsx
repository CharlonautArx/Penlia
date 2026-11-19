import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar, Button, Empty, Icon, IconButton, ListRow, Notice, Screen, Section, Sheet } from '../../components/ui';
import { demoPortrait } from '../../demo/visuals';
import { Chips } from '../../features/play/Cards';
import { localId } from '../../features/local/document';
import { Choice } from '../../features/space/AudienceSheet';
import { EntryCard, JournalLink } from '../../features/space/EntryCard';
import { selectPhotos, SpacePhoto } from '../../features/space/media';
import { createdTime, type SpaceCard } from '../../features/space/model';
import { useSpace } from '../../features/space/store';
import { colors, styles } from '../../theme';

const tones = {
  mist: ['#F5D7E4', '#E5DDEE', '#C9EAE9'],
  dawn: ['#F9DAE2', '#FDEDE9', '#F1DFC7'],
  blue: ['#ECDDF6', '#E5E6F7', '#C7F0ED'],
} as const;
const albumThemes = ['全部', '日常', '旅行', '聚会', '其他'] as const;
const panes = [
  { key: 'thought', title: '动态' },
  { key: 'albums', title: '相册' },
  { key: 'journal', title: '日志' },
  { key: 'about', title: '关于' },
] as const;

export default function SpaceScreen() {
  const { id, viewer, pane } = useLocalSearchParams<{ id: string; viewer?: string; pane?: string }>();
  const state = useSpace();
  const person = state.person(id);
  const mine = state.owns(id) && !viewer;
  const visible = state.spaceVisible(id, viewer);
  const card = state.card(id);
  const current = panes.find((item) => item.key === pane)?.key ?? 'thought';
  const [albumTheme, setAlbumTheme] = useState<typeof albumThemes[number]>('全部');
  const [panel, setPanel] = useState<'cover' | 'album' | 'guest'>();
  const entries = state.value?.entries.filter((post) => post.ownerId === id && post.kind === current
    && state.entryVisible(post, viewer)).sort((a, b) => b.at - a.at) ?? [];
  const albums = state.value?.albums.filter((album) => album.ownerId === id && state.albumVisible(album, viewer)
    && (albumTheme === '全部' || album.theme === albumTheme)) ?? [];

  return <Screen title="个人空间" back={() => router.canGoBack() ? router.back() : router.replace('/moments')}
    actions={mine && visible && <>
      <IconButton label="编辑空间" icon="color-palette-outline" onPress={() => setPanel('cover')} />
      <IconButton label="空间隐私" icon="shield-checkmark-outline" tinted onPress={() => router.push('/space/privacy')} />
    </>}>
    {viewer && visible && <Notice>{'好友视角预览 · ' + (state.person(viewer)?.name ?? '好友') + ' 能看到的内容'}</Notice>}
    {!state.loading && !!state.error && <Notice action="重试" onAction={state.retry}>{state.error}</Notice>}
    {state.loading || !visible || !person || !state.value ? <Empty busy={state.loading} icon="lock-closed-outline">
      {state.loading ? '正在读取空间…' : visible ? '暂时无法读取此空间。' : '这个空间当前不可访问。'}
    </Empty> : <>
      <View style={local.profile}>
        <LinearGradient colors={tones[card.cover.tone]} style={local.cover}>
          {card.cover.photo && <>
            <SpacePhoto photo={card.cover.photo} style={local.coverImage} label="空间封面" />
            <LinearGradient colors={['#23192700', '#23192799']} style={local.coverShade} />
          </>}
          <Text style={[local.coverStatus, card.cover.photo && local.onPhoto]}>{card.status || '留给朋友的生活片段'}</Text>
        </LinearGradient>
        <View style={local.profileBody}>
          <View style={local.profileRow}>
            <View style={local.avatar}>
              <Avatar name={person.name} source={demoPortrait((state.owns(id) && state.demoAvatarKey) || person.username)} size={64} />
            </View>
            <View style={styles.grow}>
              <Text style={local.name}>{person.name}</Text>
              <Text style={styles.small}>朋聊号 @{person.username}{card.region ? ' · ' + card.region : ''}</Text>
            </View>
            {!mine && !viewer && <IconButton label="给 TA 留言" icon="chatbox-ellipses-outline"
              disabled={!state.canInteract(id)} tinted onPress={() => setPanel('guest')} />}
          </View>
          <Text style={styles.body}>{person.bio || '还没有个性签名'}</Text>
        </View>
      </View>
      <View style={local.nav}>
        {panes.map(({ title, key }) => <Pressable key={key} accessibilityRole="button" accessibilityLabel={title}
          accessibilityState={{ selected: current === key }} onPress={() => router.setParams({ pane: key })}
          style={({ pressed }) => [local.tab, current === key && local.selected, pressed && local.pressed]}>
          <Text style={current === key ? local.selectedText : styles.muted}>{title}</Text>
        </Pressable>)}
      </View>
      {(current === 'thought' || current === 'journal') && <>
        <Section title={current === 'journal' ? '空间日志' : '最近动态'} detail={entries.length + ' 条'}>
          {mine && <Button label={current === 'journal' ? '写日志' : '发布动态'} icon="add-outline" variant="soft"
            onPress={() => router.push({ pathname: '/space/compose', params: { kind: current } })} />}
        </Section>
        {entries.map((entry) => current === 'journal'
          ? <JournalLink key={entry.id} entry={entry} viewer={viewer} />
          : <View key={entry.id} style={local.post}><EntryCard entry={entry} viewer={viewer} /></View>)}
        {!entries.length && <Empty icon={current === 'journal' ? 'book-outline' : 'chatbox-ellipses-outline'}>
          {current === 'journal' ? '还没有可见的日志。' : '还没有可见的动态。'}
        </Empty>}
      </>}
      {current === 'albums' && <>
        <Section title="主题相册" detail={albums.length + ' 本'}>
          {mine && <Button label="新建相册" icon="add-outline" variant="soft" onPress={() => setPanel('album')} />}
        </Section>
        <Chips items={albumThemes} value={albumTheme} onChange={setAlbumTheme} />
        {albums.length ? <View style={local.grid}>
          {albums.map((album) => <Pressable key={album.id} accessibilityRole="button" accessibilityLabel={album.title}
            style={({ pressed }) => [local.album, pressed && local.pressed]}
            onPress={() => router.push({ pathname: '/space/album/[id]', params: { id: album.id, ...(viewer ? { viewer } : {}) } })}>
            <View style={local.albumCover}><SpacePhoto photo={album.photos[album.cover]} style={local.albumPhoto}
              label={album.title + '封面'} /></View>
            <View style={local.albumText}>
              <Text style={styles.strong} numberOfLines={1}>{album.title}</Text>
              <Text style={styles.small}>{album.theme} · {album.photos.length} 张</Text>
            </View>
          </Pressable>)}
        </View> : <Empty icon="images-outline">还没有可见的相册。</Empty>}
      </>}
      {current === 'about' && <>
        <View style={local.group}>
          <ListRow title="朋聊号" detail={'@' + person.username} left={<Icon name="at-outline" />} />
          <ListRow title="个性签名" detail={person.bio || '还没有个性签名'} left={<Icon name="chatbox-outline" />} />
          {!!card.region && <ListRow title="地区" detail={card.region} left={<Icon name="location-outline" />} />}
          {!!card.status && <ListRow title="近况" detail={card.status} left={<Icon name="happy-outline" />} />}
        </View>
        <Section title="空间留言" detail={card.privacy.revealReplies === 'viewers' || mine ? card.guestbook.length + ' 条' : undefined}>
          {!mine && !viewer && <Button label="留一句话" variant="soft" disabled={!state.canInteract(id)} onPress={() => setPanel('guest')} />}
        </Section>
        {(!mine && card.privacy.revealReplies === 'author') ? <Empty icon="lock-closed-outline">留言仅空间主人可见。</Empty>
          : card.guestbook.length ? <View style={local.group}>
            {[...card.guestbook].reverse().map((reply) => <ListRow key={reply.id}
              title={(state.person(reply.authorId)?.name ?? '好友') + ' · ' + createdTime(reply.at)}
              detail={reply.text} left={<Icon name="chatbubble-outline" color={colors.accent} />} />)}
          </View> : <Empty icon="chatbubble-outline">还没有留言。</Empty>}
      </>}
    </>}
    {panel === 'cover' && mine && <CoverEditor initial={card} onClose={() => setPanel(undefined)} />}
    {panel === 'album' && mine && <NewAlbum onClose={() => setPanel(undefined)} />}
    {panel === 'guest' && visible && !viewer && <GuestNote id={id} onClose={() => setPanel(undefined)} />}
  </Screen>;
}

function CoverEditor({ initial, onClose }: { initial: SpaceCard; onClose: () => void }) {
  const state = useSpace();
  const [cover, setCover] = useState(initial.cover);
  const [region, setRegion] = useState(initial.region);
  const [status, setStatus] = useState(initial.status);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function pick() {
    if (!state.me || busy) return;
    setError(''); setBusy(true);
    try {
      const [photo] = await selectPhotos(state.me.id, 1);
      if (photo) setCover({ ...cover, photo });
    } catch { setError('暂时无法读取这张照片。'); }
    finally { setBusy(false); }
  }

  return <Sheet title="编辑空间" onClose={onClose}>
    <Text style={styles.strong}>空间封面</Text>
    {([['mist', '粉蓝柔雾'], ['dawn', '暖调晨光'], ['blue', '蓝调傍晚']] as const).map(([tone, label]) =>
      <Choice key={tone} label={label} picked={!cover.photo && cover.tone === tone} onPress={() => setCover({ tone })}
        left={<LinearGradient colors={tones[tone]} style={local.swatch} />} />)}
    <Button label={busy ? '正在读取…' : cover.photo ? '更换自定义封面' : '选择自定义封面'}
      icon="image-outline" variant="soft" disabled={busy} onPress={() => void pick()} />
    <TextInput accessibilityLabel="空间地区" value={region} onChangeText={setRegion} style={styles.input}
      placeholder="地区（选填）" placeholderTextColor={colors.quiet} maxLength={24} />
    <TextInput accessibilityLabel="空间近况" value={status} onChangeText={setStatus} style={styles.input}
      placeholder="近况（选填）" placeholderTextColor={colors.quiet} maxLength={28} />
    {!!error && <Notice>{error}</Notice>}
    <Button label="保存空间" variant="gradient" disabled={busy} onPress={() => {
      state.update((previous) => ({ ...previous, space: { ...previous.space, cover, region: region.trim(), status: status.trim() } }));
      onClose();
    }} />
  </Sheet>;
}

function NewAlbum({ onClose }: { onClose: () => void }) {
  const state = useSpace();
  const [name, setName] = useState('');
  const [theme, setTheme] = useState('日常');
  return <Sheet title="新建相册" onClose={onClose}>
    <TextInput accessibilityLabel="相册名称" value={name} onChangeText={setName} style={styles.input}
      placeholder="给这些照片起个名字" placeholderTextColor={colors.quiet} maxLength={26} />
    <View style={[styles.row, local.wrap]}>
      {albumThemes.slice(1).map((item) => <Button key={item} label={item}
        variant={item === theme ? 'primary' : 'soft'} onPress={() => setTheme(item)} />)}
    </View>
    <Button label="创建" disabled={!name.trim()} variant="gradient" onPress={() => {
      if (!state.me) return;
      const id = localId();
      const album = { id, ownerId: state.me.id, title: name.trim(), theme, cover: 0, photos: [], at: Date.now() };
      state.update((previous) => ({ ...previous, albums: [album, ...previous.albums] }));
      onClose();
      router.push({ pathname: '/space/album/[id]', params: { id } });
    }} />
  </Sheet>;
}

function GuestNote({ id, onClose }: { id: string; onClose: () => void }) {
  const state = useSpace();
  const [text, setText] = useState('');
  return <Sheet title="留一句话" onClose={onClose}>
    <Text style={styles.muted}>这条留言在本机保存。</Text>
    <TextInput accessibilityLabel="留言内容" style={styles.input} value={text} onChangeText={setText}
      placeholder="写下想和 TA 说的话" placeholderTextColor={colors.quiet} maxLength={180} />
    <Button label="留下留言" variant="gradient" disabled={!text.trim() || !state.canInteract(id)}
      onPress={() => { state.note(id, text); onClose(); router.setParams({ pane: 'about' }); }} />
  </Sheet>;
}

const local = StyleSheet.create({
  profile: { borderRadius: 15, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  cover: { height: 153, justifyContent: 'flex-end' },
  coverImage: { position: 'absolute', width: '100%', height: '100%' },
  coverShade: { position: 'absolute', width: '100%', height: 66, bottom: 0 },
  coverStatus: { fontSize: 13, color: colors.ink, fontWeight: '700', marginBottom: 10, marginLeft: 13 },
  onPhoto: { color: '#FFFFFF' },
  profileBody: { paddingHorizontal: 12, paddingTop: 11, paddingBottom: 13, gap: 6 },
  profileRow: { ...styles.row, gap: 10 },
  avatar: { borderWidth: 2, borderColor: colors.panel, borderRadius: 22 },
  name: { fontSize: 24, lineHeight: 32, color: colors.text, fontWeight: '800' },
  nav: { flexDirection: 'row', gap: 5, padding: 4, borderRadius: 12, backgroundColor: '#EEEFF3' },
  tab: { flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 43, borderRadius: 9 },
  selected: { backgroundColor: colors.panel },
  selectedText: { ...styles.strong, color: colors.accent },
  pressed: { opacity: 0.68 },
  post: { overflow: 'hidden', borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  group: { borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', backgroundColor: colors.panel },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  album: { width: '48%', borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.panel },
  albumCover: { height: 124 },
  albumPhoto: { width: '100%', height: '100%' },
  albumText: { padding: 9, gap: 2 },
  swatch: { width: 36, height: 29, borderRadius: 8 },
  wrap: { flexWrap: 'wrap', gap: 7 },
});
