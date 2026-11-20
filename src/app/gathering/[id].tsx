import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Empty, ListRow, Notice, Screen, Section, Sheet } from '../../components/ui';
import {
  back,
  categories,
  CheckRow,
  Choices,
  dateTime,
  Field,
  formatTime,
  InviteChoices,
  useRecord,
  type Category,
} from '../../features/social/ui';
import { gatheringTimeChoices } from '../../features/social/gathering-time';
import { useSession } from '../../services/session';
import { styles } from '../../theme';

type Mode = 'all' | 'open';
type Intention = 'interested' | 'undecided' | 'unavailable';
type Option = { id: string; startsAt: string; place: string };
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
    mode: Mode;
    minimum: number;
    state: keyof typeof stateNames;
    choiceId: string | null;
    ballotClosed: boolean;
    directProposal: boolean;
    intention: Intention | null;
    votes: string[];
    confirmed: boolean;
  };
  options: Option[];
  attendees: { id: string; name: string }[];
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

type DraftOption = { time: string; place: string };
const blank = (): DraftOption => ({ time: '', place: '' });
function OptionsEditor({ items, set }: { items: DraftOption[]; set: (items: DraftOption[]) => void }) {
  return (
    <View style={{ gap: 10 }}>
      {items.map((option, index) => (
        <View style={styles.card} key={index}>
          <Section title={'候选 ' + (index + 1)} />
          <Field
            title="当地日期与时间"
            value={option.time}
            placeholder="年-月-日 时:分"
            onChangeText={(time) => set(items.map((item, i) => (i === index ? { ...item, time } : item)))}
          />
          <View style={[styles.row, { flexWrap: 'wrap' }]}>
            {gatheringTimeChoices().map(({ label, value }) => (
              <Button
                key={label}
                label={label}
                variant={option.time === value ? 'primary' : 'soft'}
                onPress={() => set(items.map((item, i) => (i === index ? { ...item, time: value } : item)))}
              />
            ))}
          </View>
          <Field
            title="见面地点"
            value={option.place}
            onChangeText={(place) => set(items.map((item, i) => (i === index ? { ...item, place } : item)))}
          />
          {items.length > 1 && (
            <Button
              label="移除此候选"
              variant="quiet"
              onPress={() => set(items.filter((_, i) => i !== index))}
            />
          )}
        </View>
      ))}
      {items.length < 8 && (
        <Button label="添加候选时间" variant="soft" icon="add" onPress={() => set([...items, blank()])} />
      )}
    </View>
  );
}
const payload = (items: DraftOption[]) =>
  items.map(({ time, place }) => ({ startsAt: dateTime(time), place }));

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
  const { run, busy, error, request } = useRecord('/p1/gatherings');
  const [clientId] = useState(randomUUID);
  const [name, setName] = useState(title ?? '');
  const [kind, setKind] = useState<Category>(category && category in categories ? category : 'food');
  const [mode, setMode] = useState<Mode>('open');
  const [minimum, setMinimum] = useState('2');
  const [ids, setIds] = useState(friend ? [friend] : []);
  const [groupId, setGroupId] = useState('');
  const [items, setItems] = useState([{ time: '', place: place ?? '' }]);
  return (
    <Screen title="发起约局" back={back}>
      <Choices labels={categories} value={kind} set={setKind} />
      <Field title="活动名称" value={name} maxLength={80} onChangeText={setName} />
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
      <OptionsEditor items={items} set={setItems} />
      <InviteChoices ids={ids} setIds={setIds} groupId={groupId} setGroupId={setGroupId} />
      {!!error && <Notice>{error}</Notice>}
      <Button
        label="发送邀请"
        variant="gradient"
        disabled={busy || !name.trim() || (!ids.length && !groupId)}
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
                options: payload(items),
              },
            });
            router.replace({ pathname: '/gathering/[id]', params: { id: value.id } });
          }, false)
        }
      />
    </Screen>
  );
}

function GatheringDetail({ id }: { id: string }) {
  const base = '/p1/gatherings/' + id;
  const { data, busy, error, run, request, load } = useRecord<Detail>(base, 15000);
  const { session } = useSession();
  const [intent, setIntent] = useState<Intention>('undecided');
  const [votes, setVotes] = useState<string[]>([]);
  const [choice, setChoice] = useState('');
  const [panel, setPanel] = useState<'reschedule' | 'cancel'>();
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
      <View style={styles.card}>
        <Section
          title={g.title}
          detail={g.state === 'interest' && g.directProposal ? '直接提议时间' : stateNames[g.state]}
        />
        <Text style={styles.body}>
          {modeNames[g.mode]}
          {g.mode === 'open' ? ' · 至少 ' + g.minimum + ' 人参加' : ''}
        </Text>
        {selected && (
          <Text style={styles.strong}>
            {formatTime(selected.startsAt)} · {selected.place}
          </Text>
        )}
      </View>
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
            <View style={styles.card} key={item.id}>
              <Text style={styles.strong}>{formatTime(item.startsAt)}</Text>
              <Text style={styles.muted}>{item.place}</Text>
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
            </View>
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
          {!host && (
            <Button
              label={g.confirmed ? '撤回参加确认' : '确认参加'}
              variant={g.confirmed ? 'soft' : 'gradient'}
              disabled={busy}
              onPress={() => void run(() => post('confirm', { attend: !g.confirmed }))}
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
              params: { kind: 'journal', from: g.id, title: g.title },
            })
          }
        />
      )}
      {host && !['completed', 'cancelled'].includes(g.state) && (
        <Button label="取消约局" variant="danger" onPress={() => setPanel('cancel')} />
      )}
      {!!error && <Notice>{error}</Notice>}
      {panel && (
        <Sheet title={panel === 'cancel' ? '取消约局' : '重新选择时间'} onClose={() => setPanel(undefined)}>
          <Text style={styles.muted}>
            {panel === 'cancel' ? '受邀者会看到活动已取消。' : '重新选择会开启新一轮意向和参加确认。'}
          </Text>
          {panel === 'reschedule' && <OptionsEditor items={options} set={setOptions} />}
          {!!error && <Notice>{error}</Notice>}
          <Button
            label={panel === 'cancel' ? '确认取消约局' : '发布新候选时间'}
            disabled={busy}
            variant={panel === 'cancel' ? 'danger' : 'gradient'}
            onPress={() =>
              void run(async () => {
                await post(
                  'organize',
                  panel === 'cancel'
                    ? { action: 'cancel' }
                    : { action: 'reschedule', options: payload(options) },
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
