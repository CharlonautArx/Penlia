import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { errorMessage } from '../services/api';
import { useSession } from '../services/session';
import { styles } from '../theme';
import { Button, Empty, Screen } from './ui';

export function AuthScreen() {
  const { loading, restoreError, restore, authenticate } = useSession();
  const [register, setRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError('');
    try {
      await authenticate(register, { username, name, password });
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title={register ? '注册' : '登录'} subtitle={register ? '创建你的朋聊账号。' : '登录朋聊，和好友开始聊天。'}>
      {loading ? <Empty>正在恢复登录…</Empty> : restoreError ? (
        <View style={styles.card}>
          <Text accessibilityRole="alert" style={styles.body}>{restoreError}</Text>
          <Button label="重试" onPress={() => void restore()} />
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.strong}>账号</Text>
          <TextInput accessibilityLabel="账号" placeholder="3–24 位字母、数字或下划线" autoCapitalize="none"
            autoCorrect={false} autoComplete="username" value={username} onChangeText={setUsername}
            maxLength={24} style={styles.input} />
          {register && <>
            <Text style={styles.strong}>昵称</Text>
            <TextInput accessibilityLabel="昵称" value={name} onChangeText={setName} maxLength={16} style={styles.input} />
          </>}
          <Text style={styles.strong}>密码</Text>
          <TextInput accessibilityLabel="密码" placeholder={register ? '至少 10 个字符' : undefined}
            secureTextEntry autoCapitalize="none" autoCorrect={false}
            autoComplete={register ? 'new-password' : 'current-password'} value={password} onChangeText={setPassword}
            maxLength={128} style={styles.input} />
          {!!error && <Text accessibilityRole="alert" style={styles.body}>{error}</Text>}
          <Button label={busy ? '处理中…' : register ? '注册' : '登录'} onPress={() => void submit()}
            disabled={busy || !username.trim() || !password || (register && !name.trim())} />
          <Button label={register ? '已有账号，去登录' : '创建账号'} variant="soft" disabled={busy}
            onPress={() => { setRegister(!register); setError(''); }} />
        </View>
      )}
    </Screen>
  );
}
