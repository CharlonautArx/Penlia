import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Empty, Icon, IconButton, ListRow, Notice, Screen, Sheet } from '../components/ui';
import { scopes, type Audience, type Moment } from '../features/moments/Feed';
import {
  chooseMomentPhotos,
  chooseMomentDraftVideo,
  MomentVideo,
  removeMomentDraftMedia,
  DraftMediaTile,
  encodeMomentMedia,
  type LocalMedia,
  type Media,
} from '../features/moments/media';
import { emptyMomentDraft, useMomentDraft, type MomentDraft } from '../features/moments/draft';
import { momentPhotoLimit } from '../features/moments/photo-grid';
import { useLocalPhotoUri } from '../features/space/media';
import { AudienceFriends } from '../features/moments/AudienceFriends';
import type { RelationGroup, Settings } from '../features/privacy/types';
import { errorMessage } from '../services/api';
import { useFriends } from '../services/friends';
import { useSession } from '../services/session';
import { colors, radius, space, styles } from '../theme';

export default function PrivateMoment() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { request, session } = useSession();
  const { relationships, refresh } = useFriends();
  const [previous, setPrevious] = useState<Moment>();
  const draft = useMomentDraft();
  const [editing, setEditing] = useState<MomentDraft>(emptyMomentDraft);
  const [defaultScope, setDefaultScope] = useState<Audience>('private');
  const [groups, setGroups] = useState<RelationGroup[]>([]);
  const [showAudience, setShowAudience] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [preview, setPreview] = useState<LocalMedia>();
  const form = id ? editing : draft.value ?? emptyMomentDraft(defaultScope);
  const { body, location, scope, groupId, memberIds, assets } = form;
  function change(next: Partial<MomentDraft> | ((current: MomentDraft) => MomentDraft)) {
    const apply = (current: MomentDraft) => typeof next === 'function' ? next(current) : { ...current, ...next };
    if (id) setEditing(apply);
    else draft.update((current) => apply(current ?? emptyMomentDraft(defaultScope)));
  }
  const [confirmed, setConfirmed] = useState(false);
  const [deletePrompt, setDeletePrompt] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const uploaded = useRef(new Map<string, string>());
  const guard = useRef(false);
  const me = session?.user.id;

  useEffect(() => {
    if (!me) return;
    let active = true;
    void refresh();
    void Promise.all([
      request<{ settings: Settings }>('/privacy'),
      request<{ groups: RelationGroup[] }>('/relationship-groups'),
      id ? request<{ moment: Moment }>('/moments/' + id) : Promise.resolve(undefined),
    ])
      .then(([prefs, result, entry]) => {
        if (!active) return;
        if (entry && entry.moment.authorId !== me) throw new Error('只有发布者能修改这条动态。');
        setGroups(result.groups);
        setDefaultScope(prefs.settings.momentScope);
        if (entry) {
          const moment = entry.moment;
          setPrevious(moment);
          setEditing({ ...emptyMomentDraft(moment.scope ?? prefs.settings.momentScope),
            body: moment.body, location: moment.location ?? '', groupId: moment.groupId ?? '', memberIds: moment.memberIds ?? [] });
        }
        setLoaded(true);
      })
      .catch((failure) => {
        if (active) { setError(errorMessage(failure)); if (!id) setLoaded(true); }
      });
    return () => {
      active = false;
    };
  }, [id, me, request, refresh]);

  async function run(task: () => Promise<void>) {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      guard.current = false;
      setBusy(false);
      setProgress('');
    }
  }

  async function save() {
    if (!loaded || !me) return;
    if (!confirmed) {
      setShowAudience(true);
      return;
    }
    const audience = { scope, groupId: groupId || null, memberIds };
    if (previous) {
      await request('/moments/' + previous.id, {
        method: 'PATCH',
        body: { ...audience, body, location, revision: previous.revision },
      });
    } else {
      const signature = JSON.stringify([body, location, scope, groupId, memberIds, assets.map(({ id }) => id)]);
      const attempt = form.attempt?.signature === signature ? form.attempt : { id: randomUUID(), signature };
      await draft.save(() => ({ ...form, attempt }));
      const mediaIds: string[] = [];
      for (let index = 0; index < assets.length; index++) {
        const item = assets[index];
        setProgress('正在上传 ' + (index + 1) + ' / ' + assets.length);
        const { media } = await request<{ media: Media }>('/moment-media', {
          method: 'POST', body: await encodeMomentMedia(item),
        });
        uploaded.current.set(item.id, media.id);
        mediaIds.push(media.id);
      }
      setProgress('正在发布…');
      await request('/moments', { method: 'POST', body: { ...audience, body, location, clientId: attempt.id, mediaIds } });
      await draft.save(() => null);
      void Promise.allSettled(assets.map(removeMomentDraftMedia));
    }
    if (router.canGoBack()) router.back();
    else router.replace('/moments');
  }
  const audienceName =
    scope === 'group'
      ? (groups.find((group) => group.id === groupId)?.label ?? scopes.group)
      : scope === 'selected' && memberIds.length
        ? '指定好友 · ' + memberIds.length + ' 位'
        : scopes[scope];
  const hasVideo = assets.some((asset) => asset.mime === 'video/mp4');

  function move(index: number, offset: -1 | 1) {
    change((current) => {
      const next = index + offset;
      if (next < 0 || next >= current.assets.length) return current;
      const media = [...current.assets];
      [media[index], media[next]] = [media[next], media[index]];
      return { ...current, assets: media };
    });
  }

  function removeAsset(item: LocalMedia) {
    void run(async () => {
      await draft.save((current) => current && ({ ...current, assets: current.assets.filter((value) => value.id !== item.id) }));
      const saved = uploaded.current.get(item.id);
      uploaded.current.delete(item.id);
      await Promise.allSettled([removeMomentDraftMedia(item),
        ...(saved ? [request('/moment-media/' + saved, { method: 'DELETE' })] : [])]);
    });
  }

  return (
    <Screen
      title={previous ? '编辑动态' : '发布动态'}
      back={() => {
        if (!busy) {
          if (router.canGoBack()) router.back();
          else router.replace('/moments');
        }
      }}
    >
      {(error || draft.error) && <Notice action={draft.error ? '重试读取草稿' : undefined} onAction={draft.retry}>{error || draft.error}</Notice>}
      {(!loaded || (!id && draft.loading)) && !error && <Empty busy>正在读取动态草稿…</Empty>}
      {loaded && (id || draft.value !== undefined) && (
        <>
          <TextInput
            accessibilityLabel="动态正文"
            placeholder="写点什么，或直接分享一张照片"
            placeholderTextColor={colors.quiet}
            multiline
            textAlignVertical="top"
            value={body}
            editable={!busy}
            onChangeText={(body) => change({ body })}
            maxLength={2000}
            style={local.writing}
          />
          {previous ? (
            <Text style={styles.muted}>这条动态有 {previous.media.length} 个原有附件。</Text>
          ) : (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {assets.map((item, index) => (
                  <View key={item.id} style={[styles.card, { padding: 7 }]}>
                    <Pressable accessibilityRole="button" accessibilityLabel={'预览附件 ' + (index + 1)} onPress={() => setPreview(item)}>
                      <DraftMediaTile item={item} />
                    </Pressable>
                    {assets.length > 1 && <View style={local.sort}>
                      <IconButton label={'前移第 ' + (index + 1) + ' 张'} icon="arrow-back-outline"
                        disabled={busy || index === 0} onPress={() => move(index, -1)} />
                      <IconButton label={'后移第 ' + (index + 1) + ' 张'} icon="arrow-forward-outline"
                        disabled={busy || index === assets.length - 1} onPress={() => move(index, 1)} />
                    </View>}
                    <IconButton
                      label={'移除附件 ' + (index + 1)}
                      icon="close-outline"
                      disabled={busy}
                      onPress={() => removeAsset(item)}
                    />
                  </View>
                ))}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Button
                  label="选择照片"
                  variant="soft"
                  icon="images-outline"
                  disabled={busy || hasVideo || assets.length >= momentPhotoLimit}
                  onPress={() =>
                    void run(async () => {
                      const chosen = await chooseMomentPhotos(me! + '-draft', momentPhotoLimit - assets.length, true);
                      if (chosen.length) change((current) => ({ ...current, assets: [...current.assets, ...chosen] }));
                    })
                  }
                />
                <Button
                  label="选择短视频"
                  variant="soft"
                  icon="film-outline"
                  disabled={busy || assets.length > 0}
                  onPress={() =>
                    void run(async () => {
                      const item = await chooseMomentDraftVideo(me! + '-draft');
                      if (item) change({ assets: [item] });
                    })
                  }
                />
              </View>
              <Text style={styles.small}>最多 20 张照片，或一段 4 MB、30 秒以内的 MP4。</Text>
            </>
          )}
          <View style={local.location}>
            <Icon name="location-outline" color={colors.quiet} size={19} />
            <TextInput accessibilityLabel="标注地点" placeholder="标注地点" placeholderTextColor={colors.quiet}
              value={location} editable={!busy} maxLength={100} onChangeText={(location) => change({ location })}
              style={[styles.input, styles.grow]} />
          </View>
          <View style={local.audience}>
            <ListRow
              title={'可见范围 · ' + audienceName}
              detail={confirmed ? '已确认' : '发布前请确认谁能看到'}
              left={<Icon name="lock-closed-outline" color={colors.accent} />} separator={false}
              onPress={() => setShowAudience(true)}
            />
          </View>
          <Button
            label={progress || (previous ? '保存修改' : '发布动态')}
            variant="gradient"
            disabled={busy || (!body.trim() && !assets.length && !previous?.media.length)}
            onPress={() => void run(save)}
          />
          {!id && !!draft.value && <Button label="清除草稿" variant="quiet" disabled={busy} onPress={() => setConfirmClear(true)} />}
          {previous && (
            <Button
              label={deletePrompt ? '确认删除动态' : '删除动态'}
              variant="danger"
              disabled={busy}
              onPress={() => {
                if (!deletePrompt) {
                  setDeletePrompt(true);
                  return;
                }
                void run(async () => {
                  await request('/moments/' + previous.id, { method: 'DELETE' });
                  if (router.canGoBack()) router.back();
                  else router.replace('/moments');
                });
              }}
            />
          )}
        </>
      )}
      {preview && <Sheet title="预览附件" onClose={() => setPreview(undefined)}>
        <DraftPreview item={preview} />
      </Sheet>}
      {confirmClear && <Sheet title="清除动态草稿" onClose={() => { if (!busy) setConfirmClear(false); }}>
        <Text style={styles.muted}>清除已保存的文字、附件和可见范围。</Text>
        <Button label="确认清除草稿" variant="danger" disabled={busy} onPress={() => void run(async () => {
          await draft.save(() => null);
          setShowAudience(false);
          setConfirmed(false);
          setConfirmClear(false);
          const remote = [...uploaded.current.values()];
          uploaded.current.clear();
          await Promise.allSettled([...assets.map(removeMomentDraftMedia),
            ...remote.map((id) => request('/moment-media/' + id, { method: 'DELETE' }))]);
        })} />
      </Sheet>}
      {showAudience && (
        <Sheet title="确认可见范围" onClose={() => setShowAudience(false)}>
          {(Object.entries(scopes) as [Audience, string][]).map(([value, label]) => (
            <ListRow
              key={value}
              title={label}
              trailing={
                <Icon
                  name={scope === value ? 'radio-button-on' : 'radio-button-off'}
                  color={scope === value ? colors.accent : colors.quiet}
                />
              }
              onPress={() => {
                change({ scope: value });
                setConfirmed(false);
              }}
            />
          ))}
          {scope === 'circle' && !groups.some((group) => group.circle) && (
            <Notice
              action="打开隐私中心"
              onAction={() => {
                setShowAudience(false);
                router.push('/privacy');
              }}
            >
              请先在隐私中心建立亲密圈。
            </Notice>
          )}
          {scope === 'group' && (
            <>
              {groups
                .filter((group) => !group.circle)
                .map((group) => (
                  <ListRow
                    key={group.id}
                    title={group.label}
                    trailing={<Icon name={groupId === group.id ? 'radio-button-on' : 'radio-button-off'} />}
                    onPress={() => {
                      change({ groupId: group.id });
                      setConfirmed(false);
                    }}
                  />
                ))}
              {!groups.some((group) => !group.circle) && <Notice>请先在隐私中心建立预设关系组。</Notice>}
            </>
          )}
          {scope === 'selected' && (
            <AudienceFriends
              ids={memberIds}
              update={(ids) => {
                change({ memberIds: ids });
                setConfirmed(false);
              }}
              friends={relationships?.filter((friend) => friend.status === 'accepted') ?? []}
            />
          )}
          <Button
            label="确认这个范围"
            variant="gradient"
            disabled={
              (scope === 'selected' && !memberIds.length) ||
              (scope === 'circle' && !groups.some((group) => group.circle)) ||
              (scope === 'group' && !groups.some((group) => group.id === groupId && !group.circle))
            }
            onPress={() => {
              setConfirmed(true);
              setShowAudience(false);
            }}
          />
        </Sheet>
      )}
    </Screen>
  );
}

function DraftPreview({ item }: { item: LocalMedia }) {
  const localUri = useLocalPhotoUri(item.mime === 'image/jpeg' ? item.photoId : item.videoId);
  const uri = localUri ?? (item.mime === 'video/mp4' ? item.uri : undefined);
  if (!uri) return <Text style={styles.muted}>附件正在读取或无法访问。</Text>;
  return item.mime === 'video/mp4' ? <MomentVideo source={{ uri }} /> :
    <Image accessibilityLabel="草稿照片" source={{ uri }} resizeMode="contain" style={{ width: '100%', height: 380 }} />;
}

const local = StyleSheet.create({
  sort: { flexDirection: 'row', justifyContent: 'center' },
  location: { ...styles.row, minHeight: 44 },
  writing: { ...styles.input, minHeight: 150, backgroundColor: colors.panel, borderColor: colors.border, textAlignVertical: 'top', padding: space.md },
  audience: { backgroundColor: colors.panel, borderRadius: radius.surface, overflow: 'hidden' },
});
