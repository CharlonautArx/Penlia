import { isUiDemo } from '../../demo/mode';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, Icon, IconButton, ListRow, Notice, Screen, SettingGroup, Sheet, type IconName } from '../../components/ui';
import { ProfileEditor } from '../../features/space/ProfileEditor';
import { demoPortrait } from '../../demo/visuals';
import { errorMessage } from '../../services/api';
import { useSession } from '../../services/session';
import { brandGradient, colors, radius, space, styles, type } from '../../theme';
import { useAppearance } from '../../components/appearance';

export default function MeScreen() {
  const { session, logout, demoAvatarKey, avatarNotice } = useSession();
  const { preference, scheme, setPreference } = useAppearance();
  const [sheet, setSheet] = useState<'资料' | '主题与外观' | '通用设置'>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!session) return null;
  const { user } = session;

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

  return <Screen>
    <View style={local.profile}>
      <Pressable accessibilityRole="button" accessibilityLabel="查看个人资料" onPress={() => router.push('/profile')}
        style={({ pressed }) => [local.profileContent, pressed && local.pressed]}>
        <LinearGradient colors={brandGradient} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={local.signature} />
        <View style={[styles.row, local.profileRow]}>
          <Avatar userId={user.id} name={user.name} source={demoPortrait(demoAvatarKey ?? user.username)} size={68} />
          <View style={styles.grow}>
            <Text style={local.name}>{user.name}</Text>
            <Text style={styles.muted}>朋聊号 @{user.username}</Text>
          </View>
        </View>
        {!!user.bio && <Text style={styles.body}>{user.bio}</Text>}
      </Pressable>
      <View style={local.profileEdit}>
        <IconButton label="编辑资料" icon="create-outline" onPress={() => setSheet('资料')} disabled={busy} />
      </View>
    </View>
    <SettingGroup>
      <ListRow title="隐私与安全" detail="好友权限、安静时间、登录设备" left={<Tile icon="shield-checkmark-outline" />}
        onPress={() => router.push('/privacy')} />
    </SettingGroup>
    <SettingGroup title="我的生活">
      <ListRow title="生活边界保护计划" detail="举报记录、处置与申诉"
        left={<Tile icon="flag-outline" />} onPress={() => router.push('/boundary')} />
      {isUiDemo && <ListRow title="想去的地点" detail="查看在玩乐里保存的去处" left={<Tile icon="bookmark-outline" />}
        onPress={() => router.push('/playground/saved')} />}
      <ListRow title="状态" detail="文字、图片和可见范围" left={<Tile icon="happy-outline" />} onPress={()=>router.push('/life/status')}/>
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
    <Button label="退出登录" variant="danger" disabled={busy} onPress={() => void run(logout)} />
    {sheet === '资料' && <ProfileEditor onClose={() => setSheet(undefined)} />}
    {sheet && sheet !== '资料' && <Sheet title={sheet} onClose={() => { if (!busy) setSheet(undefined); }}>
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
      {sheet === '通用设置' && <ListRow title="朋聊" detail="0.1.0" left={<Tile icon="chatbubbles-outline" />} />}
    </Sheet>}
  </Screen>;
}

function Tile({ icon }: { icon: IconName }) {
  return <View style={local.tile}><Icon name={icon} size={19} /></View>;
}

const local = StyleSheet.create({
  profile: { borderRadius: radius.surface, backgroundColor: colors.panel },
  profileContent: { padding: space.md, gap: space.sm },
  profileRow: { paddingRight: 48 },
  profileEdit: { position: 'absolute', right: space.md, top: 38 },
  pressed: { opacity: 0.73 },
  signature: { width: 40, height: 4, borderRadius: 2 },
  name: { ...type.title, color: colors.text },
  tile: { width: 34, height: 34, borderRadius: radius.small, backgroundColor: colors.backdrop,
    alignItems: 'center', justifyContent: 'center' },
});
