import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Notice, Screen, Section, Sheet } from '../../components/ui';
import { AssetPicker, DataEmpty, MediaStrip, uploadAssets } from '../../features/life/ui';
import { MemberChoices } from '../../features/privacy/MemberChoices';
import { type LocalMedia, type Media } from '../../features/moments/media';
import { back, Choices, Field, formatTime, useRecord } from '../../features/social/ui';
import { useFriends } from '../../services/friends';
import { styles } from '../../theme';

const scopes = { private: '仅自己', friends: '全部好友', selected: '指定好友' };
const duration = { '1': '1小时', '24': '24小时', '72': '3天', '168': '7天' };
const presets = { '☕': '正在休息', '💬': '想聊天', '🌿': '享受独处', '🌤️': '心情很好', '🎈': '想出去玩' };
type Scope = keyof typeof scopes;
export type LifeStatus = {
  caption: string;
  emoji: string;
  expiresAt: string;
  scope?: Scope;
  revision?: number;
  memberIds?: string[];
  media: Media[];
};

export function StatusBlock({ status }: { status: LifeStatus }) {
  return (
    <View style={styles.card}>
      <Text style={styles.strong}>
        {[status.emoji, status.caption].filter(Boolean).join(' ') || '生活状态'}
      </Text>
      <MediaStrip media={status.media} />
    </View>
  );
}
export default function Status() {
  const { data, error, run, request, busy, load } = useRecord<{ status: LifeStatus | null }>('/p2/status');
  const [edit, setEdit] = useState(false);
  const [clear, setClear] = useState(false);
  return (
    <Screen title="我的生活状态" back={back} refreshing={busy} onRefresh={() => void load()}>
      {!!error && <Notice>{error}</Notice>}
      <Text style={styles.muted}>状态由你主动设置。有效期结束后会自动隐藏。</Text>
      {data?.status ? (
        <>
          <StatusBlock status={data.status} />
          <Text style={styles.small}>
            {formatTime(data.status.expiresAt)} 到期 · {scopes[data.status.scope ?? 'private']}
          </Text>
        </>
      ) : (
        <DataEmpty loading={!data && !error}>还没有设置生活状态。</DataEmpty>
      )}
      <Button
        label={data?.status ? '编辑生活状态' : '设置生活状态'}
        variant="gradient"
        onPress={() => setEdit(true)}
      />
      {data?.status && <Button label="清除状态" variant="danger" onPress={() => setClear(true)} />}
      {edit && (
        <StatusEditor
          initial={data?.status ?? undefined}
          onClose={() => {
            setEdit(false);
            void load();
          }}
        />
      )}
      {clear && (
        <Sheet title="清除生活状态" onClose={() => setClear(false)}>
          <Text style={styles.muted}>状态和图片将立即从好友资料页撤下。</Text>
          {!!error && <Notice>{error}</Notice>}
          <Button
            label="确认清除"
            variant="danger"
            disabled={busy}
            onPress={() =>
              void run(async () => {
                await request('/p2/status', { method: 'DELETE' });
                setClear(false);
              })
            }
          />
        </Sheet>
      )}
    </Screen>
  );
}
function StatusEditor({ initial, onClose }: { initial?: LifeStatus; onClose: () => void }) {
  const { data, busy, error, run, request } = useRecord<{ status: LifeStatus | null }>('/p2/status');
  const { relationships } = useFriends();
  const [caption, setCaption] = useState(initial?.caption ?? '');
  const [emoji, setEmoji] = useState(initial?.emoji ?? '');
  const [scope, setScope] = useState<Scope>(initial?.scope ?? 'private');
  const [ids, setIds] = useState(initial?.memberIds ?? []);
  const [timing, setTiming] = useState<keyof typeof duration>('24');
  const [media, setMedia] = useState<Media[]>(initial?.media ?? []);
  const [drafts, setDrafts] = useState<LocalMedia[]>([]);
  return (
    <Sheet title="编辑生活状态" onClose={onClose}>
      <Section title="选一个预设" />
      <Choices
        labels={presets}
        value={emoji as keyof typeof presets}
        set={(value) => {
          setEmoji(value);
          setCaption(presets[value]);
        }}
      />
      <Field title="表情（选填）" value={emoji} onChangeText={setEmoji} maxLength={8} />
      <Field title="状态文字" value={caption} onChangeText={setCaption} maxLength={64} />
      <AssetPicker drafts={drafts} change={setDrafts} limit={1} existing={media} updateExisting={setMedia} />
      <Section title="有效期" />
      <Choices labels={duration} value={timing} set={setTiming} />
      <Section title="谁可以看" />
      <Choices labels={scopes} value={scope} set={setScope} />
      {scope === 'selected' && (
        <MemberChoices
          friends={relationships?.filter((p) => p.status === 'accepted') ?? []}
          ids={ids}
          update={setIds}
        />
      )}
      {!!error && <Notice>{error}</Notice>}
      <Button
        label="保存状态"
        variant="gradient"
        disabled={busy || (!emoji.trim() && !caption.trim() && !media.length && !drafts.length)}
        onPress={() =>
          void run(async () => {
            const mediaIds = await uploadAssets(request, media, drafts);
            await request('/p2/status', {
              method: 'POST',
              body: {
                caption,
                emoji,
                scope,
                memberIds: ids,
                revision: initial?.revision ?? data?.status?.revision,
                expiresAt: new Date(Date.now() + Number(timing) * 3600000).toISOString(),
                mediaIds,
              },
            });
            onClose();
          }, false)
        }
      />
    </Sheet>
  );
}
