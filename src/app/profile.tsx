import { formatHandle } from '../services/handle';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar, Button, Icon, IconButton, ListRow, Notice, Screen, SettingGroup, Sheet } from '../components/ui';
import { demoPortrait } from '../demo/visuals';
import { ProfileEditor } from '../features/space/ProfileEditor';
import { useSpace } from '../features/space/store';
import { colors, styles, type } from '../theme';

export default function ProfileScreen() {
  const state = useSpace();
  const [sheet, setSheet] = useState<'edit' | 'extra'>();
  if (!state.me) return null;
  const user = state.me;
  const profile = state.card(user.id);
  return <Screen title="个人资料" back={() => router.canGoBack() ? router.back() : router.replace('/me')}
    actions={<IconButton label="编辑资料" icon="create-outline" tinted onPress={() => setSheet('edit')} />}>
    <View style={[styles.card, styles.row]}>
      <Avatar userId={user.id} name={user.name} source={demoPortrait(state.demoAvatarKey ?? user.username)} size={72} />
      <View style={styles.grow}>
        <Text style={local.name}>{user.name}</Text>
        <Text style={styles.muted}>{formatHandle(user.username)}</Text>
      </View>
    </View>
    <SettingGroup>
      <ListRow title="朋聊号" detail={formatHandle(user.username)} left={<Icon name="at-outline" />} />
      <ListRow title="昵称" detail={user.name} left={<Icon name="person-outline" />} />
      <ListRow title="个性签名" detail={user.bio || '还没有个性签名'} left={<Icon name="chatbox-outline" />} />
      <ListRow title="个人主页" left={<Icon name="person-circle-outline" />} separator={false}
        onPress={() => router.push({ pathname: '/person/[id]', params: { id: user.id } })} />
    </SettingGroup>
    {!!state.error && <Notice action="重试" onAction={state.retry}>{state.error}</Notice>}
    {!!state.value && <>
      <SettingGroup title="本机补充资料">
        <ListRow title="地区" detail={profile.region || '未填写'} left={<Icon name="location-outline" />}
          onPress={() => setSheet('extra')} />
        <ListRow title="近况" detail={profile.status || '未填写'} left={<Icon name="happy-outline" />}
          onPress={() => setSheet('extra')} separator={false} />
      </SettingGroup>
    </>}
    {sheet === 'edit' && <ProfileEditor onClose={() => setSheet(undefined)} />}
    {sheet === 'extra' && <SupplementalProfile onClose={() => setSheet(undefined)} />}
  </Screen>;
}

function SupplementalProfile({ onClose }: { onClose: () => void }) {
  const state = useSpace();
  const [region, setRegion] = useState(state.value?.space.region ?? '');
  const [status, setStatus] = useState(state.value?.space.status ?? '');
  return <Sheet title="编辑本机补充资料" onClose={onClose}>
    <Text style={styles.strong}>地区</Text>
    <TextInput accessibilityLabel="地区" value={region} onChangeText={setRegion} maxLength={24} style={styles.input} />
    <Text style={styles.strong}>近况</Text>
    <TextInput accessibilityLabel="近况" value={status} onChangeText={setStatus} maxLength={28} style={styles.input} />
    <Button label="保存补充资料" variant="gradient" onPress={() => {
      state.update((previous) => ({ ...previous, space: { ...previous.space, region: region.trim(), status: status.trim() } }));
      onClose();
    }} />
  </Sheet>;
}

const local = StyleSheet.create({ name: { ...type.title, color: colors.text } });
