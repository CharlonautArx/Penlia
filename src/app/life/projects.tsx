import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Button, ListRow, Notice, Screen, Sheet } from '../../components/ui';
import {
  DataEmpty,
  formTime,
  localDay,
  moveDays,
  projectTitles,
  type Project,
  type ProjectKind,
} from '../../features/life/ui';
import { back, dateTime, Field, InviteChoices, useRecord } from '../../features/social/ui';

type List = { spaces: (Project & { state: string; owner: string })[] };
export default function Projects() {
  const {
    kind: requested,
    from,
    title: initial,
  } = useLocalSearchParams<{ kind?: ProjectKind; from?: string; title?: string }>();
  const kind = requested && requested in projectTitles ? requested : 'trip';
  const { data, error, busy, load, run, request } = useRecord<List>('/p2/spaces?kind=' + kind);
  const [create, setCreate] = useState(!!from);
  const act = (project: Project, action: string) =>
    void run(() => request('/p2/spaces/' + project.id + '/membership', { method: 'POST', body: { action } }));
  return (
    <Screen title={projectTitles[kind]} back={back} refreshing={busy} onRefresh={() => void load()}>
      <Button
        label={'新建' + projectTitles[kind]}
        icon="add"
        variant="gradient"
        onPress={() => setCreate(true)}
      />
      {!!error && (
        <Notice action="重试" onAction={() => void load()}>
          {error}
        </Notice>
      )}
      {!data?.spaces.length && !error && <DataEmpty loading={!data}>还没有共同项目。</DataEmpty>}
      {data?.spaces.map((project) => (
        <View key={project.id}>
          <ListRow
            title={project.title}
            detail={project.state === 'invited' ? project.owner + '邀请你加入' : project.owner}
            onPress={
              project.state === 'active'
                ? () => router.push({ pathname: '/life/project/[id]', params: { id: project.id, kind } })
                : undefined
            }
          />
          {project.state === 'invited' && (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button label="接受邀请" disabled={busy} onPress={() => act(project, 'accept')} />
              <Button label="婉拒" disabled={busy} variant="quiet" onPress={() => act(project, 'decline')} />
            </View>
          )}
        </View>
      ))}
      {create && (
        <NewProject
          key={kind + from}
          kind={kind}
          gathering={from}
          initial={initial}
          onClose={() => setCreate(false)}
        />
      )}
      {kind === 'capsule' && (
        <Button
          label="管理我写过的投稿"
          variant="quiet"
          onPress={() => router.push('/life/capsule-drafts')}
        />
      )}
    </Screen>
  );
}

function NewProject({
  kind,
  initial,
  gathering,
  onClose,
}: {
  kind: ProjectKind;
  initial?: string;
  gathering?: string;
  onClose: () => void;
}) {
  const { run, busy, error, request } = useRecord<List>('/p2/spaces?kind=' + kind);
  const [clientId] = useState(randomUUID);
  const [title, setTitle] = useState(initial ?? '');
  const [members, setMembers] = useState<string[]>([]);
  const [group, setGroup] = useState('');
  const [place, setPlace] = useState('');
  const [start, setStart] = useState(localDay(moveDays(new Date(), 1)));
  const [end, setEnd] = useState(localDay(moveDays(new Date(), 2)));
  const [opens, setOpens] = useState(formTime(moveDays(new Date(), 30)));
  return (
    <Sheet title={'新建' + projectTitles[kind]} onClose={onClose}>
      <Field title="名称" value={title} onChangeText={setTitle} />
      {kind === 'trip' && (
        <>
          <Field title="旅行目的地" value={place} onChangeText={setPlace} />
          <Field title="出发日期" placeholder="年-月-日" value={start} onChangeText={setStart} />
          <Field title="结束日期" placeholder="年-月-日" value={end} onChangeText={setEnd} />
        </>
      )}
      {kind === 'capsule' && (
        <Field title="约定开启时间" placeholder="年-月-日 时:分" value={opens} onChangeText={setOpens} />
      )}
      {!gathering && (
        <InviteChoices ids={members} setIds={setMembers} groupId={group} setGroupId={setGroup} />
      )}
      {!!error && <Notice>{error}</Notice>}
      <Button
        label="创建"
        variant="gradient"
        disabled={busy || !title.trim() || (kind === 'trip' && !place.trim())}
        onPress={() =>
          void run(async () => {
            const project = await request<{ id: string }>('/p2/spaces', {
              method: 'POST',
              body: {
                clientId,
                kind,
                title,
                memberIds: members,
                groupId: group || undefined,
                destination: place,
                startDay: start,
                endDay: end,
                opensAt: kind === 'capsule' ? dateTime(opens) : undefined,
                gatheringId: gathering,
              },
            });
            onClose();
            router.push({ pathname: '/life/project/[id]', params: { id: project.id, kind } });
          }, false)
        }
      />
    </Sheet>
  );
}
