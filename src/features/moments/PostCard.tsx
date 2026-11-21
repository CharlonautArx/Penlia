import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar, Icon, IconButton, ListRow, Sheet } from '../../components/ui';
import { colors, space, styles, type } from '../../theme';
import { InviteRecipients } from '../play/Gather';
import { momentShareCaption, momentSharePath, scopes, type Moment } from './model';
import { MomentMediaGrid } from './media';

export function PostCard({ item, onManage }: { item: Moment; onManage?: () => void }) {
  const [sharing, setSharing] = useState(false);
  const link = sharing ? Linking.createURL(momentSharePath + item.id) : '';
  return <View style={local.post}>
    <View style={styles.row}>
      <Avatar userId={item.authorId} name={item.author} size={43} />
      <View style={styles.grow}>
        <Text style={styles.strong} numberOfLines={2}>{item.author}</Text>
        <Text style={styles.small}>{new Date(item.createdAt).toLocaleString('zh-CN', {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        })}{item.scope ? ' · ' + scopes[item.scope] : ''}</Text>
      </View>
      {onManage && <IconButton label="管理这条动态" icon="ellipsis-horizontal" onPress={onManage} />}
    </View>
    {!!item.body && <Text style={local.caption}>{item.body}</Text>}
    {!!item.media.length && <MomentMediaGrid media={item.media} />}
    {!!item.collaborationId && <ListRow title="查看共同创作" left={<Icon name="people-outline" color={colors.accent} />}
      onPress={() => router.push({ pathname: '/collection/[id]', params: { id: item.collaborationId! } })}
      separator={false} />}
    {item.scope !== 'private' && <View style={local.actions}>
      <IconButton label="分享动态链接" icon="arrow-redo-outline" onPress={() => setSharing(true)} />
    </View>}
    {sharing && <Sheet title="分享动态链接" onClose={() => setSharing(false)}>
      <Text style={styles.muted}>只有本来就有权限的好友能够打开，分享链接不会更改动态可见范围。</Text>
      <Text selectable style={styles.body}>{link}</Text>
      <InviteRecipients message={momentShareCaption + '\n' + link} onChoose={() => setSharing(false)} empty="先添加好友，就能分享链接。" />
    </Sheet>}
  </View>;
}

const local = StyleSheet.create({
  post: { ...styles.divider, paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: space.xs,
    backgroundColor: colors.panel, gap: space.sm },
  caption: { ...type.body, color: colors.text },
  actions: { flexDirection: 'row', alignItems: 'center', marginLeft: -space.xs, marginTop: -space.xxs },
});
