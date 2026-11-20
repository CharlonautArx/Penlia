import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Empty, ListRow, Notice, Section } from '../../components/ui';
import {
  chooseMomentPhotos,
  chooseMomentVideo,
  DraftMediaTile,
  encodeMomentMedia,
  MomentMediaTile,
  type LocalMedia,
  type Media,
} from '../moments/media';
import { useSession } from '../../services/session';
import { errorMessage } from '../../services/api';
import { styles } from '../../theme';

export type ProjectKind = 'trip' | 'list' | 'map' | 'capsule';
export const projectTitles: Record<ProjectKind, string> = {
  trip: '共同旅行',
  list: '共同清单',
  map: '共同愿望地图',
  capsule: '时光胶囊',
};
export type Project = { id: string; title: string; kind: ProjectKind; ownerId: string };
export type ProjectMember = { id: string; name: string; state: string };

export const pad = (value: number) => String(value).padStart(2, '0');
export const localDay = (date: Date) =>
  [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join('-');
export const localDate = (date: string) => new Date(date + 'T12:00:00');
export const formTime = (date: Date) =>
  localDay(date) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
export const moveDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
export const daysText = (date: Date) =>
  new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(date);

export function MediaStrip({ media }: { media: Media[] }) {
  return media.length ? (
    <View style={[styles.row, { flexWrap: 'wrap' }]}>
      {media.map((item) => (
        <MomentMediaTile key={item.id} item={item} />
      ))}
    </View>
  ) : null;
}

export function AssetPicker({
  drafts,
  change,
  limit,
  existing,
  updateExisting,
  video = false,
}: {
  drafts: LocalMedia[];
  change: (value: LocalMedia[]) => void;
  limit: number;
  existing: Media[];
  updateExisting: (items: Media[]) => void;
  video?: boolean;
}) {
  const { session } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const remaining = limit - existing.length - drafts.length;
  async function pick(isVideo: boolean) {
    if (busy || remaining < 1 || !session) return;
    setBusy(true);
    setError('');
    try {
      const media = isVideo ? await chooseMomentVideo() : undefined;
      if (isVideo) {
        if (media) change([...drafts, media]);
      } else
        change(
          [...drafts, ...(await chooseMomentPhotos(session.user.id, remaining))].slice(
            0,
            limit - existing.length,
          ),
        );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <View style={[styles.row, { flexWrap: 'wrap' }]}>
        <Button
          label={limit === 1 ? '选择封面' : '添加照片'}
          variant="soft"
          icon="image-outline"
          disabled={busy || remaining < 1}
          onPress={() => void pick(false)}
        />
        {video && (
          <Button
            label="添加短视频"
            variant="soft"
            icon="videocam-outline"
            disabled={busy || remaining < 1}
            onPress={() => void pick(true)}
          />
        )}
      </View>
      {existing.map((media) => (
        <View key={media.id} style={styles.row}>
          <MomentMediaTile item={media} />
          <Button
            label="移除附件"
            variant="quiet"
            onPress={() => updateExisting(existing.filter((x) => x.id !== media.id))}
          />
        </View>
      ))}
      {drafts.map((media) => (
        <View key={media.id} style={styles.row}>
          <DraftMediaTile item={media} />
          <Button
            label="取消该附件"
            variant="quiet"
            onPress={() => change(drafts.filter((x) => x.id !== media.id))}
          />
        </View>
      ))}
      {!!error && <Notice>{error}</Notice>}
    </>
  );
}

export async function uploadAssets(
  request: ReturnType<typeof useSession>['request'],
  existing: Media[],
  drafts: LocalMedia[],
) {
  const ids = existing.map((asset) => asset.id);
  for (const item of drafts) {
    const result = await request<{ media: Media }>('/moment-media', {
      method: 'POST',
      body: await encodeMomentMedia(item),
    });
    ids.push(result.media.id);
  }
  return ids;
}

export function ProjectPeople({
  members,
  owner,
  invite,
  remove,
  leave,
}: {
  members: ProjectMember[];
  owner: boolean;
  invite?: () => void;
  remove?: (id: string) => void;
  leave?: () => void;
}) {
  return (
    <>
      <Section title="成员" />
      {!members.some((p) => p.state === 'active' || p.state === 'invited') && <Empty>还没有其他成员。</Empty>}
      {members
        .filter((p) => p.state === 'active' || p.state === 'invited')
        .map((person) => (
          <ListRow
            key={person.id}
            title={person.name}
            detail={person.state === 'invited' ? '等待接受' : '已加入'}
            trailing={
              owner && remove ? (
                <Button label="移除" variant="quiet" onPress={() => remove(person.id)} />
              ) : undefined
            }
          />
        ))}
      {owner && invite && (
        <Button label="邀请好友" variant="soft" icon="person-add-outline" onPress={invite} />
      )}
      {!owner && leave && <Button label="退出项目" variant="danger" onPress={leave} />}
    </>
  );
}

export function DataEmpty({ loading, children }: { loading: boolean; children: string }) {
  return <Empty busy={loading}>{loading ? '正在读取…' : children}</Empty>;
}
