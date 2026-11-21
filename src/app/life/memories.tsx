import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, ListRow, Notice, Screen, Section, Sheet } from '../../components/ui';
import { back, Choices, Field, useRecord } from '../../features/social/ui';
import { DataEmpty, localDay } from '../../features/life/ui';
import { MemberChoices } from '../../features/privacy/MemberChoices';
import { useFriends } from '../../services/friends';
import { useSession } from '../../services/session';
import { styles } from '../../theme';

const kinds = {
  gathering: '已结束的约局',
  journal: '共同日记',
  moment: '获授权的生活动态',
  trip: '已完成的旅行',
  capsule: '已开启的胶囊',
  relay: '瞬间共鸣',
  birthday: '生日或纪念日',
};
const periods = {
  off: '关闭',
  monthly: '每月最多一次',
  anniversary: '只在纪念日',
  standard: '纪念日与每月同日',
};
type Kind = keyof typeof kinds;
type Frequency = keyof typeof periods;
type Memory = {
  id: string;
  title: string;
  ownerId: string;
  author: string;
  eventDay: string;
  sourceId: string | null;
  sourceKind: Kind;
  memberIds: string[] | null;
};
type Memories = { memories: Memory[]; frequency: Frequency };
type Source = { id: string; title: string; day: string };
type Candidate = Source & { sourceKind: Exclude<Kind, 'birthday'>; reason: 'anniversary' | 'recent' };
type Draft = { source?: string; initial?: string; initialKind?: Kind };

export default function MemoriesScreen() {
  const {
    from,
    sourceKind,
    title: initial,
    id,
  } = useLocalSearchParams<{ from?: string; sourceKind?: Kind; title?: string; id?: string }>();
  const { session } = useSession();
  const { data, error, busy, run, request, load } = useRecord<Memories>('/p2/memories');
  const [draft, setDraft] = useState<Draft | undefined>(
    from ? { source: from, initial, initialKind: sourceKind } : undefined,
  );
  const [candidateRevision, setCandidateRevision] = useState(0);
  const [sharing, setSharing] = useState<Memory>();
  const [deleting, setDeleting] = useState<Memory>();
  const items = (data?.memories ?? []).filter((item) => !id || item.id === id);
  const refresh = () => {
    void load();
    setCandidateRevision((value) => value + 1);
  };
  function sourceLink(item: Memory) {
    if (!item.sourceId) return;
    switch (item.sourceKind) {
      case 'gathering':
        return router.push({ pathname: '/gathering/[id]', params: { id: item.sourceId } });
      case 'journal':
        return router.push({ pathname: '/collection/[id]', params: { id: item.sourceId } });
      case 'trip':
      case 'capsule':
        return router.push({
          pathname: '/life/project/[id]',
          params: { id: item.sourceId, kind: item.sourceKind },
        });
      case 'moment':
        return router.push({ pathname: '/life/moment/[id]', params: { id: item.sourceId } });
      case 'relay':
        return router.push({ pathname: '/world/[id]', params: { id: item.sourceId } });
    }
  }
  return (
    <Screen title="共同回忆" back={back} refreshing={busy} onRefresh={refresh}>
      {!id && (
        <>
          <Button label="保存一段回忆" variant="gradient" icon="add" onPress={() => setDraft({})} />
          <MemoryCandidates
            key={candidateRevision}
            choose={(candidate) =>
              setDraft({ source: candidate.id, initial: candidate.title, initialKind: candidate.sourceKind })
            }
          />
          <Section title="回忆提醒" />
          <Choices
            labels={periods}
            value={data?.frequency ?? 'off'}
            set={(frequency) =>
              void run(() => request('/p2/memory-settings', { method: 'POST', body: { frequency } }))
            }
          />
        </>
      )}
      {!!error && (
        <Notice action="重试" onAction={() => void load()}>
          {error}
        </Notice>
      )}
      {!items.length && !error && <DataEmpty loading={!data}>这里没有可查看的回忆。</DataEmpty>}
      {items.map((item) => (
        <View key={item.id} style={styles.card}>
          <Section title={item.title} detail={item.eventDay} />
          <Text style={styles.muted}>
            {kinds[item.sourceKind]} ·{' '}
            {item.ownerId === session?.user.id ? '我保存的' : item.author + ' 分享'}
          </Text>
          <View style={[styles.row, { flexWrap: 'wrap' }]}>
            {item.sourceId && <Button label="打开原记录" variant="soft" onPress={() => sourceLink(item)} />}
            {item.ownerId === session?.user.id && (
              <>
                <Button label="分享范围" variant="quiet" onPress={() => setSharing(item)} />
                <Button label="删除" variant="quiet" onPress={() => setDeleting(item)} />
              </>
            )}
          </View>
        </View>
      ))}
      {draft && (
        <MemoryEditor
          {...draft}
          onClose={() => {
            setDraft(undefined);
            refresh();
          }}
        />
      )}
      {sharing && (
        <MemoryShare
          item={sharing}
          onClose={() => {
            setSharing(undefined);
            void load();
          }}
        />
      )}
      {deleting && (
        <Sheet title="删除这段回忆" onClose={() => setDeleting(undefined)}>
          <Text style={styles.muted}>删除回忆卡片和提醒。原记录仍保留。</Text>
          {!!error && <Notice>{error}</Notice>}
          <Button
            label="确认删除回忆"
            variant="danger"
            disabled={busy}
            onPress={() =>
              void run(async () => {
                await request('/p2/memories/' + deleting.id, { method: 'DELETE' });
                setDeleting(undefined);
                setCandidateRevision((value) => value + 1);
              })
            }
          />
        </Sheet>
      )}
    </Screen>
  );
}

function MemoryCandidates({ choose }: { choose: (candidate: Candidate) => void }) {
  const { data, error, load } = useRecord<{ candidates: Candidate[] }>('/p2/memory-candidates');
  return (
    <View style={styles.card}>
      <Section title="值得回想" />
      <Text style={styles.muted}>仅从你有权查看的生活记录中挑选。候选只有你能看到，由你决定是否保存。</Text>
      {!!error && (
        <Notice action="重试" onAction={() => void load()}>
          {error}
        </Notice>
      )}
      {!data?.candidates.length && !error && <DataEmpty loading={!data}>暂时没有合适的回忆候选。</DataEmpty>}
      {data?.candidates.map((candidate) => (
        <ListRow
          key={candidate.sourceKind + candidate.id}
          title={candidate.title}
          detail={[
            candidate.reason === 'anniversary' ? '往年的今天' : '最近记录',
            kinds[candidate.sourceKind],
            candidate.day,
          ].join(' · ')}
          onPress={() => choose(candidate)}
        />
      ))}
    </View>
  );
}

function MemoryEditor({
  source,
  initial,
  initialKind,
  onClose,
}: {
  source?: string;
  initial?: string;
  initialKind?: Kind;
  onClose: () => void;
}) {
  const { request, error, busy, run } = useRecord('/p2/memories');
  const [kind, setKind] = useState<Kind>(initialKind ?? 'birthday');
  const [selected, setSelected] = useState<string>(source ?? '');
  const [title, setTitle] = useState(initial ?? '');
  const [day, setDay] = useState(localDay(new Date()));
  const [clientId] = useState(randomUUID);
  return (
    <Sheet title="保存共同回忆" onClose={onClose}>
      <Choices
        labels={kinds}
        value={kind}
        set={(value) => {
          setKind(value);
          setSelected('');
        }}
      />
      {kind !== 'birthday' ? (
        <SourceChoices
          kind={kind}
          chosen={selected}
          choose={(candidate) => {
            setSelected(candidate.id);
            setTitle(candidate.title);
          }}
        />
      ) : (
        <Field title="纪念日期" placeholder="年-月-日" value={day} onChangeText={setDay} />
      )}
      <Field title="给这段记忆起个名字" value={title} onChangeText={setTitle} />
      <Text style={styles.muted}>先保存为个人回忆。分享时还需选择有权限看原记录的好友。</Text>
      {!!error && <Notice>{error}</Notice>}
      <Button
        label="确认保存回忆"
        variant="gradient"
        disabled={busy || !title.trim() || (kind !== 'birthday' && !selected)}
        onPress={() =>
          void run(async () => {
            await request('/p2/memories', {
              method: 'POST',
              body: {
                sourceKind: kind,
                sourceId: selected || undefined,
                title,
                eventDay: day,
                clientId,
                confirmed: true,
              },
            });
            onClose();
          }, false)
        }
      />
    </Sheet>
  );
}
function SourceChoices({
  kind,
  chosen,
  choose,
}: {
  kind: Kind;
  chosen: string;
  choose: (source: Source) => void;
}) {
  const { data, error } = useRecord<{ sources: Source[] }>('/p2/memory-sources?kind=' + kind);
  return (
    <>
      {!!error && <Notice>{error}</Notice>}
      {!data?.sources.length && !error && <DataEmpty loading={!data}>暂无可保存的原记录。</DataEmpty>}
      {data?.sources.map((source) => (
        <ListRow
          key={source.id}
          title={source.title}
          detail={source.day + (chosen === source.id ? ' · 已选' : '')}
          onPress={() => choose(source)}
        />
      ))}
    </>
  );
}
function MemoryShare({ item, onClose }: { item: Memory; onClose: () => void }) {
  const { relationships } = useFriends();
  const { error, run, request, busy } = useRecord('/p2/memories');
  const [ids, setIds] = useState(item.memberIds ?? []);
  return (
    <Sheet title="确认回忆分享范围" onClose={onClose}>
      <Text style={styles.muted}>只有你选择并且能看原记录的好友才可浏览。取消勾选可撤销分享。</Text>
      <MemberChoices
        friends={relationships?.filter((p) => p.status === 'accepted') ?? []}
        ids={ids}
        update={setIds}
      />
      {!!error && <Notice>{error}</Notice>}
      <Button
        label="确认分享范围"
        variant="gradient"
        disabled={busy}
        onPress={() =>
          void run(async () => {
            await request('/p2/memories/' + item.id + '/share', {
              method: 'POST',
              body: { memberIds: ids, confirmed: true },
            });
            onClose();
          }, false)
        }
      />
    </Sheet>
  );
}
