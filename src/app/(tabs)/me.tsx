import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar, Button, Screen } from '../../components/ui';
import { errorMessage } from '../../services/api';
import { useSession } from '../../services/session';
import { colors, styles } from '../../theme';

export default function MeScreen() {
  const { session, updateProfile, logout } = useSession();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!session) return null;
  const { user } = session;

  function edit() {
    setName(user.name);
    setBio(user.bio);
    setError('');
    setEditing(true);
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
      setEditing(false);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="我的" subtitle="管理朋聊账号和资料。">
      <View style={local.profile}>
        <View style={styles.row}>
          <Avatar name={user.name} color="#F3F7EB" size={64} />
          <View style={styles.grow}>
            <Text style={local.name}>{user.name}</Text>
            <Text style={styles.muted}>@{user.username}</Text>
            <Text style={styles.muted}>{user.bio || '还没有签名'}</Text>
          </View>
        </View>
        {!editing && <Button label="编辑资料" variant="soft" icon="create-outline" onPress={edit} disabled={busy} />}
      </View>
      {editing && (
        <View style={styles.card}>
          <Text style={styles.strong}>昵称</Text>
          <TextInput accessibilityLabel="昵称" value={name} onChangeText={setName} maxLength={16} style={styles.input} />
          <Text style={styles.strong}>签名</Text>
          <TextInput accessibilityLabel="签名" value={bio} onChangeText={setBio} maxLength={60} style={styles.input} />
          <View style={styles.row}>
            <Button label="取消" variant="soft" disabled={busy} onPress={() => setEditing(false)} />
            <Button label="保存" onPress={() => void run(() => updateProfile(name, bio))} disabled={busy || !name.trim()} />
          </View>
        </View>
      )}
      {!!error && <Text accessibilityRole="alert" style={styles.body}>{error}</Text>}
      <Button label="退出登录" variant="danger" disabled={busy} onPress={() => void run(logout)} />
    </Screen>
  );
}

const local = StyleSheet.create({
  profile: { ...styles.card, backgroundColor: colors.sage, padding: 19 },
  name: { fontSize: 24, fontWeight: '800', color: colors.deep },
});
