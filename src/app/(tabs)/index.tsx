import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Screen } from '../../components/ui';
import { peopleById } from '../../demo-data';
import { useDemo } from '../../demo-store';
import { colors, styles } from '../../theme';

export default function ChatsScreen() {
  const { demo } = useDemo();
  const conversations = demo.friendIds.flatMap((id) => {
    const person = peopleById.get(id);
    const lastMessage = demo.messages[id]?.at(-1);
    return person && lastMessage ? [{ person, lastMessage }] : [];
  }).sort((a, b) => b.lastMessage.timestamp - a.lastMessage.timestamp);

  return (
    <Screen title="聊天" subtitle="查看最近会话，或去好友列表发起聊天。">
      <View style={local.hero}>
        <View style={local.heroIcon}>
          <Ionicons name="chatbubble-ellipses-outline" size={26} color="#E4F1D8" />
        </View>
        <View style={styles.grow}>
          <Text style={local.heroTitle}>演示模式</Text>
          <Text style={local.heroText}>会话来自虚构人物，输入的消息只保存在这台设备。</Text>
        </View>
      </View>
      <Text accessibilityRole="header" style={styles.section}>最近会话</Text>
      <View style={local.list}>
        {conversations.map(({ person, lastMessage }) => {
          const unread = demo.unreadIds.includes(person.id);
          return (
            <Pressable
              key={person.id}
              accessibilityRole="button"
              accessibilityLabel={`${person.name}，${unread ? '有未读消息，' : ''}${lastMessage.text}`}
              onPress={() => router.push({ pathname: '/chat/[id]', params: { id: person.id } })}
              style={({ pressed }) => [styles.row, local.thread, pressed && local.pressed]}
            >
              <Avatar name={person.name} color={person.color} size={52} />
              <View style={styles.grow}>
                <Text style={styles.strong}>{person.name}</Text>
                <Text numberOfLines={1} style={styles.muted}>{lastMessage.mine ? '我：' : ''}{lastMessage.text}</Text>
              </View>
              <View style={local.meta}>
                <Text style={styles.small}>{lastMessage.time}</Text>
                {unread && <View style={local.dot} />}
              </View>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const local = StyleSheet.create({
  hero: { ...styles.row, backgroundColor: colors.deep, borderRadius: 24, padding: 17, gap: 14 },
  heroIcon: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#42644E' },
  heroTitle: { fontSize: 16, fontWeight: '800', color: '#FFFFFF', marginBottom: 3 },
  heroText: { fontSize: 13, lineHeight: 20, color: '#E4F1D8' },
  list: { gap: 9 },
  thread: { ...styles.card, padding: 13, minHeight: 78 },
  pressed: { backgroundColor: colors.sage },
  meta: { alignItems: 'flex-end', gap: 7 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
});
