import { LiquidSwitch } from '../../components/liquid-switch';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Text, TextInput, View, type ImageSourcePropType } from 'react-native';
import { MaterialCard, Avatar, Button, Empty, IconButton, ListRow, Notice, Screen, Section, Sheet } from '../../components/ui';
import { GroupPortrait, useGroupPortraitPicker } from './GroupPortrait';
import { ScanCode } from '../privacy/CodeSheet';
import type { ChatGroup, Invite } from '../privacy/types';
import { errorMessage } from '../../services/api';
import { useSession } from '../../services/session';
import { styles } from '../../theme';

export function GroupChats({ render }: { render?: (props: {
  actions: ReactNode; children: ReactNode; reload: () => void; refreshing: boolean;
}) => ReactNode }) {
  const { request } = useSession();
  const portraitPicker = useGroupPortraitPicker();
  const [groups, setGroups] = useState<ChatGroup[]>();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [scan, setScan] = useState(false);
  const [preview, setPreview] = useState<{ invite: Invite; members: { name: string; avatar?: string; portrait?: ImageSourcePropType }[] }>();
  const [avatar, setAvatar] = useState<string>();
  const [name, setName] = useState('');
  const [inviteMembers, setInviteMembers] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [result, inbox] = await Promise.all([
        request<{ groups: ChatGroup[] }>('/groups'),
        request<{ invitations: Invite[] }>('/group-invites'),
      ]);
      setGroups(result.groups);
      setInvites(inbox.invitations);
      setError('');
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setRefreshing(false);
    }
  }, [request]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  function open(id: string) {
    router.push({ pathname: '/group/[id]', params: { id } });
  }
  function decide(invite: Invite, accept: boolean) {
    void run(async () => {
      const result = await request<{ groupId?: string }>('/group-invites/' + (accept ? 'accept' : 'decline'), {
        method: 'POST',
        body: { id: invite.id },
      });
      setInvites((current) => current.filter((item) => item.id !== invite.id));
      if (result.groupId) open(result.groupId);
    });
  }

  const actions = <>
    <IconButton label="扫描群邀请" icon="scan-outline" onPress={() => setScan(true)} />
    <IconButton label="创建群聊" icon="add-outline" onPress={() => { setAvatar(undefined); setCreating(true); }} />
  </>;
  const children = <>
      {!!error && !creating && <Notice>{error}</Notice>}
      <Section title="待确认的邀请" />
      {!invites.length && <Text style={styles.muted}>有人邀请你时，会在这里等你确认。</Text>}
      {invites.map((invite) => (
        <MaterialCard key={invite.id}>
          <ListRow title={invite.name} detail={invite.inviter + ' 邀请你加入 · ' + invite.memberCount + ' 位成员'}
            left={<GroupPortrait name={invite.name} avatar={invite.avatar} />} onPress={() => void run(async () => {
              const result = await request<{ members: { name: string; avatar?: string; portrait?: ImageSourcePropType }[] }>(
                '/group-invites/' + invite.id + '/members');
              setPreview({ invite, members: result.members });
            })} />
          <View style={[styles.row, { justifyContent: 'flex-end' }]}>
            <Button label="拒绝" variant="quiet" disabled={busy} onPress={() => decide(invite, false)} />
            <Button label="接受" variant="gradient" disabled={busy} onPress={() => decide(invite, true)} />
          </View>
        </MaterialCard>
      ))}
      <Section title="我加入的群聊" />
      {!groups && !error && <Empty busy>正在读取群聊…</Empty>}
      {groups?.length === 0 && <Empty>暂无群聊。你可以创建属于朋友的小群。</Empty>}
      {groups?.map((group) => (
        <MaterialCard key={group.id}>
          <ListRow
            title={group.name}
            detail={group.memberCount + ' 位成员'}
            left={<GroupPortrait name={group.name} avatar={group.avatar} />}
            onPress={() => open(group.id)}
          />
        </MaterialCard>
      ))}
      {preview && <Sheet title={preview.invite.name} onClose={() => setPreview(undefined)}>
        <Section title="群成员" />
        {preview.members.map((member, i) => <ListRow key={i} title={member.name}
          left={<Avatar name={member.name} source={member.avatar ? { uri: 'data:image/jpeg;base64,' + member.avatar } : member.portrait} size={36} />} />)}
      </Sheet>}
      {creating && (
        <Sheet
          avoidKeyboard
          title="创建群聊"
          onClose={() => {
            if (!busy) setCreating(false);
          }}
        >
          <Text style={styles.muted}>群聊建立后，你可以邀请好友。每位好友都需要确认加入。</Text>
          <ListRow title="选择群头像" left={<GroupPortrait name={name || '群'} avatar={avatar} />}
            onPress={() => void run(() => portraitPicker.choose(setAvatar))} />
          <TextInput
            accessibilityLabel="群聊名称"
            placeholder="给小群取个名字"
            value={name}
            maxLength={32}
            onChangeText={setName}
            style={styles.input}
          />
          <ListRow
            title="允许普通成员邀请"
            trailing={
              <LiquidSwitch accessibilityLabel="允许普通成员邀请" value={inviteMembers} onValueChange={setInviteMembers} />
            }
          />
          {!!error && <Notice>{error}</Notice>}
          <Button
            label="创建"
            variant="gradient"
            disabled={busy || !name.trim()}
            onPress={() =>
              void run(async () => {
                const { id } = await request<{ id: string }>('/groups', {
                  method: 'POST',
                  body: { name: name.trim(), membersCanInvite: inviteMembers, avatar },
                });
                setCreating(false);
                setName('');
                open(id);
              })
            }
          />
        </Sheet>
      )}
      {scan && (
        <ScanCode
          mode="group"
          onClose={() => setScan(false)}
          onResult={(code) => {
            setScan(false);
            void run(async () => {
              const { invitations } = await request<{ invitations: Invite[] }>('/group-invites/resolve', {
                method: 'POST',
                body: { code },
              });
              if (!invitations.length) throw new Error('这个邀请已失效或没有发给你。');
              setInvites((current) => [
                ...invitations,
                ...current.filter((item) => !invitations.some((found) => found.id === item.id)),
              ]);
            });
          }}
        />
      )}
    {portraitPicker.crop}
  </>;
  const reload = () => { void load(); };
  return render ? render({ actions, children, reload, refreshing }) :
    <Screen title="群聊" back={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      onRefresh={reload} refreshing={refreshing} actions={actions}>
      {children}
    </Screen>;
}
