import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon, IconButton } from '../../components/ui';
import { useFriends, useIdentityResolver } from '../../services/friends';
import { colors, radius, space, styles } from '../../theme';
import { demoPortrait } from '../../demo/visuals';
import { displayName, emptyDirectory } from '../friends/directory';
import { useDirectory } from '../friends/store';
import type { RecordEntry } from '../chat/MessageManagement';
import { type Media, useProtectedSource } from '../moments/media';
import { lifeDemoImages } from '../../demo/life-assets';
import { placeCaption } from '../play/place-card-model';
import { createdTime } from '../space/model';

type Sender = Pick<RecordEntry, 'authorId' | 'author'>;
export type ChatFavoritePreview = {
  line: Pick<RecordEntry, 'body' | 'time' | 'kind'> & Sender;
  thumbnail?: Media | null;
  count: number;
};

export function useSavedSender({ author, authorId }: Sender) {
  const resolve = useIdentityResolver();
  const { relationships } = useFriends();
  const { value } = useDirectory();
  const directory = value ?? emptyDirectory;
  const legacy = authorId ? [] : (relationships ?? []).filter(
    (friend) => friend.status === 'accepted' &&
      (friend.name === author || displayName(friend, directory) === author),
  );
  const id = authorId ?? (legacy.length === 1 ? legacy[0].userId : undefined);
  const identity = resolve(id);
  return { id, name: id ? displayName({ userId: id, name: identity?.name || author }, directory) : author,
    source: identity && demoPortrait(identity.username) };
}

function Thumbnail({ media }: { media: Media }) {
  const { source } = useProtectedSource(media.id, true, undefined, true);
  const preview = media.demoAsset ? lifeDemoImages[media.demoAsset] : media.demoThumbnail || media.demoUri
    ? { uri: media.demoThumbnail ?? media.demoUri } : source;
  return <View style={local.thumb}>
    {preview ? <Image accessible={false} source={preview} resizeMode="cover" style={StyleSheet.absoluteFill} />
      : <Icon name="image-outline" size={20} color={colors.quiet} />}
  </View>;
}

export function ChatFavorite({ preview, fallback, open, options }: {
  preview?: ChatFavoritePreview;
  fallback: string;
  open: () => void;
  options: () => void;
}) {
  const { line, thumbnail, count } = preview ?? { line: undefined, thumbnail: undefined, count: 0 };
  const { name } = useSavedSender(line ?? { author: '' });
  const label = line?.body ? placeCaption(line.body) : thumbnail ? '图片' : line?.kind === 'video' ? '短视频' : fallback;
  return <View style={local.row}>
    <Pressable accessibilityRole="button" accessibilityLabel={'查看收藏 ' + label} onPress={open}
      style={({ pressed }) => [local.content, pressed && { opacity: 0.68 }]}>
      <View style={[styles.grow, local.text]}>
        <Text style={styles.body} numberOfLines={2}>{label}</Text>
        {!!line && <Text style={styles.small}>{name} · {createdTime(line.time)}{count > 1 ? ' · ' + count + ' 条消息' : ''}</Text>}
      </View>
      {!!thumbnail && <Thumbnail media={thumbnail} />}
    </Pressable>
    <IconButton label="收藏选项" icon="ellipsis-horizontal" onPress={options} />
  </View>;
}

const local = StyleSheet.create({
  row: { ...styles.row, paddingLeft: space.sm, gap: 2, minHeight: 74, borderRadius: radius.surface, backgroundColor: colors.panel },
  content: { ...styles.row, ...styles.grow, paddingVertical: space.xs, minHeight: 58 },
  text: { gap: 5 },
  thumb: { width: 54, height: 54, borderRadius: radius.small, backgroundColor: colors.search,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
