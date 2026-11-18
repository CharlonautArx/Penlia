import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, Button, Empty } from '../../components/ui';
import { formatTime, type Message, newId, peopleById } from '../../demo-data';
import { useDemo } from '../../demo-store';
import { colors, styles } from '../../theme';

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { demo, setDemo } = useDemo();
  const [draft, setDraft] = useState('');
  const list = useRef<ComponentRef<typeof ScrollView>>(null);
  const isFriend = demo.friendIds.includes(id);
  const person = isFriend ? peopleById.get(id) : undefined;
  const messages = demo.messages[id] ?? [];

  useEffect(() => {
    setDemo((current) => current.unreadIds.includes(id)
      ? { ...current, unreadIds: current.unreadIds.filter((item) => item !== id) }
      : current);
  }, [id, setDemo]);

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  function send() {
    const text = draft.trim();
    if (!text || !person) return;
    const date = new Date();
    const message: Message = {
      id: newId(), mine: true, text, time: formatTime(date), timestamp: date.getTime(),
    };
    setDemo((current) => ({
      ...current,
      messages: { ...current.messages, [id]: [...(current.messages[id] ?? []), message] },
    }));
    setDraft('');
  }

  return (
    <SafeAreaView style={local.safe}>
      <KeyboardAvoidingView style={local.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.row, local.header]}>
          <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={goBack} style={local.back}>
            <Ionicons name="chevron-back" size={24} color={colors.deep} />
          </Pressable>
          {person && <Avatar name={person.name} color={person.color} size={38} />}
          <View style={styles.grow}>
            <Text style={styles.strong}>{person?.name ?? '会话不可用'}</Text>
            <Text style={styles.small}>本地演示会话</Text>
          </View>
        </View>
        <ScrollView
          ref={list}
          style={local.scroll}
          contentContainerStyle={local.messages}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
          onLayout={() => list.current?.scrollToEnd({ animated: false })}
        >
          {!person && <Empty>找不到这位演示好友。</Empty>}
          {person && messages.length === 0 && <Empty>这段会话还没有消息，可以先打个招呼。</Empty>}
          {person && messages.map((message) => (
            <View key={message.id} style={[local.bubble, message.mine ? local.mine : local.theirs]}>
              <Text style={styles.body}>{message.text}</Text>
              <Text style={styles.small}>{message.time}</Text>
            </View>
          ))}
        </ScrollView>
        {person && (
          <View style={[styles.row, local.composer]}>
            <TextInput
              accessibilityLabel="消息"
              placeholder="输入演示消息"
              placeholderTextColor={colors.muted}
              multiline
              maxLength={500}
              value={draft}
              onChangeText={setDraft}
              style={[styles.input, styles.grow, local.input]}
            />
            <Button label="发送" onPress={send} disabled={!draft.trim()} />
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const local = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.backdrop },
  page: { flex: 1, width: '100%', maxWidth: 660, alignSelf: 'center' },
  header: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.border },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  messages: { padding: 18, gap: 10 },
  bubble: { borderRadius: 19, paddingHorizontal: 14, paddingVertical: 10, gap: 3, maxWidth: '85%' },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.sage, borderBottomRightRadius: 4 },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.panel, borderBottomLeftRadius: 4 },
  composer: { paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderColor: colors.border },
  input: { maxHeight: 110 },
});
