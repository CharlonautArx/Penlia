import { MaterialCard } from '../../components/ui';
import { useTogetherRouter } from '../together/navigation';
import { randomUUID } from 'expo-crypto';
import { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { Button, ListRow, Notice, Screen, Section, Sheet } from '../together/ui';
import { back, Choices, Field, useRecord } from '../social/ui';
import { MomentMediaGrid, type LocalMedia, type Media } from '../moments/media';
import { useSession } from '../../services/session';
import { space, styles } from '../../theme';
import { DateBadge, LifeLead, TimelineNode } from './Editorial';
import { AssetPicker, DataEmpty, MediaStrip, uploadAssets, type Project, type ProjectMember } from './ui';
import { ManageProjectPeople } from './project-people';

const categories = { sight: '景点', food: '美食', stay: '住宿', transit: '交通', other: '其他' };
type Category = keyof typeof categories;
type Stop = {
  id: string;
  title: string;
  category: Category;
  details: string;
  sourceUrl: string | null;
  eventDay: string;
  position: number;
  revision: number;
  author: string;
  authorId: string;
  media: Media[];
  support: number;
  myVote: boolean | null;
  savedItemId: string | null;
};
type Trip = Project & {
  destination: string;
  startDay: string;
  endDay: string;
  completedAt: string | null;
  journalId: string | null;
  revision: number;
};
type Detail = { trip: Trip; items: Stop[]; members: ProjectMember[]; myAgreement: boolean };
type Library = { items: { id: string; title: string; location: string; sourceUrl: string | null }[] };
export function TripScreen({ id }: { id: string }) {
  const router = useTogetherRouter();
  const { session } = useSession();
  const { data, error, busy, run, request, load } = useRecord<Detail>('/p2/trips/' + id, 20000);
  const me = session?.user.id;
  const [tripEditor, setTripEditor] = useState(false);
  const [editor, setEditor] = useState<Stop | 'new'>();
  const [confirm, setConfirm] = useState<'journal' | Stop>();
  const owner = me === data?.trip.ownerId;
  const cover = data?.items.flatMap((item) => item.media).find((item) => item.mime.startsWith('image/'));
  const doAction = (action: string, extra: Record<string, unknown> = {}) =>
    request<{ id?: string }>('/p2/trips/' + id + '/action', { method: 'POST', body: { action, ...extra } });
  return (
    <Screen
      title={data?.trip.title ?? '共同旅行'}
      back={back}
      refreshing={busy}
      onRefresh={() => void load()}
    >
      {!!error && (
        <Notice action="重试" onAction={() => void load()}>
          {error}
        </Notice>
      )}
      {!data && !error && <DataEmpty loading>暂无旅行。</DataEmpty>}
      {data && (
        <>
          <LifeLead title={data.trip.destination} detail={data.trip.completedAt ? '已完成' : '计划中'}
            icon="airplane-outline" tone="mint">
            <Text style={styles.body}>{data.trip.startDay} 至 {data.trip.endDay}</Text>
            {!!data.members.length && <Text style={styles.muted}>同行 · {data.members.filter((m) => m.state === 'active').map((m) => m.name).join('、')}</Text>}
          </LifeLead>
          {cover && <MomentMediaGrid media={[cover]} />}
          {owner && !data.trip.completedAt && (
            <Button label="编辑旅行信息" variant="soft" onPress={() => setTripEditor(true)} />
          )}
          {tripEditor && (
            <TripEditor
              trip={data.trip}
              onClose={() => {
                setTripEditor(false);
                void load();
              }}
            />
          )}
          {!data.trip.completedAt && (
            <Button label="添加行程" icon="add" variant="gradient" onPress={() => setEditor('new')} />
          )}
          {[...new Set(data.items.map((s) => s.eventDay))].map((day) => {
            const list = data.items.filter((s) => s.eventDay === day);
            const move = (index: number, step: number) => {
              const ids = list.map((s) => s.id);
              [ids[index], ids[index + step]] = [ids[index + step], ids[index]];
              void run(() => doAction('reorder', { eventDay: day, itemIds: ids }));
            };
            return (
              <View key={day} style={{ gap: space.xs }}>
                <View style={styles.row}><DateBadge date={day} /><Section title={day} /></View>
                {list.map((stop, index) => (
                  <TimelineNode key={stop.id} last={index === list.length - 1}>
                    <MaterialCard>
                    <Section title={stop.title} detail={categories[stop.category] + ' · ' + stop.author} />
                    {!!stop.details && <Text style={styles.body}>{stop.details}</Text>}
                    <MediaStrip media={stop.media} />
                    <View style={[styles.row, { flexWrap: 'wrap' }]}>
                      {stop.sourceUrl && (
                        <Button
                          label="打开人工保存的链接"
                          variant="quiet"
                          onPress={() => void run(() => Linking.openURL(stop.sourceUrl!), false)}
                        />
                      )}
                      {stop.savedItemId && (
                        <Button
                          label="查看已授权收藏"
                          variant="quiet"
                          onPress={() =>
                            router.push({ pathname: '/life/items', params: { item: stop.savedItemId! } })
                          }
                        />
                      )}
                    </View>
                    {!data.trip.completedAt && (
                      <View style={[styles.row, { flexWrap: 'wrap' }]}>
                        <Button
                          label={stop.myVote ? '撤回支持' : '支持该行程'}
                          variant="soft"
                          disabled={busy}
                          onPress={() =>
                            void run(() => doAction('vote', { itemId: stop.id, prefer: !stop.myVote }))
                          }
                        />
                        <Text style={styles.small}>{stop.support} 位支持</Text>
                        <Button label="编辑" variant="quiet" onPress={() => setEditor(stop)} />
                        {index > 0 && <Button label="上移" variant="quiet" onPress={() => move(index, -1)} />}
                        {index < list.length - 1 && (
                          <Button label="下移" variant="quiet" onPress={() => move(index, 1)} />
                        )}
                        {(owner || me === stop.authorId) && (
                          <Button label="移除" variant="danger" onPress={() => setConfirm(stop)} />
                        )}
                      </View>
                    )}
                    </MaterialCard>
                  </TimelineNode>
                ))}
              </View>
            );
          })}
          {!data.items.length && <DataEmpty loading={false}>还没有安排行程。</DataEmpty>}
          {data.trip.journalId ? (
            <Button
              label="打开共同日记"
              variant="gradient"
              onPress={() =>
                router.push({ pathname: '/collection/[id]', params: { id: data.trip.journalId! } })
              }
            />
          ) : (
            !data.trip.completedAt && (
              <>
                <Section title="旅行结束以后" />
                <Text style={styles.muted}>现有成员可以各自同意，发起者再把这段旅行关联到共同日记。</Text>
                <Button
                  label={data.myAgreement ? '撤回日记同意' : '同意关联共同日记'}
                  variant="soft"
                  disabled={busy}
                  onPress={() => void run(() => doAction('agree', { agree: !data.myAgreement }))}
                />
                {owner && (
                  <Button
                    label="完成旅行并创建共同日记"
                    variant="gradient"
                    disabled={busy}
                    onPress={() => setConfirm('journal')}
                  />
                )}
              </>
            )
          )}
          {data.trip.completedAt && (
            <Button
              label="保存旅行回忆"
              variant="soft"
              onPress={() =>
                router.push({
                  pathname: '/life/memories',
                  params: { from: id, sourceKind: 'trip', title: data.trip.title },
                })
              }
            />
          )}
          <ManageProjectPeople
            project={data.trip}
            members={data.members}
            locked={!!data.trip.completedAt}
            changed={() => void load()}
          />
          {editor && (
            <StopEditor
              trip={data.trip}
              initial={editor === 'new' ? undefined : editor}
              onClose={() => {
                setEditor(undefined);
                void load();
              }}
            />
          )}
        </>
      )}
      {confirm && (
        <Sheet
          title={confirm === 'journal' ? '创建共同日记' : '移除行程'}
          onClose={() => setConfirm(undefined)}
        >
          <Text style={styles.muted}>
            {confirm === 'journal'
              ? '确认后旅行将完成，日记仍需各成员主动接受邀请。'
              : '移除此行程及其附件。'}
          </Text>
          {!!error && <Notice>{error}</Notice>}
          <Button
            label="确认"
            variant={confirm === 'journal' ? 'gradient' : 'danger'}
            disabled={busy}
            onPress={() =>
              void run(async () => {
                await (confirm === 'journal'
                  ? doAction('journal', { confirmed: true })
                  : doAction('delete', { itemId: confirm.id }));
                setConfirm(undefined);
              })
            }
          />
        </Sheet>
      )}
    </Screen>
  );
}

function StopEditor({ trip, initial, onClose }: { trip: Trip; initial?: Stop; onClose: () => void }) {
  const { session } = useSession();
  const { data: library, request, run, busy, error } = useRecord<Library>('/p2/items?kind=saved');
  const [clientId] = useState(randomUUID);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [day, setDay] = useState(initial?.eventDay ?? trip.startDay);
  const [category, setCategory] = useState<Category>(initial?.category ?? 'sight');
  const [details, setDetails] = useState(initial?.details ?? '');
  const [link, setLink] = useState(initial?.sourceUrl ?? '');
  const [reference, setReference] = useState(initial?.savedItemId ?? '');
  const [picker, setPicker] = useState(false);
  const [media, setMedia] = useState<Media[]>(initial?.media ?? []);
  const [drafts, setDrafts] = useState<LocalMedia[]>([]);
  const controlsMedia = !initial || initial.authorId === session?.user.id || !initial.media.length;
  return (
    <Sheet title={initial ? '编辑行程' : '添加行程'} onClose={onClose}>
      <Field title="行程名称" value={title} onChangeText={setTitle} />
      <Field title="发生日期" value={day} onChangeText={setDay} />
      <Choices labels={categories} value={category} set={setCategory} />
      <Field title="行程备注" value={details} onChangeText={setDetails} multiline />
      <Field title="参考链接（选填）" keyboardType="url" value={link} onChangeText={setLink} />
      <Button
        label={reference ? '更改关联收藏' : '关联我的收藏'}
        variant="soft"
        onPress={() => setPicker(!picker)}
      />
      {picker &&
        library?.items.map((item) => (
          <ListRow
            key={item.id}
            title={item.title}
            detail={item.location}
            onPress={() => {
              setReference(item.id);
              setTitle((prior) => prior || item.title);
              setPicker(false);
            }}
          />
        ))}
      {controlsMedia && (
        <AssetPicker
          drafts={drafts}
          change={setDrafts}
          limit={4}
          existing={media}
          updateExisting={setMedia}
        />
      )}
      {!!error && <Notice>{error}</Notice>}
      <Button
        label="保存行程"
        variant="gradient"
        disabled={busy || !title.trim()}
        onPress={() =>
          void run(async () => {
            const ids = controlsMedia ? await uploadAssets(request, media, drafts) : undefined;
            await request('/p2/trips/' + trip.id + '/itinerary' + (initial ? '/' + initial.id : ''), {
              method: initial ? 'PATCH' : 'POST',
              body: {
                title,
                eventDay: day,
                category,
                details,
                sourceUrl: link,
                savedItemId: reference || undefined,
                clientId,
                revision: initial?.revision,
                mediaIds: ids,
              },
            });
            onClose();
          }, false)
        }
      />
    </Sheet>
  );
}

function TripEditor({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const { request, busy, error, run } = useRecord('/p2/trips/' + trip.id);
  const [title, setTitle] = useState(trip.title);
  const [place, setPlace] = useState(trip.destination);
  const [start, setStart] = useState(trip.startDay);
  const [end, setEnd] = useState(trip.endDay);
  return (
    <Sheet title="编辑旅行信息" onClose={onClose}>
      <Field title="名称" value={title} onChangeText={setTitle} />
      <Field title="目的地" value={place} onChangeText={setPlace} />
      <Field title="出发日期" value={start} onChangeText={setStart} />
      <Field title="结束日期" value={end} onChangeText={setEnd} />
      {!!error && <Notice>{error}</Notice>}
      <Button
        label="保存旅行"
        variant="gradient"
        disabled={busy || !title.trim() || !place.trim()}
        onPress={() =>
          void run(async () => {
            await request('/p2/trips/' + trip.id, {
              method: 'PATCH',
              body: { title, destination: place, startDay: start, endDay: end, revision: trip.revision },
            });
            onClose();
          }, false)
        }
      />
    </Sheet>
  );
}
