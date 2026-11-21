import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Avatar, Button, Empty, ListRow, Notice, Sheet } from '../../components/ui';
import { demoPortrait } from '../../demo/visuals';
import { useFriends } from '../../services/friends';
import { useSession } from '../../services/session';
import { styles } from '../../theme';

export function InviteButton({ message, label = '邀请好友' }: { message: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button label={label} icon="paper-plane-outline" variant="soft" onPress={() => setOpen(true)} />
    {open && <Sheet title="分享给好友" onClose={() => setOpen(false)}>
      <Text style={styles.muted}>选择好友后，提议会放入聊天输入框，由你确认发送。</Text>
      <Text style={invite.message}>{message}</Text>
      <InviteRecipients message={message} onChoose={() => setOpen(false)} />
    </Sheet>}
  </>;
}

export function InviteRecipients({ message, onChoose, empty = '先添加好友，就能分享这条提议。' }: {
  message: string; onChoose: () => void; empty?: string;
}) {
  const { relationships, refresh, error } = useFriends();
  useEffect(() => { void refresh(); }, [refresh]);
  const friends = relationships?.filter((friend) => friend.status === 'accepted') ?? [];
  return <>
    {!!error && <Notice action="重试" onAction={() => void refresh()}>{error}</Notice>}
    {friends.map((friend) => <ListRow key={friend.userId} title={friend.name} detail={'@' + friend.username}
      left={<Avatar name={friend.name} source={demoPortrait(friend.username)} size={40} />}
      onPress={() => {
        onChoose();
        router.push({ pathname: '/chat/[id]', params: { id: friend.userId, draft: message } });
      }} />)}
    {!friends.length && !error && <Empty busy={!relationships}>{empty}</Empty>}
  </>;
}

export function useSavedPlaces() {
  const { session } = useSession();
  const key = session ? 'penlia.saved-places.v1.' + session.user.id : undefined;
  const [saved, setSaved] = useState<string[]>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useFocusEffect(useCallback(() => {
    if (!key) return;
    let active = true;
    void AsyncStorage.getItem(key).then((value) => {
      if (!active) return;
      const parsed: unknown = value ? JSON.parse(value) : [];
      setSaved(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []);
      setError('');
    }).catch(() => { if (active) setError('暂时无法读取本机收藏。'); });
    return () => { active = false; };
  }, [key]));

  async function toggle(id: string) {
    if (!saved || !key || busy) return;
    const next = saved.includes(id) ? saved.filter((item) => item !== id) : [...saved, id];
    setBusy(true);
    try {
      await AsyncStorage.setItem(key, JSON.stringify(next));
      setSaved(next);
      setError('');
    } catch {
      setError('暂时无法保存，请重试。');
    } finally {
      setBusy(false);
    }
  }

  return { saved, busy, error, toggle };
}

const invite = StyleSheet.create({
  message: { ...styles.card, ...styles.body },
});
