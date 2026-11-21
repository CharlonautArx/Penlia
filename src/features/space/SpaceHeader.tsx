import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassLayer } from '../../components/material';
import { Avatar, Icon, IconButton, type IconName } from '../../components/ui';
import { demoPortrait } from '../../demo/visuals';
import { colors, radius, space, styles, touch, type } from '../../theme';
import { SpacePhoto } from './media';
import type { Cover, SpaceCard } from './model';

export const coverTones = {
  mist: ['#F5D7E4', '#E5DDEE', '#C9EAE9'],
  dawn: ['#F9DAE2', '#FDEDE9', '#F1DFC7'],
  blue: ['#ECDDF6', '#E5E6F7', '#C7F0ED'],
} as const;

export type SpacePane = 'thought' | 'journal' | 'albums';
const panes: readonly { key: SpacePane; title: string; icon: IconName }[] = [
  { key: 'thought', title: '动态', icon: 'chatbubble-ellipses-outline' },
  { key: 'journal', title: '日志', icon: 'book-outline' },
  { key: 'albums', title: '相册', icon: 'images-outline' },
];

export function CoverPreview({ cover }: { cover: Cover }) {
  return <View style={local.cover}>
    <LinearGradient colors={coverTones[cover.tone]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={StyleSheet.absoluteFill} />
    {cover.photo && <SpacePhoto photo={cover.photo} style={StyleSheet.absoluteFill} label="空间封面" />}
    <LinearGradient colors={['#21182800', '#21182855']} style={local.shade} />
  </View>;
}

export function SpaceHeader({ person, card, avatarKey, onAvatar, onCover, pane, onPane, counts, showsCollections = true }: {
  person: { id: string; name: string; username: string };
  card: SpaceCard;
  avatarKey?: string;
  onAvatar?: () => void;
  onCover?: () => void;
  showsCollections?: boolean;
  pane: SpacePane;
  onPane: (pane: SpacePane) => void;
  counts?: Partial<Record<SpacePane, number>>;
}) {
  const avatar = <Avatar userId={person.id} name={person.name} source={demoPortrait(avatarKey ?? person.username)} size={62} />;
  return <View style={local.header}>
    <CoverPreview cover={card.cover} />
    {onCover && <View style={local.coverAction}>
      <IconButton label="更换空间封面" icon="image-outline" onPress={onCover} tinted />
    </View>}
    <View style={local.identity}>
      {onAvatar ? <Pressable accessibilityRole="button" accessibilityLabel="查看我的动态" onPress={onAvatar}
        style={({ pressed }) => [local.avatar, pressed && local.pressed]}>{avatar}</Pressable>
        : <View style={local.avatar}>{avatar}</View>}
      <View style={[styles.grow, local.identityText]}>
        <Text style={local.name}>{person.name}</Text>
        <Text style={styles.small}>@{person.username}{card.region ? ' · ' + card.region : ''}</Text>
      </View>
    </View>
    <View style={local.panes}>
      {panes.filter(({ key }) => showsCollections || key === 'thought').map(({ key, title, icon }) => <Pressable key={key} accessibilityRole="button" accessibilityLabel={title}
        accessibilityHint={counts && counts[key] !== undefined ? `${counts[key]} 条` : undefined}
        accessibilityState={{ selected: key === pane }} onPress={() => onPane(key)}
        style={({ pressed }) => [local.pane, pressed && local.pressed]}>
        {key === pane && <GlassLayer roundness={radius.control} />}
        {counts ? <Text style={local.count}>{counts[key] ?? '—'}</Text> : <Icon name={icon} size={20} />}
        <Text style={[key === pane ? styles.strong : styles.muted, local.paneLabel]}>{title}</Text>
      </Pressable>)}
    </View>
  </View>;
}

const local = StyleSheet.create({
  header: { backgroundColor: colors.panel, overflow: 'hidden', borderRadius: radius.sheet },
  cover: { height: 158, overflow: 'hidden' },
  shade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 88 },
  coverAction: { position: 'absolute', top: space.sm, right: space.sm },
  identity: { ...styles.row, alignItems: 'flex-end', paddingHorizontal: space.md, marginTop: -25 },
  avatar: { backgroundColor: colors.panel, borderRadius: radius.pill, padding: 3 },
  identityText: { paddingTop: 27, paddingBottom: space.xxs },
  name: { ...type.title, color: colors.text },
  panes: { ...styles.row, alignItems: 'stretch', padding: space.sm, gap: space.xs },
  pane: { flex: 1, minWidth: 0, minHeight: touch, justifyContent: 'center', alignItems: 'center', paddingVertical: space.xs, gap: 2 },
  paneLabel: { textAlign: 'center' },
  count: { ...type.heading, color: colors.text },
  pressed: { opacity: 0.74 },
});
