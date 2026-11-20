import { isUiDemo } from '../../demo/mode';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, useColorScheme, View } from 'react-native';

import { Avatar, Button, Icon, IconButton, ListRow, Notice, Screen, Sheet, type IconName } from '../../components/ui';
import { AvatarEditor } from '../../features/media/AvatarEditor';
import { demoPortrait } from '../../demo/visuals';
import { errorMessage } from '../../services/api';
import { useSession } from '../../services/session';
import { colors, styles } from '../../theme';

export default function MeScreen() {
  const { session, updateProfile, logout, enterDemo, demoAvatarKey, localAvatar, avatarNotice, changeLocalAvatar } = useSession();
  const dark=useColorScheme()==='dark'&&Platform.OS!=='web';
  const [sheet, setSheet] = useState<'资料' | '主题与外观' | '通用设置'>();
  const [avatarDraft, setAvatarDraft] = useState<string | null>();
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!session) return null;
  const { user } = session;

  function edit() {
    setName(user.name);
    setAvatarDraft(localAvatar ?? null);
    setBio(user.bio);
    setError('');
    setSheet('资料');
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
      setSheet(undefined);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return <Screen title="我的" actions={<IconButton label="通用设置" icon="settings-outline" onPress={() => setSheet('通用设置')} />}>
    <LinearGradient colors={dark?['#422B3A','#332D42','#22393B']:['#FDE7ED','#F5F1F8','#E1F8F5']} start={{ x: 0.02, y: 0.08 }} end={{ x: 1, y: 0.85 }} style={local.profile}>
      <View style={styles.row}>
        <Avatar userId={user.id} name={user.name} source={demoPortrait(demoAvatarKey ?? user.username)} size={64} />
        <View style={styles.grow}>
          <Text style={local.name}>{user.name}</Text>
          <Text style={styles.muted}>朋聊号 @{user.username}</Text>
        </View>
        <IconButton label="编辑资料" icon="create-outline" onPress={edit} disabled={busy} />
      </View>
      <Text style={styles.body}>{user.bio || '还没有个性签名'}</Text>
    </LinearGradient>
    <View style={local.group}>
      <ListRow title="隐私与安全" detail="好友权限、安静时间、登录设备" left={<Tile icon="shield-checkmark-outline" />}
        onPress={() => router.push('/privacy')} />
    </View>
    <View style={local.group}>
      {!isUiDemo && <ListRow title="生活边界保护" detail="举报记录、处置与申诉"
        left={<Tile icon="flag-outline" />} onPress={() => router.push('/boundary')} />}
      <ListRow title="我的空间" detail="动态、日志和相册" left={<Tile icon="person-circle-outline" />}
        onPress={() => router.push({ pathname: '/space/[id]', params: { id: user.id } })} />
      <ListRow title="我的动态" detail="查看你发布的动态" left={<Tile icon="albums-outline" />}
        onPress={() => router.navigate({ pathname: '/moments', params: { mine: '1' } })} />
      <ListRow title="想去的地方" detail="查看在玩乐里保存的去处" left={<Tile icon="bookmark-outline" />}
        onPress={() => router.push('/playground/saved')} />
    </View>
    <View style={local.group}>
      <ListRow title="本机空间隐私" left={<Tile icon="eye-outline" />} onPress={() => router.push('/space/privacy')} />
      <ListRow title="主题与外观" left={<Tile icon="color-palette-outline" />} onPress={() => setSheet('主题与外观')} />
      <ListRow title="通用设置" left={<Tile icon="settings-outline" />} onPress={() => setSheet('通用设置')} />
    </View>
    {!!avatarNotice && !sheet && <Notice>{avatarNotice}</Notice>}
    {!!error && !sheet && <Notice>{error}</Notice>}
    <Button label={enterDemo ? '退出演示' : '退出登录'} variant="danger" disabled={busy} onPress={() => void run(logout)} />
    {sheet && <Sheet title={sheet === '资料' ? '编辑资料' : sheet} onClose={() => { if (!busy) setSheet(undefined); }}>
      {sheet === '资料' && <>
        <AvatarEditor account={user.id} name={name || user.name} fallback={demoPortrait(demoAvatarKey ?? user.username)}
          value={avatarDraft} onChange={setAvatarDraft} />
        <Text style={styles.strong}>昵称</Text>
        <TextInput accessibilityLabel="昵称" value={name} onChangeText={setName} maxLength={16} style={styles.input} />
        <Text style={styles.strong}>个性签名</Text>
        <TextInput accessibilityLabel="签名" value={bio} onChangeText={setBio} maxLength={60} style={styles.input} />
        {!!error && <Notice>{error}</Notice>}
        <Button label={busy ? '保存中…' : '保存'} variant="gradient" disabled={busy || !name.trim()}
          onPress={() => void run(async () => {
            await updateProfile(name.trim(), bio.trim());
            if ((avatarDraft ?? undefined) !== localAvatar) await changeLocalAvatar(avatarDraft ?? null);
          })} />
      </>}
      {sheet === '主题与外观' && <ListRow title="跟随系统主题" detail={dark?'当前为深色模式':'当前为浅色模式'} left={<Tile icon="sunny-outline" />} />}
      {sheet === '通用设置' && <ListRow title="朋聊" detail={enterDemo ? '0.1.0 · 离线演示' : '0.1.0'} left={<Tile icon="chatbubbles-outline" />} />}
    </Sheet>}
  </Screen>;
}

function Tile({ icon }: { icon: IconName }) {
  return <View style={local.tile}><Icon name={icon} size={19} /></View>;
}

const local = StyleSheet.create({
  profile: { padding: 16, borderRadius: 15, gap: 14 },
  name: { fontSize: 25, fontWeight: '800', color: colors.text, lineHeight: 32 },
  group: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 14, overflow: 'hidden' },
  tile: { width: 35, height: 35, borderRadius: 10, backgroundColor: colors.backdrop, alignItems: 'center', justifyContent: 'center' },
});
