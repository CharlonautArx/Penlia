import { randomUUID } from 'expo-crypto';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Empty, ListRow, Notice, Screen, Section, Sheet } from '../../components/ui';
import {
  chooseMomentPhotos,
  chooseMomentVideo,
  DraftMediaTile,
  encodeMomentMedia,
  MomentMediaTile,
  type LocalMedia,
  type Media,
} from '../../features/moments/media';
import { back, Field, formatTime, useRecord } from '../../features/social/ui';
import { useSession } from '../../services/session';
import { styles } from '../../theme';
import type { CollectionInfo } from '../collection/[id]';

type Contribution = {
  id: string;
  authorId: string;
  author: string;
  body: string;
  createdAt: string;
  revision: number;
  media: Media[];
};
type Detail = {
  entry: { id: string; title: string };
  collection: CollectionInfo;
  contributions: Contribution[];
};
type Revision = { revision: number; body: string; action: string; editor: string; editedAt: string };
const revisionLabels: Record<string, string> = {
  created: '添加',
  edited: '编辑',
  withdrawn: '撤回',
  removed: '移除',
};

export default function JournalEntry() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const { data, error, busy, run, request, load } = useRecord<Detail>('/p1/entries/' + id);
  const [panel, setPanel] = useState<'add' | 'edit' | 'withdraw' | 'history'>();
  const [item, setItem] = useState<Contribution>();
  const [body, setBody] = useState('');
  const [clientId, setClientId] = useState(randomUUID);
  const [media, setMedia] = useState<LocalMedia[]>([]);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [uploaded, setUploaded] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState('');
  const open = (action: typeof panel, target?: Contribution) => {
    setItem(target);
    setBody(target?.body ?? '');
    setClientId(randomUUID());
    setMedia([]);
    setUploaded({});
    setPanel(action);
  };
  const me = session?.user.id ?? '';
  return (
    <Screen
      title={data?.entry.title ?? '共同经历'}
      back={back}
      refreshing={busy}
      onRefresh={() => void load()}
    >
      {!!error && (
        <Notice action="重试" onAction={() => void load()}>
          {error}
        </Notice>
      )}
      {data?.collection.canWrite && (
        <Button label="补充文字、照片或视频" variant="gradient" icon="add" onPress={() => open('add')} />
      )}
      {data && !data.contributions.length && (
        <Empty icon="create-outline">还没有共同记录。可以先写一句话，或添加照片。</Empty>
      )}
      {data?.contributions.map((line) => (
        <View style={styles.card} key={line.id}>
          <Section title={line.author} detail={formatTime(line.createdAt)} />
          {!!line.body && <Text style={styles.body}>{line.body}</Text>}
          <View style={[styles.row, { flexWrap: 'wrap' }]}>
            {line.media.map((image) => (
              <MomentMediaTile key={image.id} item={image} />
            ))}
          </View>
          {data.collection.canWrite && (line.authorId === me || data.collection.ownerId === me) && (
            <View style={[styles.row, { flexWrap: 'wrap' }]}>
              {line.authorId === me && (
                <Button label="编辑" variant="quiet" onPress={() => open('edit', line)} />
              )}
              <Button
                label={line.authorId === me ? '撤回' : '移除'}
                variant="danger"
                onPress={() => open('withdraw', line)}
              />
              <Button
                label="版本记录"
                variant="quiet"
                onPress={() =>
                  void run(async () => {
                    const result = await request<{ history: Revision[] }>(
                      '/p1/contributions/' + line.id + '/history',
                    );
                    setRevisions(result.history);
                    open('history', line);
                  }, false)
                }
              />
            </View>
          )}
        </View>
      ))}
      {panel && (
        <Sheet
          title={{ add: '补充共同记录', edit: '编辑内容', withdraw: '移除内容', history: '版本记录' }[panel]}
          onClose={() => {
            if (!busy) setPanel(undefined);
          }}
        >
          {(panel === 'add' || panel === 'edit') && (
            <Field title="文字" multiline value={body} onChangeText={setBody} maxLength={2000} />
          )}
          {panel === 'add' && (
            <>
              <View style={styles.row}>
                <Button
                  label="图库选照片"
                  variant="soft"
                  disabled={busy || media.length >= 6}
                  onPress={() =>
                    void run(async () => {
                      const photos = await chooseMomentPhotos(me, 6 - media.length);
                      setMedia((previous) => [...previous, ...photos].slice(0, 6));
                    }, false)
                  }
                />
                <Button
                  label="选短视频"
                  variant="soft"
                  disabled={busy || media.length >= 6}
                  onPress={() =>
                    void run(async () => {
                      const video = await chooseMomentVideo();
                      if (video) setMedia((previous) => [...previous, video].slice(0, 6));
                    }, false)
                  }
                />
              </View>
              {media.map((file) => (
                <View style={styles.row} key={file.id}>
                  <DraftMediaTile item={file} />
                  <Button
                    label="移除这项"
                    variant="quiet"
                    disabled={busy}
                    onPress={() => setMedia((list) => list.filter((x) => x.id !== file.id))}
                  />
                </View>
              ))}
            </>
          )}
          {panel === 'history' &&
            revisions.map((version) => (
              <ListRow
                key={version.revision}
                title={'版本 ' + version.revision + ' · ' + revisionLabels[version.action]}
                detail={
                  (version.editor ?? '账号已注销') +
                  ' · ' +
                  formatTime(version.editedAt) +
                  (version.body ? '\n' + version.body : '')
                }
              />
            ))}
          {panel === 'withdraw' && <Text style={styles.muted}>正文和附件将从共同记录中撤下。</Text>}
          {!!error && <Notice>{error}</Notice>}
          {panel !== 'history' && (
            <Button
              label={progress || (panel === 'withdraw' ? '确认移除' : '保存记录')}
              variant={panel === 'withdraw' ? 'danger' : 'gradient'}
              disabled={busy || (panel === 'add' && !media.length && !body.trim())}
              onPress={() =>
                void run(async () => {
                  try {
                    if (panel === 'add') {
                      const ids = [];
                      for (const [index, file] of media.entries()) {
                        setProgress('上传 ' + (index + 1) + ' / ' + media.length);
                        let id = uploaded[file.id];
                        if (!id) {
                          const result = await request<{ media: Media }>('/moment-media', {
                            method: 'POST',
                            body: await encodeMomentMedia(file),
                          });
                          id = result.media.id;
                          setUploaded((cache) => ({ ...cache, [file.id]: id }));
                        }
                        ids.push(id);
                      }
                      await request('/p1/entries/' + id + '/contributions', {
                        method: 'POST',
                        body: { clientId, body, mediaIds: ids },
                      });
                    }
                    if (item && panel === 'edit')
                      await request('/p1/contributions/' + item.id, {
                        method: 'PATCH',
                        body: { body, revision: item.revision },
                      });
                    if (item && panel === 'withdraw')
                      await request('/p1/contributions/' + item.id, { method: 'DELETE' });
                    setPanel(undefined);
                  } finally {
                    setProgress('');
                  }
                })
              }
            />
          )}
        </Sheet>
      )}
    </Screen>
  );
}
