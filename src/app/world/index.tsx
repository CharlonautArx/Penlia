import { useTogetherRouter } from '../../features/together/navigation';
import { randomUUID } from 'expo-crypto';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, ListRow, Notice, Screen, Section, Sheet } from '../../features/together/ui';
import { DateBadge } from '../../features/life/Editorial';
import { DataEmpty, localDay } from '../../features/life/ui';
import { back, Choices, Field, InviteChoices, useRecord } from '../../features/social/ui';
import { spaceTitles, type SpaceKind } from '../../features/world/model';
import { styles } from '../../theme';
import { OrbFace } from '../../features/pet/Orb';

type Card = { id: string; title: string; owner: string; state: 'invited' | 'active'; eventDay: string | null };

export default function WorldList() {
  const { kind } = useLocalSearchParams<{ kind?: SpaceKind }>();
  const tab = kind === 'relay' ? 'relay' : 'world';
  return <SpaceList key={tab} kind={tab} />;
}

function SpaceList({ kind }: { kind: SpaceKind }) {
  const router = useTogetherRouter();
  const path = '/p3/spaces?kind=' + kind;
  const { data, error, busy, run, request, load } = useRecord<{ spaces: Card[]; next: number | null }>(path);
  const [extra, setExtra] = useState<Card[]>([]);
  const [cursor, setCursor] = useState<number | null>();
  const [create, setCreate] = useState(false);
  const [invite, setInvite] = useState<Card>();
  const next = cursor === undefined ? data?.next : cursor;
  const cards = [...(data?.spaces ?? []), ...extra];
  const reload = () => { setExtra([]); setCursor(undefined); void load(); };
  return (
    <Screen title={spaceTitles[kind]} back={back} refreshing={busy} onRefresh={reload}>
      <Button label={kind === 'relay' ? '发起接力' : '创建共同世界'} variant="gradient" icon="add" onPress={() => setCreate(true)} />
      <Button label="管理我的投稿与摆件" variant="quiet" onPress={() => router.push('/world/own')} />
      {!!error && <Notice action="重试" onAction={reload}>{error}</Notice>}
      {!cards.length && !error && <DataEmpty loading={!data}>{kind === 'relay' ? '这里还没有接力。' : '这里还没有共同世界。'}</DataEmpty>}
      {cards.map((item) => (
        <ListRow
          key={item.id}
          title={item.title}
          left={item.eventDay ? <DateBadge date={item.eventDay} /> : kind === 'world' ? <OrbFace size={41} /> : undefined}
          detail={[item.eventDay, item.owner, item.state === 'invited' ? '待接受' : null].filter(Boolean).join(' · ')}
          onPress={() => item.state === 'invited' ? setInvite(item) : router.push({ pathname: '/world/[id]', params: { id: item.id } })}
        />
      ))}
      {next != null && (
        <Button label="查看更多" variant="soft" disabled={busy} onPress={() => void run(async () => {
          const result = await request<{ spaces: Card[]; next: number | null }>(path + '&offset=' + next);
          setExtra((previous) => [...previous, ...result.spaces]);
          setCursor(result.next);
        }, false)} />
      )}
      {create && <CreateSpace kind={kind} close={() => setCreate(false)} />}
      {invite && (
        <Sheet title="邀请" onClose={() => setInvite(undefined)}>
          <Section title={invite.title} detail={invite.owner + ' 邀请你加入'} />
          <Text style={styles.muted}>接受后可进入，作者分享给你的内容才会显示。</Text>
          {!!error && <Notice>{error}</Notice>}
          <View style={[styles.row, { flexWrap: 'wrap' }]}>
            {(['accept','decline'] as const).map((action) => (
              <Button key={action} label={action === 'accept' ? '接受邀请' : '谢绝'} variant={action === 'accept' ? 'gradient' : 'quiet'} disabled={busy}
                onPress={() => void run(async () => {
                  await request('/p3/spaces/' + invite.id + '/membership', { method:'POST', body:{ action } });
                  setInvite(undefined);
                  reload();
                  if (action === 'accept') router.push({ pathname:'/world/[id]', params:{ id:invite.id } });
                }, false)} />
            ))}
          </View>
        </Sheet>
      )}
    </Screen>
  );
}

function CreateSpace({ kind, close }: { kind: SpaceKind; close: () => void }) {
  const router = useTogetherRouter();
  const { request, run, busy, error } = useRecord('/p3/spaces?kind=' + kind);
  const [clientId] = useState(randomUUID);
  const [title, setTitle] = useState('');
  const [eventDay, setEventDay] = useState(() => localDay(new Date()));
  const [ids, setIds] = useState<string[]>([]);
  const [group, setGroup] = useState('');
  return (
    <Sheet title={kind === 'relay' ? '发起瞬间接力' : '创建共同世界'} onClose={close}>
      <Field title="名称" value={title} onChangeText={setTitle} maxLength={80} />
      {kind === 'relay' && <Field title="发生日期" placeholder="年-月-日" value={eventDay} onChangeText={setEventDay} />}
      <Text style={styles.muted}>好友主动接受邀请后才加入，可稍后邀请。</Text>
      <InviteChoices ids={ids} setIds={setIds} groupId={group} setGroupId={setGroup} />
      {!!error && <Notice>{error}</Notice>}
      <Button label="创建" variant="gradient" disabled={!title.trim() || busy} onPress={() => void run(async () => {
        const { id } = await request<{ id: string }>('/p3/spaces', { method:'POST', body:{
          kind,clientId,title,eventDay,memberIds:ids,groupId:group || undefined,
        } });
        close();
        router.push({ pathname:'/world/[id]', params:{ id } });
      }, false)} />
    </Sheet>
  );
}
