import { MaterialCard } from '../../components/ui';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityDiscussion } from '../../features/together/ActivityDiscussion';
import { InvitationFormScroll } from '../../features/together/InvitationFormScroll';
import { ShareInvitation } from '../../features/together/ShareInvitation';
import { LocationBubble } from '../../features/media/LocationCard';
import { chooseCover } from '../../features/together/cover';
import { useTogether, useTogetherRouter } from '../../features/together/navigation';
import { randomUUID } from 'expo-crypto';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import {
  Button,
  Invitation,
  Empty,
  ListRow,
  Notice,
  Screen,
  Section,
  Sheet,
} from '../../features/together/ui';
import {
  back,
  categories,
  CheckRow,
  Choices,
  Field,
  formatTime,
  InviteChoices,
  useRecord,
  type Category,
} from '../../features/social/ui';
import { gatheringStart } from '../../features/social/gathering-time';
import { GatheringTimeFields } from '../../features/social/GatheringTimeFields';
import { useSession } from '../../services/session';
import { styles } from '../../theme';
import { LifeLead } from '../../features/life/Editorial';

type Mode = 'all' | 'open';
type Intention = 'interested' | 'undecided' | 'unavailable';
type Option = { id: string; startsAt: string; endsAt?: string; place: string };
const modeNames = { all: '全员局', open: '自由局' };
const intentions = { interested: '有兴趣', undecided: '还没决定', unavailable: '这次不方便' };
const stateNames = {
  interest: '匿名意向',
  confirming: '自愿确认',
  formed: '已成局',
  completed: '已完成',
  cancelled: '已取消',
};
type Detail = {
  gathering: {
    id: string;
    ownerId: string;
    title: string;
    category: Category;
    mode: Mode;
    minimum: number;
    state: keyof typeof stateNames;
    choiceId: string | null;
    ballotClosed: boolean;
    directProposal: boolean;
    intention: Intention | null;
    votes: string[];
    confirmed: boolean;
    revision?: number;
    description?: string;
    meetingNote?: string;
    cover?: string;
    inCalendar?: boolean;
    capacity?: number;
    reminderMinutes?: number;
    allowCompanion?: boolean;
    waitingAt?: string;
    offered?: boolean;
    privateNote?: string;
    decision?: string;
    agreedChoice?: string;
    choices?: string[];
    answer?: string;
    preparation?: string;
    journalId?: string;
    checklist?: { id: string; title: string };
    source?: {
      id: string;
      title: string;
      latitude: number | null;
      longitude: number | null;
      location: string;
    };
  };
  updates?: { id: string; kind: string; createdAt: string }[];
  options: Option[];
  attendees: { id: string; name: string }[];
  roster?: { id: string; name: string; note?: string; preparation?: string }[];
  suggestion?: string;
};

export default function GatheringScreen() {
  const { id, friend, category, title, place } = useLocalSearchParams<{
    id: string;
    friend?: string;
    category?: Category;
    title?: string;
    place?: string;
  }>();
  return id === 'new' ? (
    <GatheringForm friend={friend} category={category} title={title} place={place} />
  ) : (
    <GatheringDetail id={id} />
  );
}

type DraftOption = { time: string; place: string; duration?: string };
const blank = (): DraftOption => ({ time: '', place: '' });
function OptionsEditor({ items, set }: { items: DraftOption[]; set: (items: DraftOption[]) => void }) {
  const together = useTogether();
  return (
    <View style={{ gap: 10 }}>
      {items.map((option, index) => (
        <MaterialCard key={index}>
          <Section title={'候选 ' + (index + 1)} />
          <GatheringTimeFields value={option.time}
            change={(time) => set(items.map((item, i) => (i === index ? { ...item, time } : item)))} />
          <Field
            title="见面地点"
            value={option.place}
            onChangeText={(place) => set(items.map((item, i) => (i === index ? { ...item, place } : item)))}
          />
          {together && (
            <Field
              title="预计时长（分钟，可稍后确定）"
              value={option.duration ?? ''}
              keyboardType="number-pad"
              onChangeText={(duration) =>
                set(items.map((item, i) => (i === index ? { ...item, duration } : item)))
              }
            />
          )}
          {items.length > 1 && (
            <Button
              label="移除此候选"
              variant="quiet"
              onPress={() => set(items.filter((_, i) => i !== index))}
            />
          )}
        </MaterialCard>
      ))}
      {items.length < 8 && (
        <Button label="添加候选时间" variant="soft" icon="add" onPress={() => set([...items, blank()])} />
      )}
    </View>
  );
}
const payload = (items: DraftOption[]) =>
  items.map(({ time, place, duration }) => {
    const startsAt = gatheringStart(time);
    if (duration && (!/^\d+$/.test(duration) || Number(duration) < 1 || Number(duration) > 44640))
      throw new Error('请输入 1 至 44640 分钟的活动时长。');
    return {
      startsAt,
      place,
      endsAt: duration ? new Date(Date.parse(startsAt) + Number(duration) * 60000).toISOString() : undefined,
    };
  });

function GatheringForm({
  friend,
  category,
  title,
  place,
}: {
  friend?: string;
  category?: Category;
  title?: string;
  place?: string;
}) {
  const router = useTogetherRouter();
  const { run, busy, error, request } = useRecord('/p1/gatherings');
  const together = useTogether();
  const { session } = useSession();
  const { source, again } = useLocalSearchParams<{ source?: string; again?: string }>();
  const key =
    session && together
      ? 'together-gathering-draft-v1:' + session.user.id + ':' + (again || source || friend || 'new')
      : '';
  const [clientId, setClientId] = useState(randomUUID);
  const [description, setDescription] = useState('');
  const [meetingNote, setMeetingNote] = useState('');
  const [cover, setCover] = useState('');
  const [capacity, setCapacity] = useState('');
  const [decision, setDecision] = useState('');
  const [labels, setLabels] = useState('');
  const [companion, setCompanion] = useState(false);
  const [sourceTitle, setSourceTitle] = useState('');
  const [sourceId, setSourceId] = useState(source);
  const [checklist, setChecklist] = useState('');
  const [lists, setLists] = useState<{ id: string; title: string }[]>([]);
  const [advanced, setAdvanced] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [schedule, setSchedule] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('');
  const [name, setName] = useState(title ?? '');
  const [kind, setKind] = useState<Category>(category && category in categories ? category : 'food');
  const [mode, setMode] = useState<Mode>('open');
  const [minimum, setMinimum] = useState('2');
  const [ids, setIds] = useState(friend ? [friend] : []);
  const [groupId, setGroupId] = useState('');
  const [items, setItems] = useState<DraftOption[]>([{ time: '', place: place ?? '' }]);
  useEffect(() => {
    if (!key) return;
    let live = true;
    (async () => {
      if (source) {
        const { item } = await request<{ item: { title: string } }>('/p2/items/' + source);
        if (live) setSourceTitle(item.title);
      }
      const stored = await AsyncStorage.getItem(key);
      if (!live) return;
      if (stored) {
        const draft = JSON.parse(stored);
        setName(draft.name);
        setKind(draft.kind);
        setMode(draft.mode);
        setMinimum(draft.minimum);
        setIds(draft.ids);
        setGroupId(draft.groupId);
        setItems(draft.items);
        setClientId(draft.clientId);
        setDescription(draft.description);
        setMeetingNote(draft.meetingNote);
        setCover(draft.cover);
        setAdvanced(draft.advanced);
        setSchedule(draft.schedule);
        setCapacity(draft.capacity);
        setChecklist(draft.checklist ?? '');
        setSourceId(draft.sourceId ?? source);
        setDecision(draft.decision ?? '');
        setLabels(draft.labels ?? '');
        setCompanion(!!draft.companion);
      } else if (again) {
        const previous = await request<Detail>('/p1/gatherings/' + again);
        if (!live) return;
        setChecklist(previous.gathering.checklist?.id ?? '');
        setSourceId(previous.gathering.source?.id);
        setSourceTitle(previous.gathering.source?.title ?? '');
        setName(previous.gathering.title);
        setKind(previous.gathering.category);
        if (previous.gathering.ownerId === session?.user.id) {
          setCover(previous.gathering.cover ?? '');
          setMeetingNote(
            previous.gathering.meetingNote ||
              previous.options.find((o) => o.id === previous.gathering.choiceId)?.place ||
              '',
          );
        }
      }
    })()
      .catch(() => {
        if (live) setMessage('暂时无法恢复邀请内容。');
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, [key, again, source, request, session?.user.id]);
  const saveDraft = async () => {
    if (!key) return;
    await AsyncStorage.setItem(
      key,
      JSON.stringify({
        clientId,
        name,
        kind,
        mode,
        minimum,
        ids,
        groupId,
        items,
        description,
        meetingNote,
        cover,
        advanced,
        schedule,
        capacity,
        decision,
        labels,
        companion,
        checklist,
        sourceId,
      }),
    );
    setMessage('草稿已保存在本机。');
  };
  return (
    <Screen
      title="发起约局"
      back={back}
      renderScroll={together && Platform.OS === 'android' ? (props) => <InvitationFormScroll {...props} /> : undefined}
    >
      {together && (
        <>
          <Invitation title={name.trim() || '发起约局'} detail={categories[kind]} cover={cover} />
          <Button
            label={cover ? '更换封面' : '选择活动封面'}
            icon="image-outline"
            variant="soft"
            disabled={busy || !ready}
            onPress={() =>
              void run(async () => {
                const image = await chooseCover();
                if (image) setCover(image);
              }, false)
            }
          />
        </>
      )}
      {!together && <Choices labels={categories} value={kind} set={setKind} />}
      <Field title="活动名称" value={name} maxLength={80} onChangeText={setName} />
      {together && (
        <>
          {!!sourceTitle && <ListRow title="引用地点" detail={sourceTitle} />}
          <Field
            title="活动说明（选填）"
            value={description}
            multiline
            maxLength={800}
            onChangeText={setDescription}
          />
          <Field
            title="集合地点或说明（选填）"
            value={meetingNote}
            maxLength={240}
            onChangeText={setMeetingNote}
          />
          <Button
            label={schedule ? '收起候选时间' : '添加候选时间'}
            variant="soft"
            onPress={() => setSchedule(!schedule)}
          />
          <Button
            label={advanced ? '收起活动设置' : '更多活动设置'}
            variant="quiet"
            onPress={() => {
              setAdvanced(!advanced);
              if (!advanced)
                void run(async () => {
                  const result = await request<{ spaces: { id: string; title: string; state: string }[] }>(
                    '/p2/spaces?kind=list',
                  );
                  setLists(result.spaces.filter((s) => s.state !== 'invited'));
                }, false);
            }}
          />
        </>
      )}
      {(!together || advanced) && (
        <>
          {together && (
            <>
              <Choices labels={categories} value={kind} set={setKind} />
              <Field
                title="人数上限（选填）"
                value={capacity}
                keyboardType="number-pad"
                onChangeText={setCapacity}
              />
            </>
          )}
          {together && (
            <>
              {!!lists.length && (
                <>
                  <Section title="关联共同清单" />
                  {lists.map((list) => (
                    <CheckRow
                      key={list.id}
                      label={list.title}
                      selected={checklist === list.id}
                      action={() => setChecklist(checklist === list.id ? '' : list.id)}
                    />
                  ))}
                </>
              )}
              <CheckRow
                label="允许携伴（同行者没有内容访问权）"
                selected={companion}
                action={() => setCompanion(!companion)}
              />
              <Field
                title="一起商量的问题（选填）"
                value={decision}
                onChangeText={setDecision}
                maxLength={100}
              />
              {!!decision && (
                <Field
                  title="备选项（每行一个，2 至 5 项）"
                  multiline
                  value={labels}
                  onChangeText={setLabels}
                />
              )}
            </>
          )}
          <Choices labels={modeNames} value={mode} set={setMode} />
          <Text style={styles.muted}>
            {mode === 'all' ? '所有受邀者确认参加才成局。' : '达到最低参加人数即可成局。'}
          </Text>
          {mode === 'open' && (
            <Field
              title="最低人数（含发起者）"
              value={minimum}
              keyboardType="number-pad"
              onChangeText={setMinimum}
            />
          )}
        </>
      )}
      {(!together || schedule) && <OptionsEditor items={items} set={setItems} />}
      {together ? (
        <>
          <ListRow
            title="邀请对象"
            detail={
              ids.length || groupId
                ? [ids.length ? ids.length + ' 位好友' : '', groupId ? '已选好友组' : '']
                    .filter(Boolean)
                    .join(' · ')
                : '选择好友或好友组'
            }
            onPress={() => setChoosing(true)}
          />
          {choosing && (
            <Sheet
              title="邀请对象"
              onClose={() => setChoosing(false)}
              footer={<Button label="完成选择" onPress={() => setChoosing(false)} />}
            >
              <InviteChoices portraits ids={ids} setIds={setIds} groupId={groupId} setGroupId={setGroupId} />
            </Sheet>
          )}
        </>
      ) : (
        <InviteChoices portraits ids={ids} setIds={setIds} groupId={groupId} setGroupId={setGroupId} />
      )}
      {!!message && <Notice>{message}</Notice>}
      {together && (
        <Button
          label="保存草稿"
          variant="soft"
          disabled={!ready || busy}
          onPress={() => void run(saveDraft, false)}
        />
      )}
      {!!error && <Notice>{error}</Notice>}
      <Button
        label={together ? '邀请朋友商量' : '发送邀请'}
        variant="gradient"
        disabled={busy || (together && !ready) || !name.trim() || (!ids.length && !groupId)}
        onPress={() =>
          void run(async () => {
            const value = await request<{ id: string }>('/p1/gatherings', {
              method: 'POST',
              body: {
                clientId,
                title: name,
                category: kind,
                mode,
                minimum: Number(minimum),
                memberIds: ids,
                groupId: groupId || undefined,
                options: payload(
                  together ? items.filter((item) => item.time.trim() || item.duration?.trim()) : items,
                ),
                ...(together && {
                  planning: true,
                  decision,
                  choices: decision
                    ? labels
                        .split(/\n/)
                        .map((s) => s.trim())
                        .filter(Boolean)
                    : [],
                  allowCompanion: companion,
                  description,
                  meetingNote: meetingNote || place || '',
                  cover: cover || undefined,
                  capacity: capacity ? Number(capacity) : undefined,
                  source: sourceId,
                  checklistId: checklist || undefined,
                }),
              },
            });
            if (key) await AsyncStorage.removeItem(key);
            router.replace({ pathname: '/gathering/[id]', params: { id: value.id } });
          }, false)
        }
      />
    </Screen>
  );
}

function GatheringDetail({ id }: { id: string }) {
  const router = useTogetherRouter();
  const together = useTogether();
  const [actions, setActions] = useState(false);
  const [responses, setResponses] = useState(false);
  const [note, setNote] = useState('');
  const [withGuest, setWithGuest] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [managing, setManaging] = useState(false);
  const [editor, setEditor] = useState<{
    revision: number;
    title: string;
    description: string;
    meetingNote: string;
    cover: string;
  }>();
  const [photoError, setPhotoError] = useState('');
  const [invited, setInvited] = useState<string[]>([]);
  const [group, setGroup] = useState('');
  const base = '/p1/gatherings/' + id;
  const { data, busy, error, run, request, load } = useRecord<Detail>(base, 15000);
  const { session } = useSession();
  const [intent, setIntent] = useState<Intention>('undecided');
  const [votes, setVotes] = useState<string[]>([]);
  const [choice, setChoice] = useState('');
  const [availability, setAvailability] = useState(false);
  const [panel, setPanel] = useState<'reschedule' | 'propose' | 'cancel'>();
  const [options, setOptions] = useState([blank()]);
  const g = data?.gathering;
  const myVotes = g?.votes.join(',') ?? '';
  const myIntention = g?.intention ?? 'undecided';
  useEffect(() => {
    setIntent(myIntention);
    setVotes(myVotes ? myVotes.split(',') : []);
  }, [id, myIntention, myVotes]);
  const host = g?.ownerId === session?.user.id;
  const post = (path: string, body: Record<string, unknown>) =>
    request(base + '/' + path, { method: 'POST', body });
  const personal = (action: string, extra: Record<string, unknown> = {}) =>
    void run(() => post('personal', { action, ...extra }));
  const organize = (action: string, extra: Record<string, unknown> = {}) =>
    void run(() => post('organize', { action, ...extra }));
  if (!g || !data)
    return (
      <Screen title="约局" back={back}>
        {error ? (
          <Notice action="重试" onAction={() => void load()}>
            {error}
          </Notice>
        ) : (
          <Empty busy>正在读取约局…</Empty>
        )}
      </Screen>
    );
  const selected = data.options.find((item) => item.id === g.choiceId);
  const suggestion = data.options.find((item) => item.id === data.suggestion);
  return (
    <Screen title="约局详情" back={back} refreshing={busy} onRefresh={() => void load()}>
      {together ? (
        <>
          <Invitation
            title={g.title}
            detail={g.directProposal && g.state === 'interest' ? '待商量' : stateNames[g.state]}
            cover={g.cover}
          />
          <Section title={selected ? formatTime(selected.startsAt) : '时间待商量'} />
          {!!selected?.endsAt && <Text style={styles.muted}>至 {formatTime(selected.endsAt)}</Text>}
          <Text style={styles.body}>{selected?.place || g.meetingNote || '地点待商量'}</Text>
          {!!selected?.place && !!g.meetingNote && <Text style={styles.muted}>{g.meetingNote}</Text>}
          {!!g.description && <Text style={styles.body}>{g.description}</Text>}
          {g.checklist && (
            <ListRow
              title="共同清单"
              detail={g.checklist.title}
              onPress={() =>
                router.push({ pathname: '/life/project/[id]', params: { kind: 'list', id: g.checklist!.id } })
              }
            />
          )}
          {g.source &&
            (g.source.latitude != null && g.source.longitude != null ? (
              <LocationBubble
                value={{
                  latitude: g.source.latitude,
                  longitude: g.source.longitude,
                  name: g.source.title,
                  address: g.source.location,
                }}
              />
            ) : (
              <ListRow title={g.source.title} detail={g.source.location || '地点记录'} />
            ))}
          {!!g.agreedChoice && (
            <ListRow title={g.decision ?? '活动内选择'} detail={'共同建议 · ' + g.agreedChoice} />
          )}
          <Button
            label="活动操作"
            icon="ellipsis-horizontal"
            variant="soft"
            onPress={() => setActions(true)}
          />
          {actions && (
            <Sheet title="活动操作" onClose={() => setActions(false)}>
              <Button
                label="预览分享内容"
                variant="soft"
                icon="share-outline"
                onPress={() => {
                  setActions(false);
                  setSharing(true);
                }}
              />
              <Button
                label="再约一次"
                variant="quiet"
                onPress={() => router.push({ pathname: '/gathering/new', params: { again: id } })}
              />
              {host && g.state === 'interest' && !g.ballotClosed && (
                <Button
                  label="编辑邀请"
                  variant="soft"
                  onPress={() => {
                    setEditor({
                      revision: g.revision ?? 1,
                      title: g.title,
                      description: g.description ?? '',
                      meetingNote: g.meetingNote ?? '',
                      cover: g.cover ?? '',
                    });
                    setPhotoError('');
                    setActions(false);
                  }}
                />
              )}
              {host && (
                <Button
                  label="管理邀请"
                  variant="soft"
                  onPress={() => {
                    setActions(false);
                    setManaging(true);
                  }}
                />
              )}
            </Sheet>
          )}
          {editor && (
            <Sheet title="编辑邀请" onClose={() => setEditor(undefined)} avoidKeyboard>
              <Field
                title="活动名称"
                value={editor.title}
                maxLength={80}
                onChangeText={(title) => setEditor({ ...editor, title })}
              />
              <Field
                title="活动说明"
                value={editor.description}
                maxLength={800}
                multiline
                onChangeText={(description) => setEditor({ ...editor, description })}
              />
              <Field
                title="集合说明"
                value={editor.meetingNote}
                maxLength={240}
                multiline
                onChangeText={(meetingNote) => setEditor({ ...editor, meetingNote })}
              />
              <Invitation title={editor.title} detail="封面预览" cover={editor.cover} />
              <Button
                label="更换活动封面"
                variant="soft"
                onPress={() =>
                  void chooseCover()
                    .then((cover) => {
                      if (cover) setEditor((current) => current && { ...current, cover });
                    })
                    .catch((e) => setPhotoError(e instanceof Error ? e.message : '无法读取封面。'))
                }
              />
              {!!editor.cover && (
                <Button
                  label="移除封面"
                  variant="quiet"
                  onPress={() => setEditor({ ...editor, cover: '' })}
                />
              )}
              {!!(photoError || error) && <Notice>{photoError || error}</Notice>}
              <Button
                label="保存邀请"
                disabled={busy || !editor.title.trim()}
                onPress={() =>
                  void run(async () => {
                    await post('details', editor);
                    setEditor(undefined);
                  })
                }
              />
            </Sheet>
          )}
          {sharing && <ShareInvitation id={id} title={g.title} close={() => setSharing(false)} />}
          {managing && (
            <Sheet title="管理邀请" onClose={() => setManaging(false)}>
              {data.roster?.map((person) => (
                <MaterialCard key={person.id}>
                  <ListRow title={person.name} detail={person.note || undefined} />
                  {person.preparation && (
                    <Button
                      label="取消共同筹备"
                      variant="quiet"
                      disabled={busy}
                      onPress={() => personal('remove-role', { userId: person.id })}
                    />
                  )}
                  {!person.preparation && (
                    <Button
                      label="邀请共同筹备"
                      variant="soft"
                      disabled={busy}
                      onPress={() => personal('offer-role', { userId: person.id })}
                    />
                  )}
                  {!['completed', 'cancelled'].includes(g.state) && (
                    <Button
                      label="移除邀请"
                      variant="quiet"
                      disabled={busy}
                      onPress={() => void run(() => post('roster', { action: 'remove', userId: person.id }))}
                    />
                  )}
                </MaterialCard>
              ))}
              {!['completed', 'cancelled'].includes(g.state) && (
                <>
                  <InviteChoices portraits ids={invited} setIds={setInvited} groupId={group} setGroupId={setGroup} />
                  {!!error && <Notice>{error}</Notice>}
                  <Button
                    label="补发邀请"
                    disabled={busy || (!invited.length && !group)}
                    onPress={() =>
                      void run(async () => {
                        await post('roster', {
                          action: 'invite',
                          memberIds: invited,
                          groupId: group || undefined,
                        });
                        setManaging(false);
                        setInvited([]);
                        setGroup('');
                      })
                    }
                  />
                </>
              )}
            </Sheet>
          )}
          {g.preparation === 'invited' && (
            <>
              <Text style={styles.body}>发起人邀请你协助补充候选时间。</Text>
              <Button label="接受共同筹备" onPress={() => personal('role', { accept: true })} />
              <Button label="婉拒" variant="quiet" onPress={() => personal('role', { accept: false })} />
            </>
          )}
          {(host || g.preparation === 'accepted') && !data.options.length && g.state === 'interest' && (
            <Button label="补充候选时间" onPress={() => setPanel('propose')} />
          )}
          {g.confirmed && selected?.endsAt && ['confirming', 'formed'].includes(g.state) && (
            <Button
              label={g.inCalendar ? '移出我的日程' : '加入我的私人日程'}
              variant="soft"
              disabled={busy}
              onPress={() => void run(() => post('calendar', { enabled: !g.inCalendar }))}
            />
          )}
          {!['cancelled', 'completed'].includes(g.state) && (
            <>
              <Button
                label="我的私密选择"
                variant="quiet"
                onPress={() => {
                  setNote(g.privateNote ?? '');
                  setResponses(true);
                }}
              />
              {responses && (
                <Sheet title="我的私密选择" avoidKeyboard onClose={() => setResponses(false)}>
                  {!!g.decision && g.state === 'interest' && !g.ballotClosed && (
                    <>
                      <Section title={g.decision} />
                      {g.choices?.map((option) => (
                        <CheckRow
                          key={option}
                          label={option}
                          selected={g.answer === option}
                          action={() => personal('answer', { answer: g.answer === option ? null : option })}
                        />
                      ))}
                      <Text style={styles.muted}>
                        个人选项仅自己可见。正式提议时间后，至少三位受邀好友同选才会显示共同建议。
                      </Text>
                    </>
                  )}
                  <Field
                    title="给发起人的私密备注（选填）"
                    maxLength={240}
                    multiline
                    value={note}
                    onChangeText={setNote}
                  />
                  <Text style={styles.muted}>仅你和活动发起人可见。</Text>
                  <Button label="保存备注" disabled={busy} onPress={() => personal('note', { note })} />
                  {g.confirmed && selected && (
                    <>
                      <Section title="活动前站内提醒" />
                      {[
                        [null, '关闭'],
                        [15, '提前 15 分钟'],
                        [60, '提前 1 小时'],
                        [1440, '提前 1 天'],
                      ].map(([minutes, label]) => (
                        <CheckRow
                          key={String(label)}
                          label={String(label)}
                          selected={(g.reminderMinutes ?? null) === minutes}
                          action={() => personal('reminder', { minutes })}
                        />
                      ))}
                    </>
                  )}
                  {!!error && <Notice>{error}</Notice>}
                </Sheet>
              )}
            </>
          )}
          <ActivityDiscussion id={id} ended={g.state === 'cancelled' || g.state === 'completed'}/>
          {!!data.updates?.length && (
            <>
              <Section title="活动通知" />
              {data.updates.map((update) => (
                <ListRow
                  key={update.id}
                  title={update.kind === 'gathering_invited' ? '收到这次邀请' : '活动有更新'}
                  detail={formatTime(update.createdAt)}
                />
              ))}
            </>
          )}
          {g.journalId && (
            <>
              <Button
                label="活动日记与留言"
                onPress={() => router.push({ pathname: '/collection/[id]', params: { id: g.journalId! } })}
              />
              <Button
                label="共同照片"
                variant="soft"
                onPress={() =>
                  router.push({ pathname: '/collection/[id]', params: { id: g.journalId!, album: '1' } })
                }
              />
            </>
          )}
          {host &&
            !g.journalId &&
            g.state === 'formed' &&
            selected &&
            Date.parse(selected.startsAt) <= Date.now() && (
              <Button
                label="建立活动日记"
                onPress={() =>
                  router.push({
                    pathname: '/collection/new',
                    params: { kind: 'journal', from: id, title: g.title, live: '1' },
                  })
                }
              />
            )}
        </>
      ) : (
        <LifeLead
          title={g.title}
          icon="calendar-clear-outline"
          tone="rose"
          detail={g.state === 'interest' && g.directProposal ? '直接提议时间' : stateNames[g.state]}
        >
          <Text style={styles.muted}>
            {modeNames[g.mode]}
            {g.mode === 'open' ? ' · 至少 ' + g.minimum + ' 人参加' : ''}
          </Text>
          {selected && (
            <Text style={styles.strong}>
              {formatTime(selected.startsAt)} · {selected.place}
            </Text>
          )}
        </LifeLead>
      )}
      {['interest', 'confirming', 'formed'].includes(g.state) && (
        <Button
          label={availability ? '隐藏空闲参考' : '查看空闲参考'}
          icon="calendar-outline"
          variant="soft"
          onPress={() => setAvailability(!availability)}
        />
      )}
      {availability && <Availability id={id} options={data.options} />}
      {host && g.category === 'travel' && ['formed', 'completed'].includes(g.state) && (
        <Button
          label="转为共同旅行"
          variant="soft"
          onPress={() =>
            router.push({ pathname: '/life/projects', params: { kind: 'trip', from: g.id, title: g.title } })
          }
        />
      )}
      {g.state === 'completed' && g.confirmed && (
        <Button
          label="保存为共同回忆"
          variant="soft"
          onPress={() =>
            router.push({
              pathname: '/life/memories',
              params: { from: g.id, sourceKind: 'gathering', title: g.title },
            })
          }
        />
      )}
      {g.state === 'interest' && (
        <>
          <Section title={g.directProposal ? '直接提议时间' : '匿名意向'} />
          {g.directProposal ? (
            <Text style={styles.muted}>
              {host ? '选一个时间发给朋友，请他们自愿确认。' : '等发起者提议时间后，你可以自愿确认。'}
            </Text>
          ) : (
            <>
              <Text style={styles.muted}>选择仅本人可见。封票后，票数和个人选择仍保密。</Text>
              {!g.ballotClosed ? (
                <Choices labels={intentions} value={intent} set={setIntent} />
              ) : (
                <Text style={styles.muted}>本轮意向已结束。</Text>
              )}
            </>
          )}
          {data.options.map((item) => (
            <MaterialCard key={item.id}>
              <Text style={styles.strong}>{formatTime(item.startsAt)}</Text>
              <Text style={styles.muted}>
                {item.place || '地点待商量'}
                {item.endsAt ? ' · 至 ' + formatTime(item.endsAt) : ''}
              </Text>
              {!g.directProposal && !g.ballotClosed && intent !== 'unavailable' && (
                <CheckRow
                  label="这个时间方便"
                  selected={votes.includes(item.id)}
                  action={() =>
                    setVotes((last) =>
                      last.includes(item.id) ? last.filter((key) => key !== item.id) : [...last, item.id],
                    )
                  }
                />
              )}
              {host && (
                <CheckRow
                  label={g.directProposal ? '选择要提议的时间' : '选择为正式时间'}
                  selected={choice === item.id}
                  action={() => setChoice(item.id)}
                />
              )}
            </MaterialCard>
          ))}
          {!g.directProposal && !g.ballotClosed && (
            <Button
              label={g.intention ? '更新我的意向' : '提交我的意向'}
              disabled={busy}
              onPress={() => void run(() => post('intention', { intention: intent, optionIds: votes }))}
            />
          )}
          {host && (
            <>
              {!g.directProposal && !g.ballotClosed && (
                <Button
                  label="结束匿名意向并查看建议"
                  variant="soft"
                  disabled={busy}
                  onPress={() => organize('seal')}
                />
              )}
              {!g.directProposal && g.ballotClosed && (
                <Notice>
                  {suggestion
                    ? '推荐 ' + formatTime(suggestion.startsAt) + ' · ' + suggestion.place
                    : '本轮没有可公开的推荐时间。'}
                </Notice>
              )}
              <Button
                label={g.directProposal ? '提议时间并开放确认' : '公布时间并开放确认'}
                variant="gradient"
                disabled={!choice || busy}
                onPress={() => organize('choose', { optionId: choice })}
              />
            </>
          )}
        </>
      )}
      {['confirming', 'formed'].includes(g.state) && (
        <>
          <Section title="自愿确认" />
          {g.state === 'confirming' && (
            <Text style={styles.muted}>
              {g.mode === 'all' ? '暂时没找到大家都方便的时间。' : '活动尚未达到成局条件。'}
            </Text>
          )}
          {together && !host && !g.confirmed && (
            <>
              {g.allowCompanion && (
                <CheckRow label="携一位同行者" selected={withGuest} action={() => setWithGuest(!withGuest)} />
              )}
              {!!g.capacity && (
                <Button
                  label={g.offered ? '已有名额，可自行确认' : g.waitingAt ? '退出候补' : '自愿候补'}
                  disabled={g.offered || busy}
                  variant="soft"
                  onPress={() => personal('wait', { join: !g.waitingAt })}
                />
              )}
            </>
          )}
          {!host && (
            <Button
              label={g.confirmed ? '撤回参加确认' : '确认参加'}
              variant={g.confirmed ? 'soft' : 'gradient'}
              disabled={busy}
              onPress={() =>
                void run(() =>
                  post('confirm', { attend: !g.confirmed, companion: withGuest, choiceId: g.choiceId }),
                )
              }
            />
          )}
          {host && (
            <Button
              label="重新选择时间"
              variant="soft"
              disabled={busy}
              onPress={() => setPanel('reschedule')}
            />
          )}
        </>
      )}
      {['formed', 'completed'].includes(g.state) && (
        <>
          <Section title="已确认参加" />
          {data.attendees.map((person) => (
            <ListRow key={person.id} title={person.name} />
          ))}
        </>
      )}
      {host && g.state === 'formed' && (
        <Button label="标记活动已结束" variant="soft" disabled={busy} onPress={() => organize('complete')} />
      )}
      {host && g.state === 'completed' && (
        <Button
          label="建立共同日记"
          variant="gradient"
          onPress={() =>
            router.push({
              pathname: '/collection/new',
              params: { kind: 'journal', from: g.id, title: g.title, ...(together && { live: '1' }) },
            })
          }
        />
      )}
      {host && !['completed', 'cancelled'].includes(g.state) && (
        <Button label="取消约局" variant="danger" onPress={() => setPanel('cancel')} />
      )}
      {!!error && <Notice>{error}</Notice>}
      {panel && (
        <Sheet
          title={panel === 'cancel' ? '取消约局' : panel === 'propose' ? '补充候选时间' : '重新选择时间'}
          onClose={() => setPanel(undefined)}
        >
          <Text style={styles.muted}>
            {panel === 'cancel'
              ? '受邀者会看到活动已取消。'
              : panel === 'propose'
                ? '候选时间可由朋友私下考虑。'
                : '重新选择会开启新一轮意向和参加确认。'}
          </Text>
          {panel !== 'cancel' && <OptionsEditor items={options} set={setOptions} />}
          {!!error && <Notice>{error}</Notice>}
          <Button
            label={panel === 'cancel' ? '确认取消约局' : '发布新候选时间'}
            disabled={busy}
            variant={panel === 'cancel' ? 'danger' : 'gradient'}
            onPress={() =>
              void run(async () => {
                await post(
                  'organize',
                  panel === 'cancel' ? { action: 'cancel' } : { action: panel, options: payload(options) },
                );
                setPanel(undefined);
              })
            }
          />
        </Sheet>
      )}
    </Screen>
  );
}

function Availability({ id, options }: { id: string; options: Option[] }) {
  const { data, error } = useRecord<{
    options: { id: string; includedCalendars: number; hasKnownConflict?: boolean; allFree: boolean }[];
  }>('/p2/availability/' + id);
  return (
    <MaterialCard>
      <Section title="共享日程参考" />
      <Text style={styles.muted}>
        按已填写的活动时段比对。时长待定时，仅能核对开始时刻。未共享的时段仍是未知，能否参加以本人确认为准。
      </Text>
      {!!error && <Notice>{error}</Notice>}
      {data?.options.map((item) => {
        const option = options.find((candidate) => candidate.id === item.id);
        return option ? (
          <Text key={item.id} style={styles.body}>
            {formatTime(option.startsAt)} ·{' '}
            {(item.hasKnownConflict ?? !item.allFree)
              ? '已纳入的日程有冲突'
              : option.endsAt
                ? '已授权日程未显示冲突'
                : '开始时刻未显示冲突，时长待定'}{' '}
            · {item.includedCalendars === 1 ? '仅纳入你的日程' : item.includedCalendars + ' 份日程'}
          </Text>
        ) : null;
      })}
    </MaterialCard>
  );
}
