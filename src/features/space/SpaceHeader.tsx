import { formatHandle } from '../../services/handle';
import { LinearGradient } from 'expo-linear-gradient';
import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassLayer } from '../../components/material';
import { Avatar, Icon, IconButton, type IconName } from '../../components/ui';
import { demoPortrait } from '../../demo/visuals';
import { colors, contentWidth, palette, radius, space, styles, touch, type } from '../../theme';
import type { SharedValue } from 'react-native-reanimated';
import { coverTones, ImmersiveCover } from './ImmersiveCover';
import { SpacePhoto } from './media';
import type { Cover, SpaceCard } from './model';

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

export function SpaceHeader({ person, card, avatarKey, onAvatar, onCover, pane, onPane, counts, immersive, showsCollections = true }: {
  person: { id: string; name: string; username: string };
  card: SpaceCard;
  immersive?: { width: number; resting: number; reserve: number; top: number; reveal: SharedValue<number> };
  avatarKey?: string;
  onAvatar?: () => void;
  onCover?: () => void;
  showsCollections?: boolean;
  pane: SpacePane;
  onPane: (pane: SpacePane) => void;
  counts?: Partial<Record<SpacePane, number>>;
}) {
  const avatar = <Avatar userId={person.id} name={person.name} source={demoPortrait(avatarKey ?? person.username)} size={62} />;
  const press = useRef<{ x: number; y: number; moved: boolean } | undefined>(undefined);
  const coverImage = immersive && <ImmersiveCover cover={card.cover} {...immersive} />;
  return <View style={immersive ? local.home : local.header}>
    {immersive ? <View>
      {onCover ? <Pressable accessibilityRole="button" accessibilityLabel="更换空间封面"
        onPressIn={({ nativeEvent }) => { press.current = { x: nativeEvent.pageX, y: nativeEvent.pageY, moved: false }; }}
        onPressMove={({ nativeEvent }) => {
          const start = press.current;
          if (start && Math.hypot(nativeEvent.pageX - start.x, nativeEvent.pageY - start.y) > space.xs) start.moved = true;
        }}
        onPress={({ nativeEvent }) => {
          const start = press.current;
          press.current = undefined;
          if (!start || nativeEvent.pageX == null || (!start.moved
            && Math.hypot(nativeEvent.pageX - start.x, nativeEvent.pageY - start.y) <= space.xs)) onCover();
        }}
        style={({ pressed }) => pressed && local.coverPressed}>{coverImage}</Pressable> : coverImage}
      <LinearGradient pointerEvents="none" colors={['#FFFFFF00', '#FFFFFF28', '#FFFFFFA3', '#FFFFFFF2', '#FFFFFF']}
        locations={[0, 0.23, 0.58, 0.86, 1]} style={local.fade} />
    </View> : <CoverPreview cover={card.cover} />}
    {!immersive && onCover && <View style={local.coverAction}>
      <IconButton label="更换空间封面" icon="image-outline" onPress={onCover} tinted />
    </View>}
    <View style={[local.identity, immersive && local.homeIdentity]}>
      {onAvatar ? <Pressable accessibilityRole="button" accessibilityLabel="查看我的动态" onPress={onAvatar}
        style={({ pressed }) => [local.avatar, immersive && local.homeAvatar, pressed && local.pressed]}>{avatar}</Pressable>
        : <View style={local.avatar}>{avatar}</View>}
      <View style={[styles.grow, local.identityText]}>
        <Text style={[local.name, immersive && local.homeName]}>{person.name}</Text>
        <Text style={[styles.small, immersive && local.homeMeta]}>{formatHandle(person.username)}{card.region ? ' · ' + card.region : ''}</Text>
      </View>
    </View>
    <View style={[local.panes, immersive && local.homePanes]}>
      {panes.filter(({ key }) => showsCollections || key === 'thought').map(({ key, title, icon }) => <Pressable key={key} accessibilityRole="button" accessibilityLabel={title}
        accessibilityHint={counts && counts[key] !== undefined ? `${counts[key]} 条` : undefined}
        accessibilityState={{ selected: key === pane }} onPress={() => onPane(key)}
        style={({ pressed }) => [local.pane, pressed && local.pressed]}>
        {key === pane && <GlassLayer roundness={radius.control} />}
        {counts ? <Text style={local.count}>{counts[key] ?? '—'}</Text> : <Icon name={icon} size={20} color={immersive && key !== pane ? palette.light.ink : colors.ink} />}
        <Text style={[key === pane ? styles.strong : styles.muted, immersive && key !== pane && local.homeMeta, local.paneLabel]}>{title}</Text>
      </Pressable>)}
    </View>
  </View>;
}

const local = StyleSheet.create({
  header: { backgroundColor: colors.panel, overflow: 'hidden', borderRadius: radius.sheet },
  home: { backgroundColor: '#FFFFFF' },
  fade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 130 },
  homeIdentity: { marginTop: -68, width: '100%', maxWidth: contentWidth, alignSelf: 'center' },
  homeAvatar: { backgroundColor: '#FFFFFF' },
  homeName: { color: palette.light.text },
  homeMeta: { color: palette.light.quiet },
  homePanes: { width: '100%', alignSelf: 'center', maxWidth: contentWidth, backgroundColor: '#FFFFFF' },
  cover: { height: 158, overflow: 'hidden' },
  shade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 88 },
  coverAction: { position: 'absolute', top: space.sm, right: space.sm },
  coverPressed: { opacity: 0.94 },
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
