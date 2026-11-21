import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Empty, Icon, IconButton, ListRow, Notice, Screen, Sheet } from '../components/ui';
import { scopes, type Audience, type Moment } from '../features/moments/Feed';
import {
  chooseMomentPhotos,
  chooseMomentVideo,
  DraftMediaTile,
  encodeMomentMedia,
  type LocalMedia,
  type Media,
} from '../features/moments/media';
import { MemberChoices } from '../features/privacy/MemberChoices';
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
  const [body, setBody] = useState('');
  const [scope, setScope] = useState<Audience>('private');
  const [groupId, setGroupId] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [groups, setGroups] = useState<RelationGroup[]>([]);
  const [showAudience, setShowAudience] = useState(false);
  const [assets, setAssets] = useState<LocalMedia[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [deletePrompt, setDeletePrompt] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const uploaded = useRef(new Map<string, string>());
  const clientId = useRef<string | undefined>(undefined);
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
        setScope(entry?.moment.scope ?? prefs.settings.momentScope);
        if (entry) {
          setPrevious(entry.moment);
          setBody(entry.moment.body);
          setGroupId(entry.moment.groupId ?? '');
          setMemberIds(entry.moment.memberIds ?? []);
        }
        setLoaded(true);
      })
      .catch((failure) => {
        if (active) setError(errorMessage(failure));
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
        body: { ...audience, body, revision: previous.revision },
      });
    } else {
      const mediaIds: string[] = [];
      for (let index = 0; index < assets.length; index++) {
        const item = assets[index];
        let found = uploaded.current.get(item.id);
        if (!found) {
          setProgress('正在上传 ' + (index + 1) + ' / ' + assets.length);
          const result = await request<{ media: Media }>('/moment-media', {
            method: 'POST',
            body: await encodeMomentMedia(item),
          });
          found = result.media.id;
          uploaded.current.set(item.id, found);
        }
        mediaIds.push(found);
      }
      setProgress('正在发布…');
      clientId.current ??= randomUUID();
      await request('/moments', { method: 'POST', body: { ...audience, body, clientId: clientId.current, mediaIds } });
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

  function removeAsset(item: LocalMedia) {
    void run(async () => {
      const saved = uploaded.current.get(item.id);
      if (saved) await request('/moment-media/' + saved, { method: 'DELETE' });
      uploaded.current.delete(item.id);
      setAssets((current) => current.filter((value) => value.id !== item.id));
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
      {!!error && <Notice>{error}</Notice>}
      {!loaded && !error && <Empty busy>正在加载可见范围…</Empty>}
      {loaded && (
        <>
          <TextInput
            accessibilityLabel="动态正文"
            placeholder="写点什么，或直接分享一张照片"
            placeholderTextColor={colors.quiet}
            multiline
            textAlignVertical="top"
            value={body}
            editable={!busy}
            onChangeText={setBody}
            maxLength={2000}
            style={local.writing}
          />
          {previous ? (
            <Text style={styles.muted}>这条动态有 {previous.media.length} 个原有附件。</Text>
          ) : (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {assets.map((item) => (
                  <View key={item.id} style={[styles.card, { padding: 7 }]}>
                    <DraftMediaTile item={item} />
                    <IconButton
                      label="移除附件"
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
                  disabled={busy || hasVideo || assets.length >= 6}
                  onPress={() =>
                    void run(async () => {
                      const chosen = await chooseMomentPhotos(me!, 6 - assets.length);
                      setAssets((current) => [...current, ...chosen]);
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
                      const item = await chooseMomentVideo();
                      if (item) setAssets([item]);
                    })
                  }
                />
              </View>
              <Text style={styles.small}>最多六张照片，或一段 4 MB、30 秒以内的 MP4。</Text>
            </>
          )}
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
                  router.replace('/moments');
                });
              }}
            />
          )}
        </>
      )}
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
                setScope(value);
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
                      setGroupId(group.id);
                      setConfirmed(false);
                    }}
                  />
                ))}
              {!groups.some((group) => !group.circle) && <Notice>请先在隐私中心建立关系组。</Notice>}
            </>
          )}
          {scope === 'selected' && (
            <MemberChoices
              ids={memberIds}
              update={(ids) => {
                setMemberIds(ids);
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

const local = StyleSheet.create({
  writing: { ...styles.input, minHeight: 150, backgroundColor: colors.panel, borderColor: colors.border, textAlignVertical: 'top', padding: space.md },
  audience: { backgroundColor: colors.panel, borderRadius: radius.surface, overflow: 'hidden' },
});
