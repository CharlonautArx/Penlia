import { isUiDemo } from '../../demo/mode';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar, Button, Icon, IconButton, ListRow, Notice, Screen, SettingGroup, Sheet, type IconName } from '../../components/ui';
import { AvatarEditor } from '../../features/media/AvatarEditor';
import { demoPortrait } from '../../demo/visuals';
import { errorMessage } from '../../services/api';
import { useSession } from '../../services/session';
import { brandGradient, colors, radius, space, styles, type } from '../../theme';
import { useAppearance } from '../../components/appearance';

export default function MeScreen() {
  const { session, updateProfile, logout, enterDemo, demoAvatarKey, localAvatar, avatarNotice, changeLocalAvatar } = useSession();
  const { preference, scheme, setPreference } = useAppearance();
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
    <View style={local.profile}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={local.signature} />
      <View style={styles.row}>
        <Avatar userId={user.id} name={user.name} source={demoPortrait(demoAvatarKey ?? user.username)} size={68} />
        <View style={styles.grow}>
          <Text style={local.name}>{user.name}</Text>
          <Text style={styles.muted}>朋聊号 @{user.username}</Text>
        </View>
        <IconButton label="编辑资料" icon="create-outline" onPress={edit} disabled={busy} />
      </View>
      {!!user.bio && <Text style={styles.body}>{user.bio}</Text>}
    </View>
    <SettingGroup>
      <ListRow title="隐私与安全" detail="好友权限、安静时间、登录设备" left={<Tile icon="shield-checkmark-outline" />}
        onPress={() => router.push('/privacy')} />
    </SettingGroup>
    <SettingGroup title="我的生活">
      <ListRow title="生活边界保护" detail="举报记录、处置与申诉"
        left={<Tile icon="flag-outline" />} onPress={() => router.push('/boundary')} />
      <ListRow title="我的空间" detail="动态、日志和相册" left={<Tile icon="person-circle-outline" />}
        onPress={() => router.push({ pathname: '/space/[id]', params: { id: user.id } })} />
      <ListRow title="我的动态" detail="查看你发布的动态" left={<Tile icon="albums-outline" />}
        onPress={() => router.navigate({ pathname: '/moments', params: { mine: '1' } })} />
      {isUiDemo && <ListRow title="想去的地方" detail="查看在玩乐里保存的去处" left={<Tile icon="bookmark-outline" />}
        onPress={() => router.push('/playground/saved')} />}
      <ListRow title="我的生活状态" detail="图片、表情和可见范围" left={<Tile icon="happy-outline" />} onPress={()=>router.push('/life/status')}/>
      <ListRow title="我的收藏与好友推荐" left={<Tile icon="bookmark-outline" />} onPress={()=>router.push('/life/items')}/>
      <ListRow title="生活提醒" left={<Tile icon="notifications-outline" />} onPress={()=>router.push('/life/reminders')}/>
    </SettingGroup>
    <SettingGroup title="偏好设置">
      <ListRow title="本机空间隐私" left={<Tile icon="eye-outline" />} onPress={() => router.push('/space/privacy')} />
      <ListRow title="主题与外观" left={<Tile icon="color-palette-outline" />} onPress={() => setSheet('主题与外观')} />
      <ListRow title="通用设置" left={<Tile icon="settings-outline" />} onPress={() => setSheet('通用设置')} />
    </SettingGroup>
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
      {sheet === '主题与外观' && <>
        {([
          ['system', '跟随系统', 'contrast-outline'],
          ['light', '浅色', 'sunny-outline'],
          ['dark', '深色', 'moon-outline'],
        ] as const).map(([key, label, icon]) => (
          <ListRow key={key} title={label} left={<Tile icon={icon} />}
            detail={key === 'system' ? '随手机外观设置切换' : undefined}
            trailing={preference === key ? <Icon name="checkmark" color={colors.accent} /> : <View />}
            onPress={() => void setPreference(key).catch(() => setError('暂时无法保存外观偏好，请重试。'))} />
        ))}
        <Text style={styles.small}>当前外观 · {scheme === 'dark' ? '深色' : '浅色'}</Text>
        {!!error && <Notice>{error}</Notice>}
      </>}
      {sheet === '通用设置' && <ListRow title="朋聊" detail={enterDemo ? '0.1.0 · 离线演示' : '0.1.0'} left={<Tile icon="chatbubbles-outline" />} />}
    </Sheet>}
  </Screen>;
}

function Tile({ icon }: { icon: IconName }) {
  return <View style={local.tile}><Icon name={icon} size={19} /></View>;
}

const local = StyleSheet.create({
  profile: { padding: space.md, gap: space.sm, borderRadius: radius.surface, backgroundColor: colors.panel },
  signature: { width: 40, height: 4, borderRadius: 2 },
  name: { ...type.title, color: colors.text },
  tile: { width: 34, height: 34, borderRadius: radius.small, backgroundColor: colors.backdrop,
    alignItems: 'center', justifyContent: 'center' },
});
