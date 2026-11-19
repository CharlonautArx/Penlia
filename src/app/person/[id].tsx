import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, Empty, Screen } from '../../components/ui';
import { isUiDemo } from '../../demo/mode';
import { demoPortrait } from '../../demo/visuals';
import { useFriends } from '../../services/friends';
import { colors, styles } from '../../theme';

export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { relationships, refresh, error } = useFriends();
  const friend = relationships?.find((item) => item.userId === id && item.status === 'accepted');
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  return <Screen title="好友资料" back={() => router.canGoBack() ? router.back() : router.replace('/friends')}>
    {friend ? <>
      <View style={local.profile}>
        <Avatar name={friend.name} source={demoPortrait(friend.username)} size={76} />
        <Text style={local.name}>{friend.name}</Text>
        <Text style={styles.muted}>朋聊号 @{friend.username}</Text>
        <Text style={styles.body}>{friend.bio || '还没有个性签名'}</Text>
      </View>
      <Button label="发消息" icon="chatbubble-outline" variant="gradient"
        onPress={() => router.push({ pathname: '/chat/[id]', params: { id: friend.userId } })} />
      {isUiDemo && <View style={local.shortcuts}>
        <Button label="个人空间" icon="albums-outline" variant="soft"
          onPress={() => router.push({ pathname: '/space/[id]', params: { id: friend.userId } })} />
        <Button label="共同小宠物" icon="heart-circle-outline" variant="soft"
          onPress={() => router.push({ pathname: '/pet/[id]', params: { id: friend.userId } })} />
      </View>}
    </> : <Empty busy={!relationships && !error}>{error || (relationships ? '找不到这位好友。' : '正在加载资料…')}</Empty>}
  </Screen>;
}

const local = StyleSheet.create({
  profile: { ...styles.card, padding: 20, alignItems: 'center', backgroundColor: colors.panel, gap: 8 },
  shortcuts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  name: { fontSize: 24, fontWeight: '800', color: colors.text },
});
