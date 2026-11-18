import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar, Button, Empty, Screen } from '../../components/ui';
import { peopleById } from '../../demo-data';
import { useDemo } from '../../demo-store';
import { colors, styles } from '../../theme';

export default function FriendsScreen() {
  const { demo, setDemo } = useDemo();
  const [query, setQuery] = useState('');
  const term = query.trim().toLowerCase();
  const matching = demo.friendIds
    .map((id) => peopleById.get(id)!)
    .filter((person) => `${person.name} ${person.bio}`.toLowerCase().includes(term));

  function accept(id: string) {
    setDemo((current) => {
      if (!current.requestIds.includes(id)) return current;
      return {
        ...current,
        friendIds: [...current.friendIds, id],
        requestIds: current.requestIds.filter((item) => item !== id),
      };
    });
  }

  return (
    <Screen title="好友" subtitle="从演示联系人中找一位好友聊聊。">
      <View style={local.search}>
        <Ionicons name="search" size={20} color={colors.green} />
        <TextInput
          accessibilityLabel="搜索好友"
          placeholder="搜索好友昵称或签名"
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          style={local.searchInput}
        />
      </View>
      {!term && demo.requestIds.length > 0 && (
        <View style={local.list}>
          <Text accessibilityRole="header" style={styles.section}>好友请求 · {demo.requestIds.length}</Text>
          {demo.requestIds.map((id) => {
            const person = peopleById.get(id)!;
            return (
              <View style={local.person} key={id}>
                <Avatar name={person.name} color={person.color} />
                <View style={styles.grow}>
                  <Text style={styles.strong}>{person.name}</Text>
                  <Text style={styles.muted}>希望加你为演示好友</Text>
                </View>
                <Button label="接受" variant="soft" onPress={() => accept(id)} />
              </View>
            );
          })}
        </View>
      )}
      <View style={local.list}>
        <Text accessibilityRole="header" style={styles.section}>我的好友 · {matching.length}</Text>
        {matching.length === 0 && <Empty>没找到符合条件的好友。</Empty>}
        {matching.map((person) => (
          <View style={local.person} key={person.id}>
            <Avatar name={person.name} color={person.color} />
            <View style={styles.grow}>
              <Text style={styles.strong}>{person.name}</Text>
              <Text style={styles.muted}>{person.bio}</Text>
            </View>
            <Button
              label="聊天"
              variant="soft"
              onPress={() => router.push({ pathname: '/chat/[id]', params: { id: person.id } })}
            />
          </View>
        ))}
      </View>
    </Screen>
  );
}

const local = StyleSheet.create({
  search: { ...styles.input, ...styles.row },
  searchInput: { ...styles.grow, fontSize: 16, color: colors.text, padding: 0 },
  list: { gap: 9 },
  person: { ...styles.card, ...styles.row, padding: 12, minHeight: 72 },
});
