import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Avatar, Button, IconButton, ListRow, Notice, Screen, Section, Sheet } from '../../components/ui';
import { DataEmpty, ProjectPeople } from '../../features/life/ui';
import { back, Choices, Field, formatTime, InviteChoices, useRecord } from '../../features/social/ui';
import { openRecord, sceneNames, sourceNames, spaceTitles, type Page, type Person, type Scene, type Space, type WorldRecord } from '../../features/world/model';
import { RecordEditor, type RecordDraft } from '../../features/world/record-editor';
import { RelatedRelays } from '../../features/world/related';
import { WorldScene } from '../../features/world/scene';
import { useSession } from '../../services/session';
import { styles } from '../../theme';
import { LifeLead, TimelineNode } from '../../features/life/Editorial';
import { MomentMediaGrid } from '../../features/moments/media';

export default function WorldDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Details key={id} id={id} />;
}

function Details({ id }: { id: string }) {
  const base = '/p3/spaces/' + id;
  const { data, error, run, busy, request, load } = useRecord<{ space: Space; members: Person[] }>(base,20000);
  const { session } = useSession();
  const [offset, setOffset] = useState(0);
  const contents = useRecord<Page<WorldRecord>>(base + '/records?offset=' + offset,20000);
  const [draft, setDraft] = useState<RecordDraft>();
  const [selected, setSelected] = useState<WorldRecord>();
  const [expandedMedia, setExpandedMedia] = useState<string>();
  const [deleting, setDeleting] = useState<WorldRecord>();
  const [people, setPeople] = useState(false);
  const [arrange, setArrange] = useState(false);
  const all = contents.data?.records ?? [];
  const space = data?.space;
  const me = session?.user.id;
  const refresh = () => { void load(); void contents.load(); };
  const refreshFirst = () => { setOffset(0); refresh(); };
  if (!space) return (
    <Screen title="共同空间" back={back}>
      {error ? <Notice action="重试" onAction={refresh}>{error}</Notice> : <DataEmpty loading>正在读取空间。</DataEmpty>}
    </Screen>
  );
  const world = space.kind === 'world';
  const audience = data.members.filter((person) => person.state === 'active' && person.id !== me);
  const labels = { contribution:'投稿', link:'连结', decoration:'摆件' };
  const edit = (item: WorldRecord) => { setSelected(undefined); setDraft({ kind:item.kind, initial:item }); };
  const match = (item: WorldRecord) => item.kind === 'contribution' ? item.body || '照片或短视频'
    : item.sourceTitle ?? item.body;
  const activeSelection = selected && all.find((item) => item.id === selected.id);
  return (
    <Screen title={spaceTitles[space.kind]} back={back} refreshing={busy || contents.busy} onRefresh={refreshFirst}
      actions={<IconButton label="成员与邀请" icon="people-outline" onPress={() => setPeople(true)} />}>
      <LifeLead title={space.title} detail={space.eventDay ?? sceneNames[space.scene]} tone={world ? 'paper' : 'rose'}>
        {!world && <Text style={styles.muted}>每位作者决定谁可以查看自己的投稿。</Text>}
      </LifeLead>
      {world ? <>
        <WorldScene space={space} records={all} choose={setSelected}
          add={(x,y) => setDraft({kind:'decoration',x,y})}
          greet={() => void run(async () => {
            await request(base+'/world',{method:'PATCH',body:{action:'greet'}});
          })} />
        <View style={[styles.row, { flexWrap:'wrap' }]}>
          <Button label="摆放装饰或纪念物" icon="add" onPress={() => setDraft({ kind:'decoration' })} />
          <Button label="布景与宠物名字" variant="soft" onPress={() => setArrange(true)} />
        </View>
        <RelatedRelays kind="world" id={id} />
      </> : <>
        <Button label="补充我的瞬间" icon="add" variant="gradient" onPress={() => setDraft({ kind:'contribution' })} />
        <View style={[styles.row, { flexWrap:'wrap' }]}>
          <Button label="关联动态、日记或世界" variant="soft" onPress={() => setDraft({ kind:'link' })} />
          <Button label="保存为共同回忆" variant="quiet" onPress={() => router.push({
            pathname:'/life/memories', params:{ from:id,sourceKind:'relay',title:space.title },
          })} />
        </View>
      </>}
      <Section title={world ? '摆件与纪念物' : '投稿与连结'} />
      {!!error && <Notice>{error}</Notice>}
      {!!contents.error && <Notice action="重试" onAction={() => void contents.load()}>{contents.error}</Notice>}
      {!all.length && !contents.error && <DataEmpty loading={!contents.data}>{world ? '这里还没有可查看的摆件。' : '这里还没有可查看的投稿。'}</DataEmpty>}
      {all.map((item, index) => item.kind === 'contribution' ? (
        <TimelineNode key={item.id} last={index === all.length - 1}>
        <View style={styles.card}>
          <View style={styles.row}><Avatar userId={item.authorId} name={item.author} size={36} /><Section title={item.author} detail={formatTime(item.createdAt)} /></View>
          {!!item.body && <Text style={styles.body}>{item.body}</Text>}
          {item.media.length > 0 && (index < 3 || expandedMedia === item.id) &&
            <MomentMediaGrid media={expandedMedia === item.id ? item.media : item.media.slice(0, 1)} />}
          {item.media.length > (index < 3 ? 1 : 0) && (
            <Button label={expandedMedia === item.id ? '收起附件' : '查看附件 · ' + item.media.length}
              variant="soft" onPress={() => setExpandedMedia(expandedMedia === item.id ? undefined : item.id)} />
          )}
          {item.authorId === me && <View style={[styles.row, { flexWrap:'wrap' }]}>
            <Button label="编辑与授权" variant="quiet" onPress={() => edit(item)} />
            <Button label="撤回投稿" variant="quiet" onPress={() => setDeleting(item)} />
          </View>}
        </View>
        </TimelineNode>
      ) : (
        <ListRow key={item.id} title={match(item)} detail={(item.sourceKind ? sourceNames[item.sourceKind] : labels[item.kind]) + ' · ' + item.author}
          onPress={() => setSelected(item)} />
      ))}
      <View style={[styles.row, { flexWrap:'wrap' }]}>
        {offset > 0 && <Button label="上一页" variant="quiet" onPress={() => setOffset(Math.max(0,offset-20))} />}
        {contents.data?.next != null && <Button label="下一页" variant="soft" onPress={() => setOffset(contents.data!.next!)} />}
      </View>
      {draft && <RecordEditor spaceId={id} rosterVersion={space.rosterVersion} draft={draft} people={audience} close={() => setDraft(undefined)}
        saved={() => { setDraft(undefined); refreshFirst(); }} />}
      {activeSelection && <Sheet title={match(activeSelection)} onClose={() => setSelected(undefined)}>
        {!!activeSelection.body && activeSelection.sourceTitle && <Text style={styles.body}>{activeSelection.body}</Text>}
        <Text style={styles.muted}>{activeSelection.author} · {labels[activeSelection.kind]}</Text>
        {activeSelection.sourceKind && activeSelection.sourceId && <Button label="打开原记录" variant="soft" onPress={() => {
          setSelected(undefined);
          openRecord(activeSelection.sourceKind!,activeSelection.sourceId!);
        }} />}
        {activeSelection.authorId === me && <>
          <Button label="编辑与授权" variant="quiet" onPress={() => edit(activeSelection)} />
          <Button label="撤回" variant="danger" onPress={() => { setSelected(undefined); setDeleting(activeSelection); }} />
        </>}
      </Sheet>}
      {deleting && <Sheet title={'撤回' + labels[deleting.kind]} onClose={() => setDeleting(undefined)}>
        <Text style={styles.muted}>成员将无法再打开你撤回的内容。</Text>
        {!!error && <Notice>{error}</Notice>}
        <Button label="确认撤回" variant="danger" disabled={busy} onPress={() => void run(async () => {
          await request('/p3/records/' + deleting.id, { method:'DELETE' });
          setDeleting(undefined);
          refreshFirst();
        },false)} />
      </Sheet>}
      {people && <People space={space} members={data.members.filter((p) => p.id !== me)} close={() => setPeople(false)} changed={refresh} />}
      {arrange && <Arrange space={space} close={() => setArrange(false)} changed={refresh} />}
    </Screen>
  );
}

function Arrange({ space,close,changed }: { space: Space; close: () => void; changed: () => void }) {
  const path = '/p3/spaces/' + space.id;
  const { busy,error,run,request } = useRecord(path);
  const [scene,setScene] = useState<Scene>(space.scene);
  const [name,setName] = useState(space.petName);
  return (
    <Sheet title="布置共同世界" onClose={close}>
      <Choices labels={sceneNames} value={scene} set={setScene} />
      <Field title="小宠物的名字" value={name} onChangeText={setName} maxLength={16} />
      {!!error && <Notice>{error}</Notice>}
      <Button label="保存布置" variant="gradient" disabled={!name.trim() || busy} onPress={() => void run(async () => {
        await request(path+'/world',{method:'PATCH',body:{action:'arrange',scene,petName:name,revision:space.revision}});
        changed();
        close();
      },false)} />
    </Sheet>
  );
}

function People({ space,members,close,changed }: { space: Space; members: Person[]; close: () => void; changed: () => void }) {
  const { session } = useSession();
  const path = '/p3/spaces/' + space.id;
  const { error,busy,run,request } = useRecord(path);
  const [action,setAction] = useState<'invite'|'remove'|'leave'>();
  const [target,setTarget] = useState('');
  const [ids,setIds] = useState<string[]>([]);
  const [group,setGroup] = useState('');
  return (
    <Sheet title="成员与邀请" onClose={close}>
      {!action ? <ProjectPeople members={members} owner={session?.user.id === space.ownerId}
        invite={() => setAction('invite')} leave={() => setAction('leave')}
        remove={(id) => { setTarget(id); setAction('remove'); }} /> : <>
        {action === 'invite' ? <InviteChoices ids={ids} setIds={setIds} groupId={group} setGroupId={setGroup} />
          : <Text style={styles.muted}>空间权限和此前本空间的分享将被撤销，作者仍可撤回自己的内容。</Text>}
        {!!error && <Notice>{error}</Notice>}
        <Button label={action === 'invite' ? '发出邀请' : '确认'} variant={action === 'invite' ? 'gradient' : 'danger'}
          disabled={busy || (action === 'invite' && !ids.length && !group)} onPress={() => void run(async () => {
            if (action === 'invite')
              await request(path+'/invite',{method:'POST',body:{memberIds:ids,groupId:group || undefined}});
            else await request(path+'/membership',{method:'POST',body:{action,userId:target || undefined}});
            changed();
            close();
            if (action === 'leave') router.replace({pathname:'/world',params:{kind:space.kind}});
          },false)} />
        <Button label="返回成员" variant="quiet" onPress={() => setAction(undefined)} />
      </>}
    </Sheet>
  );
}
