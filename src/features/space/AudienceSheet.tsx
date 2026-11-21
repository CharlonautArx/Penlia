import { GlassLayer } from '../../components/material';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, Icon, SearchField, Sheet } from '../../components/ui';
import { demoPortrait } from '../../demo/visuals';
import type { Relationship } from '../../services/api';
import { colors, styles } from '../../theme';
import { audienceOptions, selectableAudience, type Audience } from './model';

export function AudienceSheet({ title = '谁可以看', initial, friends, onSave, onClose }: {
  title?: string; initial: Audience; friends: Relationship[]; onSave: (audience: Audience) => void; onClose: () => void;
}) {
  const [audience, setAudience] = useState(initial);
  const [query, setQuery] = useState('');
  const chosen = selectableAudience(audience, friends.map(({ userId }) => userId));
  const specific = chosen.mode === 'allow' || chosen.mode === 'deny';
  const term = query.trim().toLowerCase();
  const shown = friends.filter((friend) => !term || friend.name.toLowerCase().includes(term) || friend.username.toLowerCase().includes(term));
  return <Sheet title={title} onClose={onClose} footer={
    <View style={local.footer}>
      {specific && <Text style={styles.small}>{chosen.ids.length} 位已选</Text>}
      <Button label="确认范围" variant="gradient" disabled={specific && !chosen.ids.length} onPress={() => onSave(chosen)} />
    </View>
  }>
    <View style={local.options}>
      {audienceOptions.map(({ key, name, help }) => <Choice key={key} label={name} detail={help} picked={audience.mode === key}
        onPress={() => setAudience((current) => current.mode === key ? current : { mode: key, ids: [] })} />)}
    </View>
    {specific && <>
      <Text style={styles.strong}>{chosen.mode === 'allow' ? '选择可以看的好友' : '选择看不到的好友'}</Text>
      {friends.length > 12 && <SearchField label="筛选好友" value={query} onChangeText={setQuery} placeholder="昵称或朋聊号" />}
      {shown.length === 0 && <Text style={styles.muted}>{term ? '没有匹配的好友。' : '当前没有可以选择的好友。'}</Text>}
      <View style={local.options}>
        {shown.map((friend) => <Choice key={friend.userId} label={friend.name} picked={chosen.ids.includes(friend.userId)}
          left={<Avatar name={friend.name} source={demoPortrait(friend.username)} size={34} />}
          onPress={() => setAudience((current) => ({
            ...current, ids: current.ids.includes(friend.userId) ? current.ids.filter((id) => id !== friend.userId) : [...current.ids, friend.userId],
          }))} />)}
      </View>
    </>}
  </Sheet>;
}

export function Choice({ label, detail, picked, onPress, left }: {
  label: string; detail?: string; picked: boolean; onPress: () => void; left?: React.ReactNode;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: picked }}
    onPress={onPress} style={({ pressed }) => [local.choice, pressed && local.pressed]}>
    {picked && <GlassLayer roundness={0} />}
    {left}
    <View style={styles.grow}>
      <Text style={styles.strong}>{label}</Text>
      {detail && <Text style={styles.small}>{detail}</Text>}
    </View>
    <Icon name={picked ? 'radio-button-on' : 'radio-button-off-outline'}
      color={picked ? colors.accent : colors.quiet} size={20} />
  </Pressable>;
}

const local = StyleSheet.create({
  footer: { gap: 5 },
  options: { borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  choice: { ...styles.row, ...styles.divider, minHeight: 48, paddingHorizontal: 12, paddingVertical: 8 },
  pressed: { opacity: 0.72 },
});
