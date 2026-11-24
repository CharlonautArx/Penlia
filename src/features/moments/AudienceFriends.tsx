import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar, Icon, IconButton, SearchField } from '../../components/ui';
import { demoPortrait } from '../../demo/visuals';
import type { Relationship } from '../../services/api';
import { colors, space, styles, touch } from '../../theme';
import { defaultGroupName, emptyDirectory, displayName, groupOf } from '../friends/directory';
import { useDirectory } from '../friends/store';

export function AudienceFriends({ friends, ids, update }: { friends: Relationship[]; ids: string[]; update: (ids: string[]) => void }) {
  const { value = emptyDirectory } = useDirectory();
  const [query, setQuery] = useState('');
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const chosen = new Set(ids);
  const term = query.trim().replace(/^@/, '').toLowerCase();
  const groups = useMemo(() => {
    const map = new Map<string | null, Relationship[]>();
    for (const friend of friends) {
      const key = groupOf(value, friend.userId);
      const members = map.get(key) ?? [];
      members.push(friend);
      map.set(key, members);
    }
    return [...value.groups, { id: null, name: defaultGroupName }].map((group) => ({
      ...group, members: (map.get(group.id) ?? []).sort((a, b) => displayName(a, value).localeCompare(displayName(b, value), 'zh-CN')),
    }));
  }, [friends, value]);
  function toggle(members: Relationship[], checked: boolean) {
    const next = new Set(chosen);
    for (const { userId } of members) {
      if (checked) next.delete(userId);
      else next.add(userId);
    }
    update([...next]);
  }
  return <View style={local.list}>
    <Text style={styles.strong} accessibilityLiveRegion="polite">已选 {friends.filter((person) => chosen.has(person.userId)).length} 位好友</Text>
    {friends.length > 6 && <SearchField label="筛选好友" placeholder="搜索好友" value={query} onChangeText={setQuery} />}
    {!friends.length && <Text style={styles.muted}>暂无可以选择的好友。</Text>}
    {groups.map((group) => {
      const key = group.id ?? '';
      const open = !!term || !closed.has(key);
      const selected = group.members.filter((friend) => chosen.has(friend.userId)).length;
      const checked = group.members.length > 0 && selected === group.members.length;
      const shown = group.members.filter((friend) => !term ||
        [displayName(friend, value), friend.name, friend.username].some((name) => name.toLowerCase().includes(term)));
      if (term && !shown.length) return null;
      const expand = () => setClosed((old) => {
        const next = new Set(old);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
      });
      return <View key={key}>
        <View style={[styles.row, styles.divider]}>
          <Pressable style={local.check} accessibilityRole="checkbox" accessibilityLabel={'选择整组 ' + group.name}
            accessibilityState={{ checked: checked ? true : selected ? 'mixed' : false, disabled: !group.members.length }}
            disabled={!group.members.length} onPress={() => toggle(group.members, checked)}>
            <Icon name={checked ? 'checkmark-circle' : selected ? 'remove-circle-outline' : 'ellipse-outline'} size={21} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={group.name} accessibilityState={{ expanded: open }}
            onPress={expand} style={[styles.grow, local.expand]}>
            <Text style={styles.strong}>{group.name} <Text style={styles.small}>{selected}/{group.members.length}</Text></Text>
          </Pressable>
          <IconButton label={(open ? '收起 ' : '展开 ') + group.name} icon={open ? 'chevron-up' : 'chevron-down'} onPress={expand} />
        </View>
        {open && shown.map((friend) => {
          const name = displayName(friend, value);
          const selected = chosen.has(friend.userId);
          return <Pressable key={friend.userId} accessibilityRole="checkbox" accessibilityLabel={name}
            accessibilityState={{ checked: selected }} onPress={() => toggle([friend], selected)} style={[styles.row, local.friend]}>
            <Avatar userId={friend.userId} name={name} source={demoPortrait(friend.username)} size={34} />
            <View style={styles.grow}><Text style={styles.body}>{name}</Text><Text style={styles.small}>{group.name}</Text></View>
            <Icon name={selected ? 'checkmark-circle' : 'ellipse-outline'} color={selected ? colors.accent : colors.quiet} size={20} />
          </Pressable>;
        })}
      </View>;
    })}
  </View>;
}

const local = StyleSheet.create({
  list: { gap: space.xs },
  check: { minHeight: touch, minWidth: touch, alignItems: 'center', justifyContent: 'center' },
  expand: { minHeight: touch, justifyContent: 'center' },
  friend: { minHeight: 52, paddingLeft: space.lg, paddingRight: space.sm },
});
