import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AvatarEditor } from '../features/media/AvatarEditor';
import { Avatar, BrandMark, Button, DemoLabel, Icon, IconButton, ListRow, Notice, Sheet } from '../components/ui';
import { brandGradient, colors, styles } from '../theme';
import { demoPortrait } from './visuals';

const scenery = require('../../assets/demo/alley.jpg');
const hero = require('../../assets/identity/hero.jpg');
const examples = { existing: '19900000001', onboarding: '19900000002' };
const phonePattern = /^1[3-9]\d{9}$/;
const avatarOptions = [
  { name: '浅蓝', username: 'qinghe' },
  { name: '春日', username: 'xiaoman' },
  { name: '晚霞', username: 'linlu' },
] as const;

export function PhonePreview({ onLegacy, onEnter }: {
  onLegacy: () => void;
  onEnter: (profile?: { name: string; username: string; avatarKey: string; avatarPhoto?: string }) => Promise<void>;
}) {
  const [register, setRegister] = useState(false);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<{ code: string; expires: number }>();
  const [resendAt, setResendAt] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [panel, setPanel] = useState<'captcha' | 'country'>();
  const [error, setError] = useState('');
  const [onboarding, setOnboarding] = useState(false);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [avatarPhoto, setAvatarPhoto] = useState<string | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [avatar, setAvatar] = useState<string>(avatarOptions[0].username);

  useEffect(() => {
    if (!resendAt) return;
    const update = () => setRemaining(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [resendAt]);

  function updatePhone(next: string) {
    setPhone(next.replace(/\D/g, '').slice(0, 11));
    setCode(''); setMessage(undefined); setError(''); setAttempts(0);
  }

  function sendSimulation() {
    setPanel(undefined);
    if (!phonePattern.test(phone) || resendAt > Date.now()) return;
    setMessage({ code: String(Math.floor(Math.random() * 900000) + 100000), expires: Date.now() + 300000 });
    setResendAt(Date.now() + 90000);
    setRemaining(90);
    setCode(''); setError(''); setAttempts(0);
  }

  function verify() {
    if (!message || message.expires <= Date.now() || attempts >= 5) {
      setError('验证码已失效，请重新获取。');
    } else if (code !== message.code) {
      setAttempts(attempts + 1);
      setError(attempts === 4 ? '错误次数已达上限，请重新获取。' : '验证码不正确，请重试。');
    } else {
      setMessage(undefined);
      setError('');
      if (phone === examples.existing) void onEnter();
      else setOnboarding(true);
    }
  }

  async function complete() {
    const clean = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(clean) || !name.trim()) return;
    if (['qinghe', 'xiaoman', 'azhu', 'linlu', 'shenyan', 'chenmo', 'taoxi', 'beiyang', 'yucheng', 'xiaohe', 'taozi', 'zhouzhou'].includes(clean)) {
      setError('这个朋聊号已被使用。');
      return;
    }
    if (profileBusy) return;
    setProfileBusy(true);
    try { await onEnter({ name: name.trim(), username: clean, avatarKey: avatar, avatarPhoto: avatarPhoto ?? undefined }); }
    catch { setError('暂时无法保存演示资料，请重试。'); }
    finally { setProfileBusy(false); }
  }

  return <SafeAreaView style={local.screen}>
    <KeyboardAvoidingView style={styles.grow} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={local.wrap}>
        <View style={local.brand}>
          <BrandMark size={34} /><Text style={local.word}>朋聊 Penlia</Text><View style={styles.grow} /><DemoLabel />
        </View>
        {onboarding ? <>
          <View style={local.intro}>
            <Text style={local.caption}>验证完成</Text>
            <Text accessibilityRole="header" style={local.title}>创建专属朋聊号</Text>
            <Text style={styles.muted}>好友通过朋聊号找到你。手机号仅用于认证。</Text>
          </View>
          <View style={local.avatars}>
            {avatarOptions.map(({ name: option, username: key }) => <Pressable key={key} accessibilityRole="button"
              accessibilityLabel={'选择' + option + '头像'} accessibilityState={{ selected: key === avatar }}
              style={[local.avatar, key === avatar && local.avatarActive]} onPress={() => { setAvatar(key); setAvatarPhoto(null); }}>
              <Avatar name={option} source={demoPortrait(key)} size={49} />
            </Pressable>)}
          </View>
          <AvatarEditor account="demo-registration" name={name || '朋友'} fallback={demoPortrait(avatar)}
            value={avatarPhoto} onChange={setAvatarPhoto} />
          <Text style={styles.strong}>昵称</Text>
          <TextInput accessibilityLabel="设置昵称" placeholder="朋友会怎么称呼你？" placeholderTextColor={colors.quiet}
            maxLength={16} value={name} onChangeText={setName} style={styles.input} />
          <Text style={styles.strong}>专属朋聊号</Text>
          <TextInput accessibilityLabel="专属朋聊号" placeholder="3–24 位字母、数字或下划线" placeholderTextColor={colors.quiet}
            maxLength={24} value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} style={styles.input} />
          {!!error && <Notice>{error}</Notice>}
          <Button label="完成并进入朋聊" variant="gradient" disabled={profileBusy || !name.trim() || !/^[a-z0-9_]{3,24}$/i.test(username.trim())} onPress={() => void complete()} />
          <Text style={styles.small}>昵称、头像和朋聊号为本次演示资料。</Text>
        </> : <>
          <View style={local.hero}>
            <Image source={hero} style={local.heroImage} />
            <LinearGradient colors={['#251F3000', '#251F308C']} style={local.heroShade} />
            <Text style={local.heroText}>朋友之间，轻松聊。</Text>
          </View>
          <View style={local.intro}>
            <View style={styles.row}>
              <Text accessibilityRole="header" style={[local.title, styles.grow]}>{register ? '手机号注册' : '手机号登录'}</Text>
              <Button label={register ? '去登录' : '手机号注册'} variant="quiet"
                onPress={() => { setRegister(!register); setError(''); }} />
            </View>
            <Text style={styles.muted}>{register ? '验证手机号后，再设置你的公开资料。' : '使用短信验证码继续，手机号不会公开。'}</Text>
          </View>
          <Text style={styles.strong}>手机号</Text>
          <View style={local.phoneField}>
            <Pressable accessibilityRole="button" accessibilityLabel="选择国家或地区区号" style={local.country} onPress={() => setPanel('country')}>
              <Text style={styles.strong}>+86</Text><Icon name="chevron-down" size={13} />
            </Pressable>
            <TextInput accessibilityLabel="手机号" keyboardType="phone-pad" autoComplete="tel-national"
              maxLength={11} value={phone} onChangeText={updatePhone} style={local.phoneInput}
              placeholder="输入中国大陆手机号" placeholderTextColor={colors.quiet} />
          </View>
          <Text style={styles.strong}>短信验证码</Text>
          <View style={local.phoneField}>
            <TextInput accessibilityLabel="短信验证码" keyboardType="number-pad" autoComplete="one-time-code" maxLength={6}
              value={code} onChangeText={(value) => setCode(value.replace(/\D/g, ''))} style={[local.phoneInput, local.codeInput]}
              placeholder="输入 6 位验证码" placeholderTextColor={colors.quiet} />
            <Button label={remaining ? remaining + ' 秒后重发' : '获取验证码'} variant="soft" disabled={remaining > 0 || !phonePattern.test(phone)}
              onPress={() => { setError(''); setPanel('captcha'); }} />
          </View>
          {message && <Notice>{'模拟收件箱 · ' + message.code + '（仅本机）'}</Notice>}
          {!!error && <Notice>{error}</Notice>}
          <Button label={register ? '验证并继续' : '登录或继续注册'} variant="gradient" disabled={code.length !== 6} onPress={verify} />
          <View style={local.demoActions}>
            <Text style={styles.small}>离线演示。滑块与短信在本机模拟。</Text>
            <View style={local.exampleRow}>
              <Button label="填入演示号码" variant="soft" onPress={() => updatePhone(register ? examples.onboarding : examples.existing)} />
              <Button label="直接进入演示" variant="quiet" onPress={() => onEnter()} />
            </View>
            <Button label="朋聊号密码登录" variant="quiet" onPress={onLegacy} />
          </View>
        </>}
      </ScrollView>
    </KeyboardAvoidingView>
    {panel === 'captcha' && <SliderPreview onClose={() => setPanel(undefined)} onSuccess={sendSimulation} />}
    {panel === 'country' && <Sheet title="国家或地区" onClose={() => setPanel(undefined)}>
      <ListRow title="中国大陆 +86" left={<Icon name="globe-outline" />} onPress={() => setPanel(undefined)} />
      <Text style={styles.small}>当前阶段支持中国大陆手机号。</Text>
    </Sheet>}
  </SafeAreaView>;
}

function SliderPreview({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [target, setTarget] = useState(0.66);
  const [width, setWidth] = useState(0);
  const [position, setPosition] = useState(0);
  const [failed, setFailed] = useState(false);
  const [accessibleMode, setAccessibleMode] = useState(false);
  const travel = Math.max(width - 48, 0);
  const moved = useRef(0);
  const starting = useRef(0);

  function move(x: number) {
    const next = Math.min(travel, Math.max(0, x));
    moved.current = next;
    setPosition(next);
  }

  function finish() {
    if (travel > 0 && Math.abs(moved.current - travel * target) <= 14) {
      onSuccess();
    } else {
      move(0);
      setFailed(true);
    }
  }

  const drag = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { starting.current = moved.current; setFailed(false); },
    onPanResponderMove: (_, action) => move(starting.current + action.dx),
    onPanResponderRelease: finish,
    onPanResponderTerminate: () => move(0),
  }), [target, travel]);

  return <Sheet title="完成安全验证" onClose={onClose}>
    <View style={local.puzzleHeader}>
      <Text style={[styles.body, styles.grow]}>向右拖动滑块，让拼块与缺口对齐。</Text>
      <IconButton label="刷新挑战" icon="refresh-outline" onPress={() => {
        setTarget((current) => current > 0.65 ? 0.53 : 0.73);
        setFailed(false); move(0);
      }} />
    </View>
    <View style={local.puzzle} onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}>
      <Image source={scenery} style={local.scene} />
      <View accessibilityLabel="拼图缺口" style={[local.slot, { left: travel * target + 4 }]} />
      <View style={[local.piece, { left: position + 4 }]}>
        <Image source={scenery} style={[local.pieceImage, { width, left: -travel * target - 4 }]} />
      </View>
    </View>
    <View style={local.slider}>
      <View style={[local.sliderTrail, { width: position + 22 }]} />
      <Text style={local.sliderText}>拖动完成拼图</Text>
      <View {...drag.panHandlers} accessible accessibilityRole="adjustable" accessibilityLabel="拖动拼图滑块"
        accessibilityValue={{ min: 0, max: 100, now: travel > 0 ? Math.round(position / travel * 100) : 0 }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }, { name: 'activate' }]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === 'activate') finish();
          else move(position + (nativeEvent.actionName === 'increment' ? 8 : -8));
        }} style={[local.thumb, { left: position }]}>
        <LinearGradient colors={brandGradient} style={local.thumbGradient}><Icon name="arrow-forward" size={20} /></LinearGradient>
      </View>
    </View>
    {failed && <Notice>拼块未对齐，请重试或刷新挑战。</Notice>}
    <View style={local.puzzleFooter}>
      <Text style={styles.small}>安全验证样式 · 本机模拟</Text>
      <Button label="无障碍操作" variant="quiet" onPress={() => setAccessibleMode(!accessibleMode)} />
    </View>
    {accessibleMode && <View style={local.exampleRow}>
      <Button label="向左移" variant="soft" onPress={() => move(position - 8)} />
      <Button label="向右移" variant="soft" onPress={() => move(position + 8)} />
      <Button label="核对位置" variant="soft" onPress={finish} />
    </View>}
  </Sheet>;
}

const local = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.panel },
  wrap: { width: '100%', maxWidth: 460, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 18, paddingBottom: 18, gap: 11 },
  brand: { ...styles.row, gap: 9, marginBottom: 4 },
  word: { fontSize: 19, fontWeight: '800', color: colors.ink, letterSpacing: -0.4 },
  hero: { backgroundColor: colors.pink, height: 190, borderRadius: 15, overflow: 'hidden', justifyContent: 'flex-end' },
  heroImage: { position: 'absolute', width: '100%', height: '100%', resizeMode: 'cover' },
  heroShade: { position: 'absolute', right: 0, left: 0, bottom: 0, height: 79 },
  heroText: { fontSize: 21, fontWeight: '800', color: '#FFFFFF', margin: 13 },
  intro: { gap: 3, marginVertical: 4 },
  caption: { ...styles.strong, color: colors.accent },
  title: { fontSize: 25, lineHeight: 34, fontWeight: '800', color: colors.text },
  phoneField: { ...styles.row, gap: 4, minHeight: 48, paddingRight: 3, borderColor: colors.border, borderWidth: 1,
    backgroundColor: colors.backdrop, borderRadius: 13 },
  country: { ...styles.row, minHeight: 44, gap: 5, paddingHorizontal: 10, borderRightWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  phoneInput: { ...styles.grow, minHeight: 44, fontSize: 15, color: colors.text, paddingHorizontal: 7 },
  codeInput: { paddingHorizontal: 12 },
  demoActions: { gap: 4, padding: 9, borderRadius: 13, backgroundColor: colors.backdrop },
  exampleRow: { ...styles.row, gap: 6, flexWrap: 'wrap' },
  avatars: { ...styles.row, gap: 10, marginVertical: 4 },
  avatar: { padding: 3, borderWidth: 2, borderColor: colors.border, borderRadius: 20 },
  avatarActive: { borderColor: colors.accent },
  puzzleHeader: { ...styles.row, gap: 8 },
  puzzle: { height: 147, backgroundColor: colors.ink, borderRadius: 11, overflow: 'hidden' },
  scene: { width: '100%', height: '100%', resizeMode: 'cover' },
  slot: { position: 'absolute', top: 52, width: 40, height: 40, borderWidth: 2, backgroundColor: '#20182AB3', borderColor: '#FFFFFFD8', borderRadius: 7 },
  piece: { position: 'absolute', top: 52, width: 40, height: 40, borderWidth: 2, borderColor: '#FFFFFF', borderRadius: 7, overflow: 'hidden' },
  pieceImage: { position: 'absolute', top: -52, height: 147, resizeMode: 'cover' },
  slider: { minHeight: 48, borderRadius: 11, overflow: 'hidden', justifyContent: 'center', backgroundColor: colors.backdrop },
  sliderText: { ...styles.muted, textAlign: 'center', paddingLeft: 45 },
  sliderTrail: { position: 'absolute', height: '100%', backgroundColor: colors.pink },
  thumb: { position: 'absolute', width: 48, height: 48, borderRadius: 11, overflow: 'hidden' },
  thumbGradient: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  puzzleFooter: { ...styles.row, justifyContent: 'space-between' },
});
