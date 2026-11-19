import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PhonePreview } from '../demo/phone';
import { errorMessage } from '../services/api';
import { useSession } from '../services/session';
import { colors, styles } from '../theme';
import { BrandMark, Button, DemoLabel, Empty, Icon, IconButton, Notice, Sheet } from './ui';

const hero = require('../../assets/identity/hero.jpg');

export function AuthScreen() {
  const { enterDemo, completeDemoProfile } = useSession();
  const [legacy, setLegacy] = useState(false);
  if (enterDemo && !legacy) return <PhonePreview onLegacy={() => setLegacy(true)}
    onEnter={(profile) => profile ? completeDemoProfile?.(profile) : enterDemo()} />;
  return <LegacyAuth onDemoPhone={enterDemo ? () => setLegacy(false) : undefined} />;
}

function LegacyAuth({ onDemoPhone }: { onDemoPhone?: () => void }) {
  const { loading, restoreError, restore, authenticate, enterDemo } = useSession();
  const [register, setRegister] = useState(false);
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
      await authenticate(register, { username: username.trim(), name: name.trim(), password });
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return <SafeAreaView style={local.page}>
    <KeyboardAvoidingView style={styles.grow} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={local.column}>
        <View style={local.wordmark}>
          <BrandMark size={34} />
          <Text style={local.brand}>朋聊 <Text style={local.latin}>Penlia</Text></Text>
          <View style={styles.grow} />
          <DemoLabel />
        </View>
        <View style={local.hero}>
          <Image source={hero} style={local.heroImage} />
          <LinearGradient colors={['#30192C00', '#30192CB5']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
            style={local.heroShade} />
          <View style={local.heroWords}>
            <Text style={local.heroTitle}>朋友之间，轻松聊。</Text>
          </View>
        </View>
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
      <Text style={styles.muted}>{policy === '隐私政策' ? '本演示使用虚构资料。模拟聊天、活动收藏和动态在设备上处理。' : '本演示用于体验界面和本机交互，账号注册与真实通信在正式服务中提供。'}</Text>
    </Sheet>}
  </SafeAreaView>;
}

const local = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.panel },
  column: { width: '100%', maxWidth: 460, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 18, paddingBottom: 16, gap: 16 },
  wordmark: { ...styles.row, gap: 9 },
  brand: { color: colors.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.7 },
  latin: { color: colors.ink, fontSize: 17, fontWeight: '600' },
  hero: { height: 233, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.pink, justifyContent: 'flex-end' },
  heroImage: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', resizeMode: 'cover' },
  heroShade: { position: 'absolute', right: 0, bottom: 0, left: 0, height: 106 },
  heroWords: { paddingHorizontal: 16, paddingBottom: 16 },
  heroTitle: { fontSize: 23, lineHeight: 32, color: '#FFFFFF', fontWeight: '800', letterSpacing: -0.6 },
  heading: { ...styles.row, justifyContent: 'space-between' },
  title: { fontSize: 26, letterSpacing: -0.7, lineHeight: 35, color: colors.text, fontWeight: '800' },
  fields: { gap: 7 },
  field: { ...styles.row, gap: 10, backgroundColor: colors.backdrop, borderColor: colors.border, borderWidth: 1,
    borderRadius: 12, paddingLeft: 12, minHeight: 48 },
  input: { flex: 1, paddingVertical: 10, paddingRight: 4, color: colors.text, fontSize: 15, minHeight: 46, minWidth: 0 },
  link: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  linkText: { fontSize: 14, color: colors.accent, fontWeight: '700' },
  policies: { ...styles.row, gap: 7, justifyContent: 'center' },
  preview: { gap: 6 },
  center: { textAlign: 'center' },
});
