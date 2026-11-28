import { MaterialCard } from '../../components/ui';
import { useTogetherRouter } from '../together/navigation';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { getDocumentAsync, type DocumentPickerAsset } from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { Button, Notice, Screen, Section, Sheet } from '../together/ui';
import { back, dateTime, Field, formatTime, useRecord } from '../social/ui';
import { type LocalMedia, type Media } from '../moments/media';
import { apiOrigin, errorMessage } from '../../services/api';
import { useSession } from '../../services/session';
import { styles } from '../../theme';
import {
  AssetPicker,
  DataEmpty,
  formTime,
  MediaStrip,
  uploadAssets,
  type Project,
  type ProjectMember,
} from './ui';
import { ManageProjectPeople } from './project-people';

type Capsule = Project & { opensAt: string; sealedAt: string | null; opened: boolean };
type Entry = {
  id: string;
  authorId: string;
  author: string;
  body: string;
  revision: number;
  media: Media[];
  hasAudio: boolean;
};
type Detail = { capsule: Capsule; entries: Entry[]; ownEntryId: string | null; members: ProjectMember[] };

export function CapsuleScreen({ id }: { id: string }) {
  const router = useTogetherRouter();
  const { session } = useSession();
  const { data, error, busy, run, request, load } = useRecord<Detail>('/p2/capsules/' + id, 15000);
  const [editor, setEditor] = useState(false);
  const [openAudio, setOpenAudio] = useState<string>();
  const [confirm, setConfirm] = useState<'seal' | 'withdraw' | 'reschedule'>();
  const [opens, setOpens] = useState('');
  const me = session?.user.id;
  const old = data?.entries.find((e) => e.authorId === me);
  const owner = me === data?.capsule.ownerId;
  const act = (action: string, body: Record<string, unknown>) =>
    request('/p2/capsules/' + id + '/action', { method: 'POST', body: { action, ...body } });
  return (
    <Screen
      title={data?.capsule.title ?? '时光胶囊'}
      back={back}
      refreshing={busy}
      onRefresh={() => void load()}
    >
      {!!error && (
        <Notice action="重试" onAction={() => void load()}>
          {error}
        </Notice>
      )}
      {!data && !error && <DataEmpty loading>暂无胶囊。</DataEmpty>}
      {data && (
        <>
          <MaterialCard>
            <Section
              title={
                data.capsule.opened ? '可以打开了' : data.capsule.sealedAt ? '胶囊已封存' : '一起写给未来'
              }
            />
            <Text style={styles.body}>约定开启于 {formatTime(data.capsule.opensAt)}</Text>
            {!data.capsule.opened && (
              <Text style={styles.muted}>
                {data.capsule.sealedAt
                  ? '到期后，仍在项目里的成员才能打开。你随时可以撤回自己的投稿。'
                  : '封存前只有你能看见自己的草稿。封存后无法修改内容或提前打开，可撤回自己的投稿。'}
              </Text>
            )}
          </MaterialCard>
          {!data.capsule.sealedAt && (
            <Button
              label={old ? '编辑我的投稿' : '写下我的投稿'}
              variant="gradient"
              icon="create-outline"
              onPress={() => setEditor(true)}
            />
          )}
          {data.entries.map((item) => (
            <MaterialCard key={item.id}>
              <Section title={item.author} detail={!data.capsule.opened ? '我的草稿' : undefined} />
              {!!item.body && <Text style={styles.body}>{item.body}</Text>}
              <MediaStrip media={item.media} />
              {item.hasAudio && (
                <Button
                  label="播放语音"
                  icon="volume-medium-outline"
                  variant="soft"
                  onPress={() => setOpenAudio(item.id)}
                />
              )}
            </MaterialCard>
          ))}
          {data.capsule.opened && !data.entries.length && (
            <DataEmpty loading={false}>这里没有可查看的投稿。</DataEmpty>
          )}
          {data.capsule.opened && (
            <Button
              label="保存为共同回忆"
              variant="soft"
              onPress={() =>
                router.push({
                  pathname: '/life/memories',
                  params: {
                    from: id,
                    sourceKind: 'capsule',
                    title: data.capsule.title,
                  },
                })
              }
            />
          )}
          {data.ownEntryId && (
            <Button label="撤回我的投稿" variant="danger" onPress={() => setConfirm('withdraw')} />
          )}
          {owner && !data.capsule.sealedAt && (
            <View style={[styles.row, { flexWrap: 'wrap' }]}>
              <Button label="封存胶囊" variant="soft" onPress={() => setConfirm('seal')} />
              <Button
                label="修改开启时间"
                variant="quiet"
                onPress={() => {
                  setOpens(formTime(new Date(data.capsule.opensAt)));
                  setConfirm('reschedule');
                }}
              />
            </View>
          )}
          <ManageProjectPeople
            project={data.capsule}
            members={data.members}
            locked={!!data.capsule.sealedAt}
            changed={() => void load()}
          />
        </>
      )}
      {editor && (
        <CapsuleEditor
          key={old?.id ?? 'new'}
          capsule={id}
          initial={old}
          onClose={() => {
            setEditor(false);
            void load();
          }}
        />
      )}
      {openAudio && (
        <Sheet title="胶囊语音" onClose={() => setOpenAudio(undefined)}>
          <CapsuleAudio id={openAudio} />
        </Sheet>
      )}
      {confirm && (
        <Sheet
          title={{ seal: '封存胶囊', withdraw: '撤回自己的投稿', reschedule: '修改开启时间' }[confirm]}
          onClose={() => setConfirm(undefined)}
        >
          {confirm === 'seal' && (
            <Text style={styles.muted}>封存后，成员到约定日期才能开启。投稿人仍可撤回自己的内容。</Text>
          )}
          {confirm === 'withdraw' && (
            <Text style={styles.muted}>确认后，文字、照片、视频与语音会从胶囊撤下。</Text>
          )}
          {confirm === 'reschedule' && <Field title="指定新时间" value={opens} onChangeText={setOpens} />}
          {!!error && <Notice>{error}</Notice>}
          <Button
            label="确认"
            variant={confirm === 'withdraw' ? 'danger' : 'gradient'}
            disabled={busy}
            onPress={() =>
              void run(async () => {
                if (confirm === 'withdraw')
                  await request('/p2/capsule-entries/' + data?.ownEntryId, { method: 'DELETE' });
                else
                  await act(confirm, {
                    confirmed: true,
                    opensAt: confirm === 'reschedule' ? dateTime(opens) : undefined,
                  });
                setConfirm(undefined);
              })
            }
          />
        </Sheet>
      )}
    </Screen>
  );
}

async function encodeAudio(file: DocumentPickerAsset) {
  let base64: string;
  const max = 2 * 1024 * 1024;
  if (file.size !== undefined && file.size > max) throw new Error('请选择不超过 2 MB 的音频。');
  if (Platform.OS === 'web') {
    const blob = file.file ?? (await (await fetch(file.uri)).blob());
    if (blob.size > max) throw new Error('请选择不超过 2 MB 的音频。');
    base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(new Error('无法读取音频。'));
      reader.readAsDataURL(blob);
    });
  } else {
    const native = new File(file.uri);
    if (native.size > max) throw new Error('请选择不超过 2 MB 的音频。');
    base64 = await native.base64();
  }
  const ext = file.name.toLowerCase().split('.').pop();
  const mime = ext === 'm4a' ? 'audio/mp4' : ext === 'mp3' ? 'audio/mpeg' : ext === 'wav' ? 'audio/wav' : '';
  if (!mime) throw new Error('支持 M4A、MP3 和 WAV 音频。');
  return { mime, base64 };
}
function CapsuleEditor({
  capsule,
  initial,
  onClose,
}: {
  capsule: string;
  initial?: Entry;
  onClose: () => void;
}) {
  const { busy, error, run, request } = useRecord('/p2/capsules/' + capsule);
  const [revision, setRevision] = useState(initial?.revision);
  const [text, setText] = useState(initial?.body ?? '');
  const [media, setMedia] = useState<Media[]>(initial?.media ?? []);
  const [drafts, setDrafts] = useState<LocalMedia[]>([]);
  const [audio, setAudio] = useState<DocumentPickerAsset>();
  const [removeAudio, setRemoveAudio] = useState(false);
  return (
    <Sheet
      title={initial ? '编辑我的投稿' : '写下我的投稿'}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <Field title="想说的话" multiline value={text} onChangeText={setText} />
      <AssetPicker
        drafts={drafts}
        change={setDrafts}
        limit={6}
        existing={media}
        updateExisting={setMedia}
        video
      />
      <Button
        label={audio ? '更换语音文件' : '添加语音文件'}
        variant="soft"
        icon="attach-outline"
        onPress={() =>
          void run(async () => {
            const result = await getDocumentAsync({
              type: 'audio/*',
              copyToCacheDirectory: true,
              multiple: false,
            });
            if (!result.canceled) {
              setAudio(result.assets[0]);
              setRemoveAudio(false);
            }
          }, false)
        }
      />
      {audio && <Text style={styles.small}>{audio.name}</Text>}
      {(audio || initial?.hasAudio) && (
        <Button
          label={removeAudio ? '恢复语音附件' : '移除语音附件'}
          variant="quiet"
          onPress={() => {
            if (audio) setAudio(undefined);
            else setRemoveAudio(!removeAudio);
          }}
        />
      )}
      <Text style={styles.small}>音频支持 M4A、MP3 或 WAV，最大 2 MB。</Text>
      {!!error && <Notice>{error}</Notice>}
      <Button
        label="保存我的投稿"
        variant="gradient"
        disabled={
          busy ||
          (!text.trim() && !media.length && !drafts.length && !audio && (!initial?.hasAudio || removeAudio))
        }
        onPress={() =>
          void run(async () => {
            const encoded = audio ? await encodeAudio(audio) : undefined;
            const mediaIds = await uploadAssets(request, media, drafts);
            const entry = await request<{ id: string; revision: number }>(
              '/p2/capsules/' + capsule + '/entry',
              { method: 'POST', body: { body: text, revision, mediaIds } },
            );
            setRevision(entry.revision);
            if (encoded)
              await request('/p2/capsule-entries/' + entry.id + '/audio', { method: 'POST', body: encoded });
            else if (removeAudio)
              await request('/p2/capsule-entries/' + entry.id + '/audio', { method: 'DELETE' });
            onClose();
          }, false)
        }
      />
    </Sheet>
  );
}
function CapsuleAudio({ id }: { id: string }) {
  const { session } = useSession();
  const [notice, setNotice] = useState('');
  const source = (() => {
    try {
      return session
        ? {
            uri: apiOrigin() + '/v1/p2/capsule-entries/' + id + '/audio',
            headers: { Authorization: 'Bearer ' + session.token },
          }
        : null;
    } catch {
      return null;
    }
  })();
  const player = useAudioPlayer(source);
  const status = useAudioPlayerStatus(player);
  return (
    <>
      <Text style={styles.muted}>
        {status.isLoaded
          ? Math.round(status.currentTime) + ' / ' + Math.round(status.duration) + ' 秒'
          : '正在加载语音…'}
      </Text>
      <Button
        label={status.playing ? '暂停' : '播放'}
        variant="gradient"
        disabled={!status.isLoaded}
        onPress={() => {
          try {
            if (status.playing) player.pause();
            else player.play();
          } catch {
            setNotice('当前无法播放此音频。');
          }
        }}
      />
      {!!notice && <Notice>{notice}</Notice>}
    </>
  );
}
