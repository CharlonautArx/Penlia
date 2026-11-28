import { useState } from 'react';
import { Text, View } from 'react-native';
import { MaterialCard, Button, Notice, Screen, Section, Sheet } from '../../components/ui';
import { AssetPicker, DataEmpty, MediaStrip, uploadAssets } from '../../features/life/ui';
import { MemberChoices } from '../../features/privacy/MemberChoices';
import { type LocalMedia, type Media } from '../../features/moments/media';
import { back, Choices, Field, formatTime, useRecord } from '../../features/social/ui';
import { useFriends } from '../../services/friends';
import { styles } from '../../theme';

const scopes = { private: '仅自己', friends: '全部好友', selected: '指定好友' };
type Scope = keyof typeof scopes;
export type LifeStatus = {
  caption: string;
  emoji: string;
  expiresAt: string | null;
  scope?: Scope;
  revision?: number;
  memberIds?: string[];
  media: Media[];
};

export function StatusBlock({ status }: { status: LifeStatus }) {
  return (
    <MaterialCard>
      <Text style={styles.strong}>
        {[status.emoji, status.caption].filter(Boolean).join(' ') || '状态'}
      </Text>
      <MediaStrip media={status.media} />
    </MaterialCard>
  );
}
export default function Status() {
  const { data, error, run, request, busy, load } = useRecord<{ status: LifeStatus | null }>('/p2/status?lifetime=1');
  const [edit, setEdit] = useState(false);
  const [clear, setClear] = useState(false);
  return (
    <Screen title="状态" back={back} refreshing={busy} onRefresh={() => void load()}>
      {!!error && <Notice>{error}</Notice>}

      {data?.status ? (
        <>
          <StatusBlock status={data.status} />
          <Text style={styles.small}>
            {data.status.expiresAt ? formatTime(data.status.expiresAt) + ' 到期 · ' : ''}{scopes[data.status.scope ?? 'private']}
          </Text>
        </>
      ) : (
        <DataEmpty loading={!data && !error}>还没有设置状态。</DataEmpty>
      )}
      <Button
        label={data?.status ? '编辑状态' : '设置状态'}
        variant="gradient"
        disabled={!data || busy}
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
        <Sheet title="清除状态" onClose={() => setClear(false)}>
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
  const { busy, error, run, request } = useRecord<{ status: LifeStatus | null }>('/p2/status?lifetime=1');
  const { relationships } = useFriends();
  const previousText = [initial?.emoji, initial?.caption].filter(Boolean).join(' ');
  const [caption, setCaption] = useState(previousText);
  const [scope, setScope] = useState<Scope>(initial?.scope ?? 'private');
  const [ids, setIds] = useState(initial?.memberIds ?? []);
  const [media, setMedia] = useState<Media[]>(initial?.media ?? []);
  const [drafts, setDrafts] = useState<LocalMedia[]>([]);
  return (
    <Sheet title="编辑状态" onClose={onClose}>
      <Field title="状态文字" value={caption} onChangeText={setCaption} maxLength={64} />
      <AssetPicker drafts={drafts} change={setDrafts} limit={1} existing={media} updateExisting={setMedia} />
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
        disabled={busy || (!caption.trim() && !media.length && !drafts.length) || (scope === 'selected' && !ids.length)}
        onPress={() =>
          void run(async () => {
            const mediaIds = await uploadAssets(request, media, drafts);
            await request('/p2/status', {
              method: 'POST',
              body: {
                caption: initial && caption === previousText ? initial.caption : caption,
                emoji: initial && caption === previousText ? initial.emoji : '',
                scope,
                memberIds: ids,
                revision: initial?.revision,
                expiresAt: null,
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
