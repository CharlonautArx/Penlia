import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Button, Empty, Icon, ListRow, Notice, Screen, Sheet } from '../components/ui';
import { pilot } from '../features/design/pilot';
import { scopes, type Audience, type Moment } from '../features/moments/Feed';
import {
  choosePostMedia,
  MomentMediaLimit,
  removeMomentDraftMedia,
  EditorMediaPreview,
  EditorMediaThumbnail,
  encodeMomentMedia,
  type EditorMedia,
  type LocalMedia,
  type Media,
} from '../features/moments/media';
import { emptyMomentDraft, useMomentDraft, type MomentDraft } from '../features/moments/draft';
import { momentPhotoLimit, movePhoto } from '../features/moments/photo-grid';
import { MediaEditor, useMediaEditorScroll } from '../features/moments/MediaEditor';
import { AudienceFriends } from '../features/moments/AudienceFriends';
import type { RelationGroup, Settings } from '../features/privacy/types';
import { errorMessage } from '../services/api';
import { useFriends } from '../services/friends';
import { useSession } from '../services/session';
import { colors, radius, space, styles, touch, type } from '../theme';

type Form = Omit<MomentDraft, 'assets'> & { assets: EditorMedia[] };

export default function PrivateMoment() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { request, session } = useSession();
  const { relationships, refresh } = useFriends();
  const [limitMessage, setLimitMessage] = useState('');
  const [previous, setPrevious] = useState<Moment>();
  const draft = useMomentDraft();
  const [editing, setEditing] = useState<Form>(emptyMomentDraft);
  const [defaultScope, setDefaultScope] = useState<Audience>('private');
  const [groups, setGroups] = useState<RelationGroup[]>([]);
  const [showAudience, setShowAudience] = useState(false);
  const [writing, setWriting] = useState(false);
  const [taggingPlace, setTaggingPlace] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [preview, setPreview] = useState<EditorMedia>();
  const form: Form = id ? editing : draft.value ?? emptyMomentDraft(defaultScope);
  const { body, location, scope, groupId, memberIds, assets } = form;
  function change(next: Partial<Form> | ((current: Form) => Form)) {
    const apply = (current: Form) => typeof next === 'function' ? next(current) : { ...current, ...next };
    if (id) setEditing(apply);
    else draft.update((current) => publishDraft(apply(current ?? emptyMomentDraft(defaultScope))));
  }
  const scroll = useMediaEditorScroll();
  const [confirmed, setConfirmed] = useState(false);
  const [deletePrompt, setDeletePrompt] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const uploaded = useRef(new Map<string, { id: string; at: number }>());
  const editFiles = useRef(new Map<string, LocalMedia>());
  const guard = useRef(false);
  const me = session?.user.id;
  useEffect(() => () => {
    void Promise.allSettled([...editFiles.current.values()].map(removeMomentDraftMedia));
  }, []);

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
        if (entry && (entry.moment.authorId !== me || entry.moment.forwarded)) throw new Error('这条动态无法编辑。');
        setGroups(result.groups);
        setDefaultScope(prefs.settings.momentScope);
        if (entry) {
          const moment = entry.moment;
          setPrevious(moment);
          setEditing({ ...emptyMomentDraft(moment.scope ?? prefs.settings.momentScope),
            body: moment.body, location: moment.location ?? '', groupId: moment.groupId ?? '', memberIds: moment.memberIds ?? [],
            assets: (moment.media ?? []).map((item) => ({ ...item, published: true })) });
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
      if (failure instanceof MomentMediaLimit) setLimitMessage(failure.message);
      else setError(errorMessage(failure));
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
    const mediaIds: string[] = [];
    let attempt: MomentDraft['attempt'];
    if (!previous) {
      const signature = JSON.stringify([body, location, scope, groupId, memberIds, assets.map(({ id }) => id)]);
      attempt = form.attempt?.signature === signature ? form.attempt : { id: randomUUID(), signature };
      await draft.save(() => ({ ...publishDraft(form), attempt }));
    }
    for (let index = 0; index < assets.length; index++) {
      const item = assets[index];
      if ('published' in item) { mediaIds.push(item.id); continue; }
      const existing = uploaded.current.get(item.id);
      if (existing && Date.now() - existing.at < 23 * 60 * 60 * 1000) {
        mediaIds.push(existing.id);
        continue;
      }
      setProgress('正在上传 ' + (index + 1) + ' / ' + assets.length);
      const { media } = await request<{ media: Media }>('/moment-media', {
        method: 'POST', body: await encodeMomentMedia(item),
      });
      uploaded.current.set(item.id, { id: media.id, at: Date.now() });
      mediaIds.push(media.id);
    }
    if (previous) {
      setProgress('正在保存修改…');
      await request('/moments/' + previous.id, {
        method: 'PATCH',
        body: { ...audience, body, location, revision: previous.revision, mediaIds },
      });
    } else if (attempt) {
      setProgress('正在发布…');
      await request('/moments', { method: 'POST', body: { ...audience, body, location, clientId: attempt.id, mediaIds } });
      await draft.save(() => null);
      void Promise.allSettled(publishDraft(form).assets.map(removeMomentDraftMedia));
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
  const photosLeft = momentPhotoLimit - assets.filter((asset) => asset.mime !== 'video/mp4').length;
  const videosLeft = assets.some((asset) => asset.mime === 'video/mp4') ? 0 : 1;

  function move(id: string, to: number) {
    change((current) => {
      const order = movePhoto(current.assets, current.assets.findIndex((item) => item.id === id), to);
      return order === current.assets ? current : { ...current, assets: [...order] };
    });
  }

  function removeAsset(item: EditorMedia) {
    void run(async () => {
      if (id) change((current) => ({ ...current, assets: current.assets.filter((value) => value.id !== item.id) }));
      else await draft.save((current) => current && ({ ...current, assets: current.assets.filter((value) => value.id !== item.id) }));
      if ('published' in item) return;
      editFiles.current.delete(item.id);
      const saved = uploaded.current.get(item.id);
      uploaded.current.delete(item.id);
      await Promise.allSettled([removeMomentDraftMedia(item),
        ...(saved ? [request('/moment-media/' + saved.id, { method: 'DELETE' })] : [])]);
    });
  }

  function append(chosen: LocalMedia[]) {
    if (!chosen.length) return;
    if (id) chosen.forEach((item) => editFiles.current.set(item.id, item));
    change((current) => ({ ...current, assets: [...current.assets, ...chosen] }));
  }

  return (
    <GestureHandlerRootView style={styles.grow}>
    <Screen
      title={id ? '编辑动态' : '发布动态'}
      renderScroll={scroll.render}
      back={() => {
        if (!busy) {
          if (router.canGoBack()) router.back();
          else router.replace('/moments');
        }
      }}
    >
      {(error || draft.error) && <Notice action={draft.error ? '重试读取草稿' : undefined} onAction={draft.retry}>{error || draft.error}</Notice>}
      {(!loaded || (!id && draft.loading)) && !error && <View style={pilot.surface}>
        <Empty busy>正在读取动态草稿…</Empty>
      </View>}
      {loaded && (id || draft.value !== undefined) && (
        <>
          <View style={[pilot.surface, local.composer, writing && local.focused]}>
            <TextInput
              accessibilityLabel="动态正文"
              placeholder="写点什么，或直接分享照片和视频"
              placeholderTextColor={colors.quiet}
              multiline
              textAlignVertical="top"
              value={body}
              editable={!busy}
              onFocus={() => setWriting(true)}
              onBlur={() => setWriting(false)}
              onChangeText={(body) => change({ body })}
              maxLength={2000}
              style={local.writing}
            />
            <MediaEditor items={assets} busy={busy} scroll={scroll} open={setPreview} remove={removeAsset} move={move}
              tile={(item) => <EditorMediaThumbnail item={item} />}
              addLabel={photosLeft && videosLeft ? '选择照片和视频' : photosLeft ? '选择照片' : '选择视频'}
              add={photosLeft || videosLeft ? () => void run(async () =>
                append(await choosePostMedia(me! + '-draft', photosLeft, videosLeft))) : undefined} />
          </View>
          <View style={pilot.surface}>
            <View style={[local.location, styles.divider, taggingPlace && local.focused]}>
              <Icon name="location-outline" color={colors.accent} size={21} />
              <View style={styles.grow}>
                {!!location && <Text style={local.locationLabel}>标注地点</Text>}
                <TextInput accessibilityLabel="标注地点" placeholder="标注地点" placeholderTextColor={colors.quiet}
                  value={location} editable={!busy} maxLength={100} onChangeText={(location) => change({ location })}
                  onFocus={() => setTaggingPlace(true)} onBlur={() => setTaggingPlace(false)}
                  style={local.locationInput} />
              </View>
            </View>
            <ListRow
              title={'可见范围 · ' + audienceName}
              detail={confirmed ? '已确认' : (id ? '保存前请确认谁能看到' : '发布前请确认谁能看到')}
              left={<Icon name="lock-closed-outline" color={colors.accent} />} separator={false}
              onPress={() => setShowAudience(true)}
            />
          </View>
          <Button
            label={progress || (previous ? '保存修改' : '发布动态')}
            variant="gradient"
            disabled={busy || (!body.trim() && !assets.length)}
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
      {preview && <EditorMediaPreview item={preview} close={() => setPreview(undefined)} />}
      {confirmClear && <Sheet title="清除动态草稿" onClose={() => { if (!busy) setConfirmClear(false); }}>
        <Text style={styles.muted}>清除已保存的文字、附件和可见范围。</Text>
        <Button label="确认清除草稿" variant="danger" disabled={busy} onPress={() => void run(async () => {
          await draft.save(() => null);
          setShowAudience(false);
          setConfirmed(false);
          setConfirmClear(false);
          const remote = [...uploaded.current.values()].map(({ id }) => id);
          uploaded.current.clear();
          await Promise.allSettled([...publishDraft(form).assets.map(removeMomentDraftMedia),
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
      {!!limitMessage && <Sheet title="媒体限制" onClose={() => setLimitMessage('')} tone="neutral">
        <Text style={styles.body}>{limitMessage}</Text>
        <Button label="知道了" variant="soft" onPress={() => setLimitMessage('')} />
      </Sheet>}
    </Screen>
    </GestureHandlerRootView>
  );
}

function publishDraft(form: Form): MomentDraft {
  return { ...form, assets: form.assets.filter((item): item is LocalMedia => !('published' in item)) };
}

const local = StyleSheet.create({
  composer: { padding: space.sm, gap: space.sm },
  focused: { borderColor: colors.accent },
  writing: { ...type.body, fontSize: 17, lineHeight: 27, color: colors.text, minHeight: 144,
    paddingHorizontal: space.xxs, paddingVertical: space.xxs, borderRadius: radius.small, outlineWidth: 0 },
  location: { ...styles.row, minHeight: touch, paddingHorizontal: space.sm },
  locationLabel: { ...type.caption, color: colors.quiet, paddingLeft: space.xxs, paddingTop: space.xs },
  locationInput: { ...type.body, color: colors.text, paddingHorizontal: space.xxs, paddingVertical: space.xs,
    minHeight: touch, outlineWidth: 0 },
});
