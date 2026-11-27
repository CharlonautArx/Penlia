import { LiquidSwitch } from '../../components/liquid-switch';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Empty, Icon, ListRow, Notice, Screen, SettingGroup } from '../../components/ui';
import { nativeChatBackgrounds } from '../../features/chat/background/store';
import { setConversationPreference } from '../../features/chat/conversation-preferences';
import { useConversationPreferences } from '../../features/chat/useConversationPreferences';
import { useDemo } from '../../demo/state';
import { errorMessage } from '../../services/api';
import { useFriends } from '../../services/friends';
import { imUserId, useIm } from '../../services/im';
import { openConversationAction, ReportEntry } from '../../features/social/ReportSheet';
import { useSession } from '../../services/session';
import { colors } from '../../theme';

export default function ChatSettings() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const { relationships } = useFriends();
  const person = relationships?.find((entry) => entry.userId === id && entry.status === 'accepted');
  const store = useConversationPreferences();
  const settings = store.value?.[id];
  const demo = useDemo();
  const { connection, online } = useIm();
  const [providerMuted, setProviderMuted] = useState<boolean>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  useEffect(() => {
    if (!person || !connection || !online || demo) return;
    let active = true;
    const { sdk, client } = connection;
    void client.pushManager.fetchSilentModeForConversation({
      convId: imUserId(id), convType: sdk.ChatConversationType.PeerChat,
    }).then((result) => {
      if (active) setProviderMuted(result.remindType === sdk.ChatPushRemindType.NONE);
    }).catch(() => {});
    return () => { active = false; };
  }, [connection, demo, id, online, person]);

  async function change(key: 'priority' | 'muted', value: boolean) {
    if (!person || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      if (key === 'muted' && !demo) {
        if (!connection || !online) throw new Error('聊天连接后可更新消息免打扰。');
        const { sdk, client } = connection;
        const scope = { convId: imUserId(id), convType: sdk.ChatConversationType.PeerChat };
        if (value) await client.pushManager.setSilentModeForConversation({
          ...scope, option: sdk.ChatSilentModeParam.constructorWithNotification(sdk.ChatPushRemindType.NONE),
        });
        else await client.pushManager.removeSilentModeForConversation(scope);
        setProviderMuted(value);
      }
      await store.save((current) => setConversationPreference(current, id, { [key]: value }));
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }

  return <Screen title="聊天设置" back={() => router.canGoBack() ? router.back() : router.replace({ pathname: '/chat/[id]', params: { id } })}>
    {!!(error || store.error) && <Notice>{error || store.error}</Notice>}
    {!person ? <Empty busy={!relationships}>{relationships ? '这位好友的聊天设置不可访问。' : '正在读取会话…'}</Empty> : <>
      <SettingGroup>
        <ListRow title="查找聊天记录" left={<Icon name="search-outline" />} separator={false}
          onPress={() => router.push({ pathname: '/chat-search/[id]', params: { id } })} />
      </SettingGroup>
      <SettingGroup>
        <ListRow title="特别关心" left={<Icon name="heart-outline" />}
          trailing={<LiquidSwitch accessibilityLabel="特别关心" disabled={busy || !store.value} value={!!settings?.priority}
            trackColor={{ true: colors.accent }} onValueChange={(value) => void change('priority', value)} />} />
        <ListRow title="消息免打扰" left={<Icon name="notifications-off-outline" />} separator={false}
          trailing={<LiquidSwitch accessibilityLabel="消息免打扰" disabled={busy || !store.value}
            value={providerMuted ?? !!settings?.muted} trackColor={{ true: colors.accent }}
            onValueChange={(value) => void change('muted', value)} />} />
      </SettingGroup>
      <SettingGroup>
        <ListRow title="设置当前聊天背景" detail={nativeChatBackgrounds ? undefined : '请在手机 App 中设置'} left={<Icon name="image-outline" />}
          separator={false} onPress={nativeChatBackgrounds ? () => router.push({ pathname: '/chat-background', params: { peer: id, currentOnly: '1' } }) : undefined} />
      </SettingGroup>
      {session && <ReportEntry onPress={() => openConversationAction(session.user.id, id, '/chat/[id]', 'report')} />}
    </>}
  </Screen>;
}
