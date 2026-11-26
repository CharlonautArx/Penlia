import { useTogetherRouter } from '../together/navigation';
import { useState } from 'react';
import { Text } from 'react-native';
import { Button, Notice, Sheet } from '../together/ui';
import { InviteChoices } from '../social/ui';
import { useSession } from '../../services/session';
import { errorMessage } from '../../services/api';
import { styles } from '../../theme';
import { ProjectPeople, type Project, type ProjectMember } from './ui';

export function ManageProjectPeople({
  project,
  members,
  locked = false,
  changed,
}: {
  project: Project;
  members: ProjectMember[];
  locked?: boolean;
  changed: () => void;
}) {
  const router = useTogetherRouter();
  const { session, request } = useSession();
  const [panel, setPanel] = useState<'invite' | 'leave' | 'remove'>();
  const [target, setTarget] = useState('');
  const [ids, setIds] = useState<string[]>([]);
  const [group, setGroup] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const capsule = project.kind === 'capsule';
  const leaveLabel = capsule ? '退出时间胶囊' : '退出项目';
  const owner = project.ownerId === session?.user.id;
  function start(next: typeof panel) {
    if (busy) return;
    setError('');
    setIds([]);
    setGroup('');
    setPanel(next);
  }
  async function save() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const invite = panel === 'invite';
      await request('/p2/spaces/' + project.id + (invite ? '/invite' : '/membership'), {
        method: 'POST',
        body: invite ? { memberIds: ids, groupId: group || undefined } : { action: panel, userId: target },
      });
      setPanel(undefined);
      if (panel === 'leave') router.replace({ pathname: '/life/projects', params: { kind: project.kind } });
      else changed();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <ProjectPeople
        members={members}
        owner={owner}
        invite={!locked ? () => start('invite') : undefined}
        remove={capsule ? undefined : (id) => {
          setTarget(id);
          start('remove');
        }}
        leaveLabel={leaveLabel}
        leave={capsule || !owner ? () => start('leave') : undefined}
      />
      {panel && (
        <Sheet
          title={panel === 'invite' ? '邀请好友' : panel === 'leave' ? leaveLabel : '移除成员'}
          onClose={() => {
            if (!busy) setPanel(undefined);
          }}
        >
          {panel === 'invite' ? (
            <InviteChoices ids={ids} setIds={setIds} groupId={group} setGroupId={setGroup} />
          ) : (
            <Text style={styles.muted}>{capsule && owner && !locked
              ? '退出后你将无法查看或封存这个胶囊。你仍可在我的胶囊投稿中撤回自己的内容。'
              : '成员权限将立即撤销。各自拥有的记录仍可由本人管理。'}</Text>
          )}
          {!!error && <Notice>{error}</Notice>}
          <Button
            label={panel === 'invite' ? '发出邀请' : '确认'}
            variant={panel === 'invite' ? 'gradient' : 'danger'}
            disabled={busy || (panel === 'invite' && !ids.length && !group)}
            onPress={() => void save()}
          />
        </Sheet>
      )}
    </>
  );
}
