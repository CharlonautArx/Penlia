import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar, Button, Screen } from '../../components/ui';
import { initialDemo } from '../../demo-data';
import { useDemo } from '../../demo-store';
import { colors, styles } from '../../theme';

export default function MeScreen() {
  const { demo, setDemo, storageFailed } = useDemo();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');

  function edit() {
    setName(demo.profile.name);
    setBio(demo.profile.bio);
    setEditing(true);
  }

  function save() {
    if (!name.trim()) return;
    setDemo((current) => ({ ...current, profile: { name: name.trim(), bio: bio.trim() } }));
    setEditing(false);
  }

  function confirmReset() {
    Alert.alert('恢复初始演示数据？', '本机保存的消息、动态、好友变更和资料将被清除。', [
      { text: '取消', style: 'cancel' },
      { text: '恢复', style: 'destructive', onPress: () => {
        setDemo(initialDemo);
        setEditing(false);
      } },
    ]);
  }

  return (
    <Screen title="我的" subtitle="管理这台设备上的演示资料。">
      <View style={local.profile}>
        <View style={styles.row}>
          <Avatar name={demo.profile.name} color="#F3F7EB" size={64} />
          <View style={styles.grow}>
            <Text style={local.name}>{demo.profile.name}</Text>
            <Text style={styles.muted}>{demo.profile.bio || '还没有签名'}</Text>
          </View>
        </View>
        {!editing && <Button label="编辑资料" variant="soft" icon="create-outline" onPress={edit} />}
      </View>
      {editing && (
        <View style={styles.card}>
          <Text style={styles.section}>编辑资料</Text>
          <Text style={styles.strong}>昵称</Text>
          <TextInput accessibilityLabel="昵称" value={name} onChangeText={setName} maxLength={16} style={styles.input} />
          <Text style={styles.strong}>签名</Text>
          <TextInput accessibilityLabel="签名" value={bio} onChangeText={setBio} maxLength={60} style={styles.input} />
          <View style={local.actions}>
            <Button label="取消" variant="soft" onPress={() => setEditing(false)} />
            <Button label="保存" onPress={save} disabled={!name.trim()} />
          </View>
        </View>
      )}
      <View style={styles.card}>
        <View style={styles.row}>
          <Ionicons name="phone-portrait-outline" size={22} color={colors.green} />
          <Text accessibilityRole="header" style={styles.section}>本机数据</Text>
        </View>
        <Text style={styles.muted}>演示联系人均为虚构人物。消息、动态和资料仅保存在本机。</Text>
        {storageFailed && <Text accessibilityRole="alert" style={local.error}>暂时无法保存数据。退出前请确认你不需要保留当前操作。</Text>}
        <View style={local.actions}>
          <Button label="恢复初始数据" icon="refresh" variant="danger" onPress={confirmReset} />
        </View>
      </View>
    </Screen>
  );
}

const local = StyleSheet.create({
  profile: { ...styles.card, backgroundColor: colors.sage, padding: 19 },
  name: { fontSize: 24, fontWeight: '800', color: colors.deep },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  error: { color: colors.danger, fontSize: 14 },
});
