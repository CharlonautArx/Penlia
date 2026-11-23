import { formatHandle } from '../../services/handle';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar, Button, Empty, Icon, IconButton, ListRow, Notice, Screen, Sheet } from '../../components/ui';
import { isUiDemo } from '../../demo/mode';
import { demoPortrait } from '../../demo/visuals';
import { localId } from '../../features/local/document';
import { AudienceSheet } from '../../features/space/AudienceSheet';
import { selectPhotos, SpacePhoto } from '../../features/space/media';
import { audienceName, blankDraft, copyDraft, selectableAudience, type Entry, type EntryDraft, type Photo } from '../../features/space/model';
import { useSpace } from '../../features/space/store';
import { colors, styles, type } from '../../theme';

export default function ComposeScreen() {
  const { kind, edit } = useLocalSearchParams<{ kind?: string; edit?: string }>();
  const state = useSpace();
  const type = kind === 'journal' ? 'journal' : 'thought';
  const ownEntry = state.value?.entries.find((entry) => entry.id === edit && state.owns(entry.ownerId));
  if (state.loading || !state.value || !state.me || (edit && !ownEntry)) return <Screen title="发布" back={goBack}>
    <Empty busy={state.loading}>{state.error || (edit && !state.loading ? '找不到可编辑的内容。' : '正在读取草稿…')}</Empty>
  </Screen>;
  return <Editor key={edit ?? type} entry={ownEntry} initial={ownEntry ? copyDraft(ownEntry) : state.value.drafts[type] ?? blankDraft(type)}
    restored={!edit && !!state.value.drafts[type]} />;
}

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/moments');
}

function Editor({ initial, entry, restored }: { initial: EntryDraft; entry?: Entry; restored: boolean }) {
  const state = useSpace();
  const [draft, setDraft] = useState(initial);
  const [panel, setPanel] = useState<'audience' | 'mention' | 'location' | 'emoji' | 'media' | 'exit'>();
  const [location, setLocation] = useState(draft.location);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const journal = draft.kind === 'journal';
  const limit = journal ? 12000 : 500;
  const ready = (draft.text.trim().length > 0 || (!journal && draft.photos.length > 0)) && (!journal || draft.title.trim().length > 0);
  const partial = !!(draft.title || draft.text || draft.photos.length || draft.location || draft.videoPreview || draft.sourceId
    || draft.audience.mode !== 'friends');
  const title = entry ? '编辑' + (journal ? '日志' : '动态') : journal ? '写日志' : '发布动态';

  function persistDraft() {
    if (!partial) return;
    const { kind } = draft;
    state.update((data) => ({ ...data, drafts: { ...data.drafts, [kind]: draft } }));
    goBack();
  }

  function publish() {
    if (!ready || busy || !state.me) return;
    const ownerId = state.me.id;
    const audience = selectableAudience(draft.audience, state.friends.map(({ userId }) => userId));
    if ((audience.mode === 'allow' || audience.mode === 'deny') && !audience.ids.length) {
      setError('请重新确认指定的好友。');
      return;
    }
    const kept = state.friends.filter(({ userId, username }) =>
      draft.mentions.includes(userId) && draft.text.split(/[^a-zA-Z0-9_@]+/).includes('@' + username)).map(({ userId }) => userId);
    const cleaned = { ...draft, title: draft.title.trim(), text: draft.text.trim(), mentions: kept, audience };
    state.update((data) => {
      if (entry) return { ...data, entries: data.entries.map((item) => item.id === entry.id && item.ownerId === ownerId
        ? { ...item, ...cleaned, editedAt: Date.now() } : item) };
      return {
        ...data, drafts: { ...data.drafts, [draft.kind]: undefined },
        entries: [{ ...cleaned, id: localId(), ownerId, at: Date.now(), likes: 0, liked: false, comments: [] }, ...data.entries],
      };
    });
    goBack();
  }

  function attach(photos: Photo[]) {
    const after = draft.text.split(/\n\s*\n/).length - 1;
    setDraft((current) => ({
      ...current, photos: [...current.photos, ...photos.map((photo) => journal ? { ...photo, after } : photo)].slice(0, 6),
    }));
    setPanel(undefined);
  }

  async function library() {
    if (!state.me || busy) return;
    setError('');
    setBusy(true);
    try { attach(await selectPhotos(state.me.id, 6 - draft.photos.length)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : '暂时无法读取照片。'); setPanel(undefined); }
    finally { setBusy(false); }
  }

  function back() {
    if (draft !== initial && (entry || partial)) setPanel('exit');
    else goBack();
  }

  return <Screen title={title} back={back} actions={<Button label={entry ? '保存' : '发布'} disabled={!ready || busy}
    variant="gradient" onPress={publish} />}>
    {restored && <Text style={local.saved}>已恢复本机草稿</Text>}
    {!!(error || state.error) && <Notice>{error || state.error}</Notice>}
    <View style={local.paper}>
      {journal && <TextInput accessibilityLabel="日志标题" placeholder="给这段日子起个标题" maxLength={80}
        placeholderTextColor={colors.quiet} value={draft.title} onChangeText={(title) => setDraft({ ...draft, title })}
        style={local.title} />}
      <TextInput accessibilityLabel={journal ? '日志正文' : '动态内容'}
        placeholder={journal ? '写下想留住的生活片段…' : '此刻有什么想和朋友说？'}
        placeholderTextColor={colors.quiet} value={draft.text} multiline maxLength={limit}
        onChangeText={(text) => setDraft({ ...draft, text })} style={[local.body, journal && local.article]} />
      <Text style={local.count}>{draft.text.length} / {limit}</Text>
      <View style={local.attachments}>
        {draft.photos.map((photo, index) => <View key={photo.id + index} style={local.photoFrame}>
          <SpacePhoto photo={photo} style={local.photo} />
          <View style={local.remove}>
            <IconButton label={'移除照片 ' + (index + 1)} icon="close-circle" onPress={() =>
              setDraft({ ...draft, photos: draft.photos.filter((_, item) => item !== index) })} />
          </View>
        </View>)}
        {draft.photos.length < 6 && <View style={local.add}><IconButton label="添加图片" icon="add-outline" onPress={() => {
          if (isUiDemo) setPanel('media');
          else void library();
        }} /></View>}
      </View>
      {draft.videoPreview && <ListRow title="视频动态样式" detail="样式预览" left={<Icon name="videocam-outline" />}
        trailing={<IconButton label="移除视频样式" icon="close-circle-outline" onPress={() => setDraft({ ...draft, videoPreview: false })} />} />}
      <View style={local.tools}>
        <IconButton label="选表情" icon="happy-outline" onPress={() => setPanel('emoji')} />
        <IconButton label="@好友" icon="at-outline" onPress={() => setPanel('mention')} />
        {isUiDemo && !journal && <IconButton label="预览视频样式" icon="videocam-outline"
          onPress={() => setDraft({ ...draft, videoPreview: !draft.videoPreview })} />}
      </View>
    </View>
    <View style={local.paper}>
      <ListRow title="标注地点" detail={draft.location || '手动填写'} left={<Icon name="location-outline" />}
        onPress={() => { setLocation(draft.location); setPanel('location'); }} />
      <ListRow title="可见范围" detail={audienceName(draft.audience)} left={<Icon name="lock-closed-outline" />}
        onPress={() => setPanel('audience')} />
    </View>
    {!entry && <Button label="存为草稿" variant="soft" icon="document-text-outline" onPress={persistDraft} disabled={!partial || busy} />}
    <Text style={styles.small}>内容和可见设置保存在此设备。</Text>
    {panel === 'audience' && <AudienceSheet initial={draft.audience} friends={state.friends}
      onSave={(audience) => { setDraft({ ...draft, audience }); setPanel(undefined); }} onClose={() => setPanel(undefined)} />}
    {panel === 'location' && <Sheet title="标注地点" onClose={() => setPanel(undefined)}>
      <Text style={styles.muted}>手动填写地点，无需定位权限。留空可清除标注。</Text>
      <TextInput accessibilityLabel="地点名称" placeholder="例如 上海 · 长乐路" maxLength={42} value={location}
        onChangeText={setLocation} style={styles.input} />
      <Button label="完成" variant="gradient" onPress={() => { setDraft({ ...draft, location: location.trim() }); setPanel(undefined); }} />
    </Sheet>}
    {panel === 'mention' && <Sheet title="@好友" onClose={() => setPanel(undefined)}>
      {state.friends.map((friend) => <ListRow key={friend.userId} title={friend.name} detail={formatHandle(friend.username)}
        left={<Avatar name={friend.name} source={demoPortrait(friend.username)} size={34} />}
        onPress={() => {
          const next = draft.text.trimEnd() + (draft.text.length ? ' ' : '') + '@' + friend.username + ' ';
          if (next.length <= limit) setDraft({ ...draft, text: next, mentions: [...new Set([...draft.mentions, friend.userId])] });
          setPanel(undefined);
        }} />)}
      {!state.friends.length && <Text style={styles.muted}>暂无可以提到的好友。</Text>}
    </Sheet>}
    {panel === 'emoji' && <Sheet title="选表情" onClose={() => setPanel(undefined)}>
      <View style={local.tools}>{['😊', '✨', '☕', '🙌', '📷', '🌿'].map((emoji) =>
        <Button key={emoji} label={emoji} variant="soft" onPress={() => {
          if (draft.text.length + emoji.length <= limit) setDraft({ ...draft, text: draft.text + emoji });
          setPanel(undefined);
        }} />)}</View>
    </Sheet>}
    {panel === 'media' && <Sheet title="添加图片" onClose={() => setPanel(undefined)}>
      <Button label={busy ? '正在读取…' : '从设备选择图片'} disabled={busy} variant="soft" onPress={() => void library()} />
      <Button label="使用一张示例照片" variant="quiet" onPress={() => attach([{ type: 'sample', id: 'coffee' }])} />
    </Sheet>}
    {panel === 'exit' && <Sheet title="离开编辑" onClose={() => setPanel(undefined)}>
      <Text style={styles.muted}>{entry ? '这次编辑还没有保存。' : '可以先存为本机草稿，下次继续写。'}</Text>
      {!entry && <Button label="存为草稿" variant="gradient" onPress={persistDraft} />}
      <Button label="放弃本次修改" variant="danger" onPress={goBack} />
    </Sheet>}
  </Screen>;
}

const local = StyleSheet.create({
  paper: { backgroundColor: colors.panel, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  saved: { ...styles.small, color: colors.accent },
  title: { ...styles.body, ...styles.divider, ...type.hero, padding: 14, minHeight: 55 },
  body: { ...styles.body, minHeight: 120, paddingHorizontal: 14, paddingTop: 13, textAlignVertical: 'top' },
  article: { minHeight: 248, lineHeight: 26 },
  count: { ...styles.small, textAlign: 'right', paddingHorizontal: 13, paddingVertical: 7 },
  attachments: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, paddingBottom: 9, alignItems: 'center' },
  add: { width: 66, height: 62, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backdrop },
  photoFrame: { width: 83, height: 70 },
  photo: { width: '100%', height: '100%', borderRadius: 8 },
  remove: { position: 'absolute', right: -9, top: -9 },
  tools: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 7, gap: 3 },
});
