import { router } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { Keyboard, PanResponder, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useFontScale } from '../../components/Typography';
import { Avatar, Button, Empty, Icon, IconButton, ListRow, Notice, Sheet } from '../../components/ui';
import { demoPortrait } from '../../demo/visuals';
import { errorMessage } from '../../services/api';
import { colors, contentWidth, radius, space, styles, type, weight } from '../../theme';
import { defaultGroupName, deleteGroup, groupOf, reorderGroup, saveGroup, type FriendGroup, type sortFriends } from './directory';
import { localId } from '../local/document';
import { useDirectory } from './store';

type Contact = ReturnType<typeof sortFriends>[number];

export function ContactRow({ friend, indexed }: { friend: Contact; indexed?: boolean }) {
  const large = useFontScale() > 1;
  return <Pressable accessibilityRole="button" accessibilityLabel={friend.displayName}
    onPress={() => router.push({ pathname: '/person/[id]', params: { id: friend.userId } })}
    style={({ pressed }) => [local.contact, indexed && local.contactIndexed, pressed && local.pressed]}>
    <Avatar userId={friend.userId} name={friend.name} source={demoPortrait(friend.username)} size={34} />
    <View style={local.contactText}>
      <Text numberOfLines={large ? undefined : 1} style={local.contactName}>{friend.displayName}</Text>
      {!!friend.bio && <Text numberOfLines={large ? undefined : 1} style={styles.small}>{friend.bio}</Text>}
    </View>
  </Pressable>;
}

export function AlphabetRail({ letters, onSelect }: { letters: string[]; onSelect: (letter: string) => void }) {
  const frame = useRef<ComponentRef<typeof View>>(null);
  const bounds = useRef({ top: 0, height: 0 });
  const last = useRef('');
  const latest = useRef({ letters, onSelect });
  latest.current = { letters, onSelect };
  const [active, setActive] = useState('');

  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_event, gesture) => Math.abs(gesture.dy) > 3,
    onPanResponderGrant: (_event, gesture) => {
      last.current = '';
      frame.current?.measure((_x, _y, _width, height, _pageX, top) => {
        bounds.current = { top, height };
        select(gesture.moveY);
      });
    },
    onPanResponderMove: (_event, gesture) => select(gesture.moveY),
    onPanResponderRelease: () => setActive(''),
    onPanResponderTerminate: () => setActive(''),
  })).current;

  function select(y: number) {
    const { top, height } = bounds.current;
    const { letters, onSelect } = latest.current;
    if (!height || !letters.length) return;
    const index = Math.max(0, Math.min(letters.length - 1, Math.floor((y - top) * letters.length / height)));
    const letter = letters[index];
    if (letter === last.current) return;
    last.current = letter;
    setActive(letter);
    onSelect(letter);
  }

  if (!letters.length) return null;
  return <View pointerEvents="box-none" style={local.railPosition}>
    <View pointerEvents="box-none" style={local.railColumn}>
      <View ref={frame} accessibilityLabel="好友字母索引" style={[local.rail, { height: letters.length * 21 }]}
        {...pan.panHandlers}>
        {letters.map((letter) => <Pressable key={letter} accessibilityRole="button" accessibilityLabel={letter + ' 段好友'}
          style={({ pressed }) => [local.letterKey, (active === letter || pressed) && local.letterActive]}
          onPress={() => onSelect(letter)}>
          <Text allowFontScaling={false} style={local.letterText}>{letter}</Text>
        </Pressable>)}
      </View>
    </View>
  </View>;
}

export function GroupList({ contacts, searching }: { contacts: Contact[]; searching: boolean }) {
  const store = useDirectory();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [manage, setManage] = useState(false);
  const groups = store.value?.groups ?? [];
  const buckets = new Map<string | null, Contact[]>();
  if (store.value) {
    for (const contact of contacts) {
      const id = groupOf(store.value, contact.userId);
      const bucket = buckets.get(id);
      if (bucket) bucket.push(contact);
      else buckets.set(id, [contact]);
    }
  }
  const ordered = [...groups, { id: null, name: defaultGroupName }];

  return <>
    <View style={local.manage}>
      <Button label="管理分组" icon="options-outline" variant="quiet" disabled={!store.value} onPress={() => setManage(true)} />
    </View>
    {searching && !contacts.length && <Empty icon="people-outline">找不到匹配的好友。</Empty>}
    {ordered.map(({ id, name }) => {
      const members = buckets.get(id) ?? [];
      if (searching && !members.length) return null;
      const key = id ?? '';
      const open = searching || (expanded[key] ?? id === null);
      return <View key={key}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={name + '，' + members.length + ' 位好友'}
          onPress={() => setExpanded((current) => ({ ...current, [key]: !open }))}
          style={({ pressed }) => [local.group, pressed && local.pressed]}>
          <Icon name={open ? 'chevron-down' : 'chevron-forward'} size={14} color={colors.quiet} />
          <Text style={[styles.strong, styles.grow]} numberOfLines={1}>{name}</Text>
          <Text style={styles.small}>{members.length}</Text>
        </Pressable>
        {open && members.map((friend) => <ContactRow key={friend.userId} friend={friend} />)}
        {open && !members.length && <Text style={local.empty}>暂无好友</Text>}
      </View>;
    })}
    {manage && <GroupManager onClose={() => setManage(false)} />}
  </>;
}

function GroupManager({ onClose }: { onClose: () => void }) {
  const { value, save } = useDirectory();
  const [editing, setEditing] = useState<FriendGroup>();
  const [removing, setRemoving] = useState<FriendGroup>();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');

  async function apply(change: Parameters<typeof save>[0]) {
    setBusy(true);
    setFailure('');
    try {
      await save(change);
      if (editing) Keyboard.dismiss();
      setEditing(undefined);
      setRemoving(undefined);
    } catch (error) {
      setFailure(errorMessage(error));
    } finally { setBusy(false); }
  }

  function edit(group?: FriendGroup) {
    setFailure('');
    setEditing(group ?? { id: localId(), name: '' });
    setName(group?.name ?? '');
  }

  const groups = value?.groups ?? [];
  return <Sheet avoidKeyboard title={removing ? '删除分组' : editing ? (editing.name ? '重命名分组' : '新建分组') : '管理分组'}
    onClose={() => {
      if (busy) return;
      if (editing || removing) { setEditing(undefined); setRemoving(undefined); setFailure(''); }
      else onClose();
    }}>
    {!!failure && <Notice>{failure}</Notice>}
    {removing ? <>
      <Text style={styles.muted}>删除「{removing.name}」后，组内好友会回到「{defaultGroupName}」。</Text>
      <Button label="确认删除分组" variant="danger" disabled={busy} onPress={() => void apply((data) => deleteGroup(data, removing.id))} />
    </> : editing ? <>
      <TextInput accessibilityLabel="分组名称" placeholder="分组名称" value={name} onChangeText={setName} maxLength={32}
        autoFocus editable={!busy} returnKeyType="done"
        onSubmitEditing={() => { if (!busy && name.trim()) void apply((data) => saveGroup(data, editing.id, name)); }} style={styles.input} />
      <Button label="保存分组" disabled={busy || !name.trim()} onPress={() => void apply((data) => saveGroup(data, editing.id, name))} />
    </> : <>
      <Button label="新建分组" icon="add" onPress={() => edit()} disabled={busy} />
      {groups.map((group, index) => <ListRow key={group.id} title={group.name}
        trailing={<View style={local.groupActions}>
          <IconButton label={'上移' + group.name} icon="arrow-up-outline" disabled={busy || !index}
            onPress={() => void apply((data) => reorderGroup(data, group.id, -1))} />
          <IconButton label={'下移' + group.name} icon="arrow-down-outline" disabled={busy || index === groups.length - 1}
            onPress={() => void apply((data) => reorderGroup(data, group.id, 1))} />
          <IconButton label={'重命名' + group.name} icon="create-outline" disabled={busy} onPress={() => edit(group)} />
          <IconButton label={'删除' + group.name} icon="trash-outline" disabled={busy}
            onPress={() => { setFailure(''); setRemoving(group); }} />
        </View>} />)}
    </>}
  </Sheet>;
}

const local = StyleSheet.create({
  contact: { flexDirection: 'row', alignItems: 'center', minHeight: 50, paddingHorizontal: space.md, gap: space.sm },
  contactIndexed: { paddingRight: 40 },
  contactText: { flex: 1, alignSelf: 'stretch', justifyContent: 'center', paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  contactName: { ...type.body, fontWeight: weight.medium, color: colors.text },
  pressed: { backgroundColor: colors.search },
  railPosition: { position: 'absolute', top: 0, bottom: 0, right: 0, left: 0, alignItems: 'center', paddingVertical: 16 },
  railColumn: { flex: 1, width: '100%', maxWidth: contentWidth, justifyContent: 'center', alignItems: 'flex-end', paddingRight: 4 },
  rail: { width: 28, maxHeight: '100%', borderRadius: radius.pill, backgroundColor: colors.panel },
  letterKey: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  letterActive: { backgroundColor: colors.tint },
  letterText: { color: colors.quiet, fontSize: 11, fontWeight: weight.medium, includeFontPadding: false },
  manage: { paddingHorizontal: space.md, alignItems: 'flex-end' },
  group: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: space.md,
    gap: space.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  empty: { ...type.caption, color: colors.muted, paddingHorizontal: space.lg, paddingVertical: space.sm },
  groupActions: { flexDirection: 'row' },
});
