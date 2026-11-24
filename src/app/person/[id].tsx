import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Button, Empty, Icon, IconButton, ListRow, Notice, Sheet, TopBar } from '../../components/ui';
import { isUiDemo } from '../../demo/mode';
import { demoPortrait } from '../../demo/visuals';
import { nativeChatBackgrounds } from '../../features/chat/background/store';
import { displayName, emptyDirectory } from '../../features/friends/directory';
import { FriendDetailsEditor } from '../../features/friends/FriendDetailsEditor';
import { EditProfileCover, ProfileCoverImage, useProfileCover } from '../../features/friends/ProfileCover';
import { useDirectory } from '../../features/friends/store';
import { errorMessage, type User } from '../../services/api';
import { useFriends } from '../../services/friends';
import { formatHandle } from '../../services/handle';
import { useSession } from '../../services/session';
import { colors, contentWidth, radius, space, styles, type } from '../../theme';

type Management = 'menu' | 'directory' | 'cover' | 'restrict' | 'remove' | 'block';

export default function PersonRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PersonScreen key={id} id={id} />;
}

function PersonScreen({ id }: { id: string }) {
  const { request, session, demoAvatarKey } = useSession();
  const { relationships, refresh, error } = useFriends();
  const directory = useDirectory();
  const { width } = useWindowDimensions();
  const [profile, setProfile] = useState<User>();
  const [failure, setFailure] = useState('');
  const [actionFailure, setActionFailure] = useState('');
  const [management, setManagement] = useState<Management>();
  const [busy, setBusy] = useState(false);
  const own = id === session?.user.id;
  const cover = useProfileCover(id, own);
  const friend = relationships?.find((item) => item.userId === id && item.status === 'accepted');
  const person = own ? session?.user : friend && (isUiDemo ? friend : profile);

  useFocusEffect(useCallback(() => {
    let active = true;
    if (!own) {
      void refresh();
      if (!isUiDemo) void request<{ user: User }>('/people/' + id)
        .then(({ user }) => { if (active) { setProfile(user); setFailure(''); } })
        .catch((error) => { if (active) { setProfile(undefined); setFailure(errorMessage(error)); } });
    }
    return () => { active = false; };
  }, [id, own, refresh, request]));

  async function manage(action: 'restrict' | 'remove' | 'block') {
    setBusy(true);
    setActionFailure('');
    try {
      await request('/friends/' + action, { method: 'POST', body: { userId: id } });
      await refresh();
      router.replace('/friends');
    } catch (error) { setActionFailure(errorMessage(error)); }
    finally { setBusy(false); }
  }

  const name = person && (own ? person.name : displayName({ userId: id, name: person.name }, directory.value ?? emptyDirectory));
  const insets = useSafeAreaInsets();
  const coverWidth = Math.max(1, Math.min(width - insets.left - insets.right, contentWidth));
  const coverHeight = Math.max(190, Math.min(300, coverWidth * 0.53));
  const openSpace = () => router.push({ pathname: '/life/timeline/[id]', params: { id } });

  return <SafeAreaView style={local.safe} edges={['top', 'left', 'right', 'bottom']}>
    <TopBar title={own ? '个人主页' : '好友主页'} actions={own
      ? <IconButton label="编辑主页背景" icon="image-outline" disabled={!cover.ready} onPress={() => setManagement('cover')} />
      : person && <IconButton label="好友设置" icon="ellipsis-horizontal" onPress={() => setManagement('menu')} />}
      back={() => router.canGoBack() ? router.back() : router.replace(own ? '/profile' : '/friends')} />
    {person ? <>
      <ScrollView contentContainerStyle={local.column} showsVerticalScrollIndicator={false}>
        <ProfileCoverImage photo={cover.photo} height={coverHeight} fades />
        <View style={local.details}>
          <View style={local.identity}>
            <View style={local.avatarFrame}>
              <Avatar userId={id} name={person.name} source={demoPortrait((own && demoAvatarKey) || person.username)} size={88} />
            </View>
            <View style={[styles.grow, local.metadata]}>
              <Text accessibilityRole="header" style={local.name}>{name}</Text>
              <Text style={styles.muted}>昵称：{person.name}</Text>
              <Text selectable style={styles.muted}>朋聊号：{formatHandle(person.username)}</Text>
            </View>
          </View>
          {!!person.bio && <Text style={styles.body}>{person.bio}</Text>}
          {own && !!cover.failure && <Notice>{cover.failure}</Notice>}
          <View style={local.spaceEntry}>
            <ListRow title="个人空间" left={<Icon name="albums-outline" />}
              trailing={<Icon name="chevron-forward" size={16} color={colors.quiet} />} onPress={openSpace} separator={false} />
          </View>
        </View>
      </ScrollView>
      {!own && <View style={[local.column, local.footer]}>
        <Button label="发消息" icon="chatbubble-outline"
          onPress={() => router.push({ pathname: '/chat/[id]', params: { id } })} />
      </View>}
    </> : <View style={local.details}><Empty busy={!failure && !error && (!relationships || !!friend)}>
      {failure || error || (relationships && !friend ? '找不到这位好友。' : '正在加载资料…')}
    </Empty></View>}
    {management === 'cover' && own && <EditProfileCover ratio={coverWidth / coverHeight} cover={cover} onClose={() => setManagement(undefined)} />}
    {management === 'directory' && friend && <FriendDetailsEditor id={id} name={friend.name} onClose={() => setManagement(undefined)} />}
    {management === 'menu' && friend && <Sheet title="好友设置" onClose={() => setManagement(undefined)}>
      <ListRow title="备注与分组" left={<Icon name="bookmark-outline" />} onPress={() => setManagement('directory')} />
      {nativeChatBackgrounds && <ListRow title="聊天背景" left={<Icon name="image-outline" />} onPress={() => {
        setManagement(undefined);
        router.push({ pathname: '/chat-background', params: { peer: id } });
      }} />}
      {isUiDemo ? <ListRow title="共同小宠物" left={<Icon name="heart-circle-outline" />} onPress={() => {
        setManagement(undefined);
        router.push({ pathname: '/pet/[id]', params: { id } });
      }} /> : ([
        ['restrict', '限制对方查看我的内容', 'eye-off-outline'],
        ['remove', '删除好友', 'person-remove-outline'],
        ['block', '拉黑', 'ban-outline'],
      ] as const).map(([action, title, icon]) => <ListRow key={action} title={title}
        left={<Icon name={icon} color={action === 'block' ? colors.danger : colors.ink} />}
        onPress={() => { setActionFailure(''); setManagement(action); }} />)}
    </Sheet>}
    {(management === 'restrict' || management === 'remove' || management === 'block') &&
      <Sheet title={management === 'block' ? '拉黑联系人' : management === 'restrict' ? '限制内容访问' : '删除好友'}
        onClose={() => { if (!busy) setManagement(undefined); }}>
        <Text style={styles.muted}>{management === 'block' ? '拉黑后彼此无法发起私聊、申请或邀请。你可以在隐私中心管理黑名单。'
          : management === 'restrict' ? '对方无法再查看你的动态、签名和休息状态。你们仍可正常聊天。'
            : '删除后如需重新聊天，需要再次完成好友确认。'}</Text>
        {!!actionFailure && <Notice>{actionFailure}</Notice>}
        <Button label={management === 'block' ? '确认拉黑' : management === 'restrict' ? '确认限制' : '确认删除好友'}
          variant="danger" disabled={busy} onPress={() => void manage(management)} />
      </Sheet>}
  </SafeAreaView>;
}

const local = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.panel },
  column: { width: '100%', maxWidth: contentWidth, alignSelf: 'center' },
  details: { paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.sm },
  identity: { ...styles.row, marginTop: -28, alignItems: 'center' },
  avatarFrame: { borderWidth: 4, borderColor: colors.panel, borderRadius: radius.pill,
    backgroundColor: colors.panel, alignSelf: 'flex-start' },
  name: { ...type.hero, color: colors.text },
  metadata: { gap: 2, paddingTop: space.xl },
  spaceEntry: { marginTop: space.sm, marginHorizontal: -space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  footer: { paddingHorizontal: space.md, paddingTop: space.xs, paddingBottom: space.md },
});
