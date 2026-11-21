import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button, Empty, IconButton, Notice, Screen, Section } from '../../components/ui';
import { SpaceCollections, type AlbumTheme } from '../../features/space/Collections';
import { EntryCard } from '../../features/space/EntryCard';
import { SpaceHeader, type SpacePane } from '../../features/space/SpaceHeader';
import { CoverEditor } from '../../features/space/CoverEditor';
import { useSpace } from '../../features/space/store';
import { styles } from '../../theme';

export default function SpaceScreen() {
  const { id, viewer, pane, archive } = useLocalSearchParams<{ id: string; viewer?: string; pane?: string; archive?: string }>();
  const state = useSpace();
  const person = state.person(id);
  const mine = state.owns(id) && !viewer;
  const visible = state.spaceVisible(id, viewer);
  const card = state.card(id);
  const [current, setPane] = useState<SpacePane>(pane === 'journal' || pane === 'albums' ? pane : 'thought');
  const [albumTheme, setAlbumTheme] = useState<AlbumTheme>('全部');
  const [cover, setCover] = useState(false);
  const entries = current === 'thought' ? state.value?.entries.filter((post) => post.ownerId === id
    && post.kind === 'thought' && state.entryVisible(post, viewer)).sort((a, b) => b.at - a.at) ?? [] : [];

  if (mine && !archive && (pane === 'journal' || pane === 'albums')) {
    return <Redirect href={{ pathname: '/moments', params: { pane } }} />;
  }
  return <Screen title={current === 'albums' ? '相册' : current === 'journal' ? '日志' : '本机空间'} back={() => router.canGoBack() ? router.back() : router.replace('/moments')}
    actions={mine && visible && <>
      <IconButton label="空间隐私" icon="shield-checkmark-outline" tinted onPress={() => router.push('/space/privacy')} />
    </>}>
    {mine && <Text style={styles.small}>仅保存在此设备</Text>}
    {viewer && visible && <Notice>{'好友视角预览 · ' + (state.person(viewer)?.name ?? '好友') + ' 能看到的内容'}</Notice>}
    {!state.loading && !!state.error && <Notice action="重试" onAction={state.retry}>{state.error}</Notice>}
    {state.loading || !visible || !person || !state.value ? <Empty busy={state.loading} icon="lock-closed-outline">
      {state.loading ? '正在读取空间…' : visible ? '暂时无法读取此空间。' : '这个空间当前不可访问。'}
    </Empty> : <>
      <SpaceHeader person={person} card={card} avatarKey={mine ? state.demoAvatarKey : undefined}
        pane={current} onPane={setPane} onCover={mine ? () => setCover(true) : undefined} />
      {current === 'thought' ? <>
        <Section title="最近动态" detail={entries.length + ' 条'}>
          {mine && <Button label="发布动态" icon="add-outline" variant="soft"
            onPress={() => router.push({ pathname: '/space/compose', params: { kind: 'thought' } })} />}
        </Section>
        {entries.map((entry) => <View key={entry.id} style={{ overflow: 'hidden', borderRadius: 14 }}>
          <EntryCard entry={entry} viewer={viewer} />
        </View>)}
        {!entries.length && <Empty icon="chatbox-ellipses-outline">还没有可见的动态。</Empty>}
      </> : <SpaceCollections owner={id} viewer={viewer} pane={current} theme={albumTheme} onTheme={setAlbumTheme} />}
    </>}
    {cover && mine && <CoverEditor initial={card} onClose={() => setCover(false)} />}
  </Screen>;
}
