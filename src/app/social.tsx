import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Empty, ListRow, Notice, Screen, Section, Sheet } from '../components/ui';
import {
  back,
  categories,
  Choices,
  dateTime,
  Field,
  InviteChoices,
  useRecord,
  type Category,
} from '../features/social/ui';
import { styles } from '../theme';

type Wish = {
  id: string;
  description: string;
  category: Category;
  place: string;
  availableAt: string | null;
  budgetCents: number | null;
  scope: Scope;
  groupId?: string;
  memberIds?: string[];
  active: boolean;
};
type Scope = 'private' | 'friends' | 'selected' | 'group';
type Match = {
  wishId: string;
  friendId: string;
  friendName: string;
  description: string;
  place: string;
  category: Category;
};
type Event = { id: string; kind: string; subjectId: string; groupId?: string | null; readAt: string | null };
const scopes: Record<Scope, string> = {
  private: '仅自己',
  friends: '全部好友',
  selected: '指定好友',
  group: '自定义关系组',
};
const sections = {
  wishes: '心愿共振',
  gatherings: '一键约局',
  collections: '共同记录',
  events: '邀请与消息',
};
type Tab = keyof typeof sections;
const eventLabels: Record<string, string> = {
  wish_match: '有新共振，看看现在还想做什么',
  gathering_invited: '收到约局邀请',
  gathering_updated: '约局有更新',
  collection_invited: '收到共同记录邀请',
  group_call: '收到群视频邀请',
  p2_calendar_invited:'收到日程共享邀请',
  p2_trip_invited:'收到旅行邀请',
  p2_list_invited:'收到共同清单邀请',
  p2_map_invited:'收到共同地图邀请',
  p2_capsule_invited:'收到时光胶囊邀请',
  p2_trip_journal:'旅行已关联共同日记',
};
type Gathering = { id: string; title: string; mode: 'all' | 'open'; state: string; directProposal:boolean };
type Collection = {
  id: string;
  title: string;
  kind: 'journal' | 'collaboration';
  owner: string;
  state: string;
};
const states: Record<string, string> = {
  interest: '匿名意向',
  confirming: '自愿确认',
  formed: '已成局',
  completed: '已完成',
  cancelled: '已取消',
};

export default function SocialScreen() {
  const { section,wishTitle,wishPlace } = useLocalSearchParams<{ section?: Tab;wishTitle?:string;wishPlace?:string }>();
  const tab = section && section in sections ? section : 'wishes';
  return (
    <Screen title={sections[tab]} back={back}>
      <Choices labels={sections} value={tab} set={(value) => router.setParams({ section: value })} />
      {tab === 'wishes' && <Wishes key={wishTitle??''} title={wishTitle} place={wishPlace}/>}
      {tab === 'gatherings' && <Gatherings />}
      {tab === 'collections' && <Collections />}
      {tab === 'events' && <Events />}
    </Screen>
  );
}
function Wishes({title,place}:{title?:string;place?:string}) {
  const { data, error, busy, run, request } = useRecord<{ wishes: Wish[]; matches: Match[] }>('/p1/wishes');
  const fresh = () =>
    ({
      id: '',
      description: title??'',
      place: place??'',
      category: 'food',
      scope: 'private',
      availableAt: null,
      budgetCents: null,
      active: true,
    }) as const;
  const [editor, setEditor] = useState<Wish|undefined>(()=>title?fresh():undefined);
  return (
    <>
      {!!error && <Notice>{error}</Notice>}
      <Button label="记一个心愿" icon="heart-outline" variant="gradient" onPress={() => setEditor(fresh())} />
      {!!data?.matches.length && <Section title="你们想到一起了" />}
      {data?.matches.map((match) => (
        <ListRow
          key={match.wishId + match.friendId}
          title={match.friendName + ' 也想' + categories[match.category]}
          detail="一起约个时间"
          onPress={() =>
            router.push({
              pathname: '/gathering/new',
              params: {
                from: match.wishId,
                friend: match.friendId,
                category: match.category,
                title: match.description,
                place: match.place,
              },
            })
          }
        />
      ))}
      <Section title="我的心愿" />
      {!data?.wishes.length && (
        <Empty icon="heart-outline">有想做的事，先记下来。允许彼此匹配时才会出现共振。</Empty>
      )}
      {data?.wishes.map((wish) => (
        <View key={wish.id} style={styles.card}>
          <ListRow
            title={wish.description}
            detail={categories[wish.category] + ' · ' + (wish.active ? scopes[wish.scope] : '已暂停')}
            onPress={() => setEditor(wish)}
          />
          <View style={styles.row}>
            <Button
              label={wish.active ? '暂停共振' : '恢复共振'}
              variant="quiet"
              disabled={busy}
              onPress={() =>
                void run(() =>
                  request('/p1/wishes/' + wish.id + '/pause', {
                    method: 'POST',
                    body: { active: !wish.active },
                  }),
                )
              }
            />
          </View>
        </View>
      ))}
      {editor && (
        <WishEditor
          key={editor.id}
          wish={editor}
          onClose={() => setEditor(undefined)}
          busy={busy}
          error={error}
          onSave={(value) =>
            void run(async () => {
              await request('/p1/wishes' + (editor.id ? '/' + editor.id : ''), {
                method: editor.id ? 'PATCH' : 'POST',
                body: value,
              });
              setEditor(undefined);
            })
          }
          onRemove={
            editor.id
              ? () =>
                  void run(async () => {
                    await request('/p1/wishes/' + editor.id, { method: 'DELETE' });
                    setEditor(undefined);
                  })
              : undefined
          }
        />
      )}
    </>
  );
}

function WishEditor({
  wish,
  busy,
  error,
  onClose,
  onSave,
  onRemove,
}: {
  wish: Wish;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (value: Record<string, unknown>) => void;
  onRemove?: () => void;
}) {
  const [client] = useState(randomUUID);
  const [value, setValue] = useState(wish);
  const [time, setTime] = useState(wish.availableAt ?? '');
  const [budget, setBudget] = useState(wish.budgetCents === null ? '' : String(wish.budgetCents / 100));
  const [localError, setLocalError] = useState('');
  const [removing, setRemoving] = useState(false);
  const update = (part: Partial<Wish>) => setValue((last) => ({ ...last, ...part }));
  return (
    <Sheet title={wish.id ? '编辑心愿' : '记一个心愿'} onClose={onClose}>
      <Choices labels={categories} value={value.category} set={(category) => update({ category })} />
      <Field
        title="想做什么"
        value={value.description}
        maxLength={200}
        onChangeText={(description) => update({ description })}
      />
      <Field
        title="地点（可选）"
        value={value.place}
        maxLength={120}
        onChangeText={(place) => update({ place })}
      />
      <Field title="时间（可选）" placeholder="年-月-日 时:分" value={time} onChangeText={setTime} />
      <Field title="预算（元，可选）" keyboardType="decimal-pad" value={budget} onChangeText={setBudget} />
      <Text style={styles.strong}>允许谁参与匹配</Text>
      <Choices labels={scopes} value={value.scope} set={(scope) => update({ scope })} />
      {(value.scope === 'selected' || value.scope === 'group') && (
        <InviteChoices
          ids={value.memberIds ?? []}
          setIds={(memberIds) => update({ memberIds })}
          groupId={value.groupId ?? ''}
          setGroupId={(groupId) => update({ groupId })}
        />
      )}
      {!!(localError || error) && <Notice>{localError || error}</Notice>}
      <Button
        label="保存心愿"
        variant="gradient"
        disabled={busy || !value.description.trim()}
        onPress={() => {
          try {
            setLocalError('');
            if (budget && !/^\d+(?:\.\d{1,2})?$/.test(budget)) throw new Error('请填写有效预算。');
            onSave({
              ...value,
              clientId: client,
              availableAt: time ? dateTime(time) : null,
              budgetCents: budget ? Math.round(Number(budget) * 100) : null,
            });
          } catch (failure) {
            if (failure instanceof Error) setLocalError(failure.message);
          }
        }}
      />
      {onRemove && (
        <Button
          label={removing ? '确认删除心愿' : '删除心愿'}
          variant="danger"
          disabled={busy}
          onPress={() => {
            if (removing) onRemove();
            else setRemoving(true);
          }}
        />
      )}
    </Sheet>
  );
}

function Gatherings() {
  const { data, error } = useRecord<{ gatherings: Gathering[] }>('/p1/gatherings');
  return (
    <>
      {!!error && <Notice>{error}</Notice>}
      <Button
        label="发起约局"
        icon="calendar-outline"
        variant="gradient"
        onPress={() => router.push('/gathering/new')}
      />
      {!data?.gatherings.length && (
        <Empty icon="calendar-outline">一起吃饭、出游或打球，从几个候选时间开始。</Empty>
      )}
      {data?.gatherings.map((item) => (
        <ListRow
          key={item.id}
          title={item.title}
          detail={(item.mode === 'all' ? '全员局' : '自由局') + ' · ' + (item.state==='interest'&&item.directProposal?'直接提议时间':states[item.state])}
          onPress={() => router.push({ pathname: '/gathering/[id]', params: { id: item.id } })}
        />
      ))}
    </>
  );
}

function Collections() {
  const { data, error, busy, run, request } = useRecord<{ collections: Collection[] }>('/p1/collections');
  return (
    <>
      {!!error && <Notice>{error}</Notice>}
      <Choices
        labels={{ journal: '新建共同日记', collaboration: '发起共创动态' }}
        set={(kind) => router.push({ pathname: '/collection/new', params: { kind } })}
      />
      {!data?.collections.length && <Empty icon="book-outline">把共同经历记在一起，邀请朋友加入。</Empty>}
      {data?.collections.map((item) => (
        <View key={item.id} style={styles.card}>
          <ListRow
            title={item.title}
            detail={item.owner + ' · ' + (item.kind === 'journal' ? '共同日记' : '共创动态')}
            onPress={
              item.state === 'active'
                ? () => router.push({ pathname: '/collection/[id]', params: { id: item.id } })
                : undefined
            }
          />
          {item.state === 'invited' && (
            <View style={styles.row}>
              {(['accept', 'decline'] as const).map((action) => (
                <Button
                  key={action}
                  label={action === 'accept' ? '加入' : '婉拒'}
                  variant={action === 'accept' ? 'primary' : 'quiet'}
                  disabled={busy}
                  onPress={() =>
                    void run(() =>
                      request('/p1/collections/' + item.id + '/membership', {
                        method: 'POST',
                        body: { action },
                      }),
                    )
                  }
                />
              ))}
            </View>
          )}
        </View>
      ))}
      <ListRow
        title="我贡献的内容"
        detail="退出共同记录后仍可撤回"
        onPress={() => router.push('/contributions')}
      />
    </>
  );
}

function Events() {
  const { data, error, run, request } = useRecord<{ events: Event[] }>('/p1/events');
  return (
    <>
      {!!error && <Notice>{error}</Notice>}
      {!data?.events.length && <Empty icon="mail-outline">约局、共振和共同记录的更新会显示在这里。</Empty>}
      {data?.events.map((event) => (
        <ListRow
          key={event.id}
          title={eventLabels[event.kind] ?? '有新消息'}
          detail={event.readAt ? '已查看' : '未查看'}
          onPress={() => {
            void run(() => request('/p1/events/' + event.id + '/open', { method: 'POST' }), false);
            if (event.kind === 'wish_match') router.setParams({ section: 'wishes' });
            else if(event.kind==='p2_calendar_invited')router.push({pathname:'/life/calendar',params:{sharing:'1'}});
            else if(event.kind==='p2_trip_journal')router.push({pathname:'/life/project/[id]',params:{id:event.subjectId,kind:'trip'}});
            else if(/^p2_(trip|list|map|capsule)_invited$/.test(event.kind))router.push({pathname:'/life/projects',params:{kind:event.kind.split('_')[1]}});
            else if (event.kind === 'group_call') {
              if (event.groupId)
                router.push({ pathname: '/group/[id]', params: { id: event.groupId, call: '1' } });
              else router.push('/groups');
            } else if (event.kind === 'collection_invited') router.setParams({ section: 'collections' });
            else router.push({ pathname: '/gathering/[id]', params: { id: event.subjectId } });
          }}
        />
      ))}
    </>
  );
}
