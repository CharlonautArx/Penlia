import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Icon, ListRow, Notice, Screen, SettingGroup, Sheet } from '../components/ui';
import { demoPortrait } from '../demo/visuals';
import { AvatarEditor } from '../features/media/AvatarEditor';
import { useSpace } from '../features/space/store';
import { errorMessage } from '../services/api';
import { formatHandle } from '../services/handle';
import { useAccountPhoto, useSession } from '../services/session';
import { colors, styles, type } from '../theme';

export default function ProfileScreen() {
  const state = useSpace();
  const { changeLocalAvatar } = useSession();
  const localPhoto = useAccountPhoto(state.me?.id);
  const [extra, setExtra] = useState(false);
  if (!state.me) return null;
  const user = state.me;
  const profile = state.card(user.id);
  const edit = (field: 'username' | 'name' | 'bio') => router.push({ pathname: '/profile-field/[field]', params: { field } });
  return <Screen title="个人资料" back={() => router.canGoBack() ? router.back() : router.replace('/me')}>
    <View style={[styles.card, styles.row]}>
      <AvatarEditor account={user.id} name={user.name} value={localPhoto}
        fallback={user.avatar ? { uri: 'data:image/jpeg;base64,' + user.avatar } : demoPortrait(state.demoAvatarKey ?? user.username)}
        onChange={changeLocalAvatar} compact />
      <View style={styles.grow}>
        <Text style={local.name}>{user.name}</Text>
        <Text style={styles.muted}>{formatHandle(user.username)}</Text>
      </View>
    </View>
    <SettingGroup>
      <ListRow title="朋聊号" detail={formatHandle(user.username)} left={<Icon name="at-outline" />} onPress={() => edit('username')} />
      <ListRow title="昵称" detail={user.name} left={<Icon name="person-outline" />} onPress={() => edit('name')} />
      <ListRow title="个性签名" detail={user.bio || '还没有个性签名'} left={<Icon name="chatbox-outline" />} onPress={() => edit('bio')} />
      <ListRow title="个人主页" left={<Icon name="person-circle-outline" />} separator={false}
        onPress={() => router.push({ pathname: '/person/[id]', params: { id: user.id } })} />
    </SettingGroup>
    {!!state.error && <Notice action="重试" onAction={state.retry}>{state.error}</Notice>}
    {!!state.value && <SettingGroup title="补充资料">
      <ListRow title="地区" detail={profile.region || '未填写'} left={<Icon name="location-outline" />} onPress={() => setExtra(true)} />
      <ListRow title="状态" detail={profile.status || '未填写'} left={<Icon name="happy-outline" />} onPress={() => setExtra(true)} separator={false} />
    </SettingGroup>}
    {extra && <SupplementalProfile onClose={() => setExtra(false)} />}
  </Screen>;
}

function SupplementalProfile({ onClose }: { onClose: () => void }) {
  const state = useSpace();
  const { saveProfile } = useSession();
  const [region, setRegion] = useState(state.me?.region ?? state.value?.space.region ?? '');
  const [status, setStatus] = useState(state.value?.space.status ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      if (region.trim() !== (state.me?.region ?? '')) await saveProfile({ region: region.trim() });
      await state.save((previous) => ({ ...previous, space: { ...previous.space, region: region.trim(), status: status.trim() } }));
      onClose();
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(false); }
  }
  return <Sheet title="编辑补充资料" onClose={() => { if (!busy) onClose(); }}>
    <Text style={styles.strong}>地区</Text>
    <TextInput accessibilityLabel="地区" value={region} onChangeText={setRegion} maxLength={24} style={styles.input} />
    <Text style={styles.strong}>状态</Text>
    <TextInput accessibilityLabel="状态" value={status} onChangeText={setStatus} maxLength={28} style={styles.input} />
    {!!error && <Notice>{error}</Notice>}
    <Button label="保存补充资料" variant="gradient" disabled={busy} onPress={() => void save()} />
  </Sheet>;
}

const local = StyleSheet.create({ name: { ...type.title, color: colors.text } });
