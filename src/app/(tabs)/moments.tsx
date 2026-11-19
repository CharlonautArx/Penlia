import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Empty, Icon, IconButton, ListRow, Notice, Screen, Sheet } from '../../components/ui';
import { demoPortrait } from '../../demo/visuals';
import { EntryCard } from '../../features/space/EntryCard';
import type { EntryKind } from '../../features/space/model';
import { useSpace } from '../../features/space/store';
import { colors, styles } from '../../theme';

export default function MomentsScreen() {
  const { mine } = useLocalSearchParams<{ mine?: string }>();
  const state = useSpace();
  const [actions, setActions] = useState(false);
  const me = state.me;
  if (!me) return null;
  const entries = state.value?.entries.filter((entry) => state.entryVisible(entry) && (mine !== '1' || entry.ownerId === me.id))
    .sort((a, b) => b.at - a.at) ?? [];
  const draftCount = Object.values(state.value?.drafts ?? {}).filter(Boolean).length;

  function compose(kind: EntryKind) {
    setActions(false);
    router.push({ pathname: '/space/compose', params: { kind } });
  }

  return <Screen title="动态" solid inset={false} actions={
    <>
      <IconButton label="我的空间" icon="person-circle-outline"
        onPress={() => router.push({ pathname: '/space/[id]', params: { id: me.id } })} />
      <IconButton label="发布动态" icon="create-outline" tinted onPress={() => setActions(true)} />
    </>
  }>
    <View style={local.feedBar}>
      <View style={local.feedTabs}>
        {[['全部动态', '0'], ['我的动态', '1']].map(([label, value]) => {
          const selected = (mine === '1' ? '1' : '0') === value;
          return <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => router.setParams({ mine: value })}
            style={[local.tab, selected && local.selected]}>
            <Text style={selected ? local.selectedText : styles.muted}>{label}</Text>
          </Pressable>;
        })}
      </View>
      <Text style={styles.small}>仅此设备</Text>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="发说说" style={({ pressed }) => [local.quick, pressed && local.pressed]}
      onPress={() => compose('thought')}>
      <Avatar name={me.name} source={demoPortrait(me.username)} size={32} />
      <Text style={[styles.muted, styles.grow]}>写条说说…</Text>
      {draftCount > 0 && <Text style={local.draft}>草稿 {draftCount}</Text>}
      <Icon name="image-outline" color={colors.accent} size={18} />
    </Pressable>
    {!!state.error && <View style={local.inset}><Notice action="重试" onAction={state.retry}>{state.error}</Notice></View>}
    {state.loading && <Empty busy>正在读取本机动态…</Empty>}
    {!state.loading && !state.error && !entries.length && <Empty icon="create-outline">还没有动态。写下今天的一件小事吧。</Empty>}
    {entries.map((entry) => <EntryCard key={entry.id} entry={entry} />)}
    {actions && <Sheet title="发布动态" onClose={() => setActions(false)}>
      <ListRow title="发说说" detail={state.value?.drafts.thought ? '继续本机草稿' : '记录此刻的想法和照片'}
        left={<Icon name="chatbox-ellipses-outline" color={colors.accent} />} onPress={() => compose('thought')} />
      <ListRow title="写日志" detail={state.value?.drafts.journal ? '继续本机草稿' : '写一段想留住的生活'}
        left={<Icon name="book-outline" color={colors.accent} />} onPress={() => compose('journal')} />
    </Sheet>}
  </Screen>;
}

const local = StyleSheet.create({
  inset: { paddingHorizontal: 16 },
  feedBar: { ...styles.row, ...styles.divider, justifyContent: 'space-between', paddingHorizontal: 16, minHeight: 51 },
  feedTabs: { flexDirection: 'row', gap: 15 },
  tab: { minHeight: 46, justifyContent: 'center', borderBottomWidth: 2, borderColor: 'transparent' },
  selected: { borderColor: '#E46986' },
  selectedText: { ...styles.strong, color: colors.accent },
  quick: { ...styles.row, marginHorizontal: 16, marginVertical: 10, paddingHorizontal: 11, minHeight: 50,
    borderRadius: 12, backgroundColor: colors.backdrop },
  pressed: { opacity: 0.7 },
  draft: { ...styles.small, color: colors.accent },
});
