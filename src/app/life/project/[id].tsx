import { useLocalSearchParams } from 'expo-router';
import { Notice, Screen, Section } from '../../../features/together/ui';
import { back, useRecord } from '../../../features/social/ui';
import {
  DataEmpty,
  projectTitles,
  type Project,
  type ProjectKind,
  type ProjectMember,
} from '../../../features/life/ui';
import { TripScreen } from '../../../features/life/trip';
import { CapsuleScreen } from '../../../features/life/capsule';
import { ItemsView } from '../../../features/life/items';
import { ManageProjectPeople } from '../../../features/life/project-people';

export default function ProjectScreen() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind?: ProjectKind }>();
  if (kind === 'trip') return <TripScreen id={id} />;
  if (kind === 'capsule') return <CapsuleScreen id={id} />;
  return <CollectionProject id={id} />;
}
function CollectionProject({ id }: { id: string }) {
  const { data, error, load } = useRecord<{ space: Project; members: ProjectMember[] }>('/p2/spaces/' + id);
  return (
    <Screen title={data?.space.title ?? '共同项目'} back={back} onRefresh={() => void load()}>
      {!!error && (
        <Notice action="重试" onAction={() => void load()}>
          {error}
        </Notice>
      )}
      {!data && !error && <DataEmpty loading>暂无记录。</DataEmpty>}
      {data && (data.space.kind === 'map' || data.space.kind === 'list') && (
        <>
          <Section title={projectTitles[data.space.kind]} />
          <ItemsView kind={data.space.kind === 'map' ? 'place' : 'saved'} space={id} />
          <ManageProjectPeople project={data.space} members={data.members} changed={() => void load()} />
        </>
      )}
    </Screen>
  );
}
