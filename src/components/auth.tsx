import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AvatarEditor } from '../features/media/AvatarEditor';
import { PhonePreview } from '../demo/phone';
import { errorMessage } from '../services/api';
import { useSession } from '../services/session';
import { colors, radius, space, styles, touch, type } from '../theme';
import { WelcomeIdentity } from './welcome';
import { Button, Empty, Icon, IconButton, Notice, Sheet } from './ui';

export function AuthScreen() {
  const { enterDemo, completeDemoProfile } = useSession();
  const [legacy, setLegacy] = useState(false);
  if (enterDemo && !legacy) return <PhonePreview onLegacy={() => setLegacy(true)}
    onEnter={async (profile) => { if (profile) await completeDemoProfile?.(profile); else enterDemo(); }} />;
  return <LegacyAuth onDemoPhone={enterDemo ? () => setLegacy(false) : undefined} />;
}

function LegacyAuth({ onDemoPhone }: { onDemoPhone?: () => void }) {
  const { loading, restoreError, restore, authenticate, enterDemo } = useSession();
  const [register, setRegister] = useState(false);
  const [avatarPhoto, setAvatarPhoto] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [policy, setPolicy] = useState<'用户协议' | '隐私政策'>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (enterDemo || busy) return;
    if (!/^[a-z0-9_]{3,24}$/i.test(username.trim())) {
      setError('朋聊号须为 3–24 位字母、数字或下划线。');
      return;
    }
    if (register && (!name.trim() || password.length < 10)) {
      setError('请输入昵称，并设置至少 10 个字符的密码。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await authenticate(register, { username: username.trim(), name: name.trim(), password }, avatarPhoto ?? undefined);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return <SafeAreaView style={local.page}>
    <KeyboardAvoidingView style={styles.grow} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={local.column}>
        <WelcomeIdentity compact={register} />
        <View style={local.heading}>
          <Text accessibilityRole="header" style={local.title}>{register ? '创建朋聊账号' : '登录朋聊'}</Text>
          <Pressable accessibilityRole="button" onPress={() => { setRegister(!register); setError(''); setShowPassword(false); }}
            disabled={busy} style={local.link}><Text style={local.linkText}>{register ? '去登录' : '注册账号'}</Text></Pressable>
        </View>
        {loading ? <Empty busy>正在恢复登录…</Empty> : restoreError ? (
          <Notice action="重试" onAction={() => void restore()}>{restoreError}</Notice>
        ) : <>
          <View style={local.fields}>
            <Text style={styles.strong}>朋聊号</Text>
            <View style={local.field}>
              <Icon name="person-outline" size={18} color={colors.quiet} />
              <TextInput accessibilityLabel="朋聊号" placeholder="字母、数字或下划线" placeholderTextColor={colors.quiet}
                autoCapitalize="none" autoCorrect={false} autoComplete="username" value={username} onChangeText={setUsername}
                maxLength={24} editable={!enterDemo && !busy} style={local.input} />
            </View>
            {register && <>
              <Text style={styles.strong}>昵称</Text>
              <View style={local.field}>
                <Icon name="id-card-outline" size={18} color={colors.quiet} />
                <TextInput accessibilityLabel="昵称" placeholder="朋友会怎么称呼你？" placeholderTextColor={colors.quiet}
                  value={name} onChangeText={setName} maxLength={16} editable={!enterDemo && !busy} style={local.input} />
              </View>
            </>}
            {register && !enterDemo && <AvatarEditor account="registration" name={name || '朋友'} value={avatarPhoto} onChange={setAvatarPhoto} />}
            <Text style={styles.strong}>密码</Text>
            <View style={local.field}>
              <Icon name="lock-closed-outline" size={17} color={colors.quiet} />
              <TextInput accessibilityLabel="密码" placeholder={register ? '至少 10 个字符' : '输入你的密码'}
                placeholderTextColor={colors.quiet} secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false}
                autoComplete={register ? 'new-password' : 'current-password'} value={password} onChangeText={setPassword}
                editable={!enterDemo && !busy} maxLength={128} style={local.input} returnKeyType="go"
                onSubmitEditing={() => { if (password) void submit(); }} />
              <IconButton label={showPassword ? '隐藏密码' : '显示密码'} icon={showPassword ? 'eye-off-outline' : 'eye-outline'}
                onPress={() => setShowPassword(!showPassword)} />
            </View>
          </View>
          {!!error && <Notice>{error}</Notice>}
          <Button label={busy ? '处理中…' : register ? '注册' : '登录'} variant="gradient" onPress={() => void submit()}
            disabled={!!enterDemo || busy || !username.trim() || !password || (register && !name.trim())} />
          {enterDemo && <View style={local.preview}>
            <Button label="进入演示" icon="arrow-forward" variant="soft" onPress={enterDemo} />
            {onDemoPhone && <Button label="手机号演示" variant="quiet" onPress={onDemoPhone} />}
            <Text style={[styles.small, local.center]}>使用虚构账号和内容，无需注册或联网</Text>
          </View>}
        </>}
        <View style={local.policies}>
          <Pressable accessibilityRole="link" style={local.link} onPress={() => setPolicy('用户协议')}>
            <Text style={styles.small}>用户协议</Text>
          </Pressable>
          <Text style={styles.small}>·</Text>
          <Pressable accessibilityRole="link" style={local.link} onPress={() => setPolicy('隐私政策')}>
            <Text style={styles.small}>隐私政策</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    {policy && <Sheet title={policy} onClose={() => setPolicy(undefined)}>
      <Text style={styles.body}>正式条款将在服务开放前发布。</Text>
      <Text style={styles.muted}>{enterDemo
        ? (policy === '隐私政策' ? '本机演示使用测试资料。模拟聊天、活动收藏和动态在设备上处理。' : '本机演示用于预览界面与交互。')
        : '当前为内测界面。请使用获授权的测试资料。'}</Text>
    </Sheet>}
  </SafeAreaView>;
}

const local = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.panel },
  column: { width: '100%', maxWidth: 460, alignSelf: 'center', paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.md, gap: space.md },
  heading: { ...styles.row, justifyContent: 'space-between', flexWrap: 'wrap' },
  title: { ...type.title, flexShrink: 1, color: colors.text },
  fields: { gap: space.xs },
  field: { ...styles.row, gap: space.sm, backgroundColor: colors.search, borderRadius: radius.control, paddingLeft: space.sm, minHeight: touch },
  input: { ...styles.grow, ...type.body, paddingVertical: space.xs, paddingRight: space.xxs, color: colors.text, minHeight: touch },
  link: { minHeight: touch, justifyContent: 'center', paddingHorizontal: space.xs },
  linkText: { ...type.support, color: colors.accent, fontWeight: '600' },
  policies: { ...styles.row, gap: space.xxs, justifyContent: 'center', flexWrap: 'wrap' },
  preview: { gap: space.xs },
  center: { textAlign: 'center' },
});
