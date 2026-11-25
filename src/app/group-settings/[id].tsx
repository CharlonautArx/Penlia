import { useLocalSearchParams } from 'expo-router';

import { Empty, Icon, ListRow, Notice, Screen, SettingGroup } from '../../components/ui';
import type { ChatGroup } from '../../features/privacy/types';
import { openConversationAction, ReportEntry } from '../../features/social/ReportSheet';
import { back, useRecord } from '../../features/social/ui';
import { useSession } from '../../services/session';

export default function GroupSettings() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const group = useRecord<{ group: ChatGroup }>('/groups/' + id);
  const account = session?.user.id;
  return <Screen title="聊天设置" back={back}>
    {!!group.error && <Notice action="重试" onAction={() => void group.load()}>{group.error}</Notice>}
    {!group.data && !group.error && <Empty busy>正在读取群聊…</Empty>}
    {group.data && account && <>
      <SettingGroup>
        <ListRow title="群资料和邀请" detail={group.data.group.name} left={<Icon name="people-outline" />} separator={false}
          onPress={() => openConversationAction(account, id, '/group/[id]', 'group-info')} />
      </SettingGroup>
      <ReportEntry onPress={() => openConversationAction(account, id, '/group/[id]', 'report')} />
    </>}
  </Screen>;
}
