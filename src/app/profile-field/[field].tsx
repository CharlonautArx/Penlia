import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Text } from 'react-native';

import { Button, Empty, Notice, Screen } from '../../components/ui';
import { Field } from '../../features/social/ui';
import { errorMessage, type User } from '../../services/api';
import { handlePattern, normalizeHandle } from '../../services/profile-model';
import { useSession } from '../../services/session';
import { styles } from '../../theme';

const fields = { username: { label: '朋聊号', max: 24 }, name: { label: '昵称', max: 16 }, bio: { label: '个性签名', max: 60 } };
type ProfileField = keyof typeof fields;
const back = () => router.canGoBack() ? router.back() : router.replace('/profile');

export default function EditProfileField() {
  const { field } = useLocalSearchParams<{ field: string }>();
  const { session } = useSession();
  if (!session) return null;
  if (!Object.hasOwn(fields, field)) return <Screen title="个人资料" back={back}><Empty>找不到这个资料项目。</Empty></Screen>;
  return <Editor key={field} field={field as ProfileField} user={session.user} />;
}

function Editor({ field, user }: { field: ProfileField; user: User }) {
  const { saveProfile } = useSession();
  const [text, setText] = useState(user[field]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const handle = field === 'username';
  const next = user.nextHandleChangeAt && new Date(user.nextHandleChangeAt);
  const locked = handle && !!next && next.getTime() > Date.now();
  const value = handle ? normalizeHandle(text) : text.trim();
  const changed = value !== user[field];
  async function save() {
    if (locked || lock.current || !changed) return;
    if (handle && !handlePattern.test(value)) { setError('朋聊号须为 3–24 位字母、数字或下划线。'); return; }
    lock.current = true; setBusy(true); setError('');
    try { await saveProfile({ [field]: value }); back(); }
    catch (failure) { setError(errorMessage(failure)); }
    finally { lock.current = false; setBusy(false); }
  }
  return <Screen title={'修改' + fields[field].label} back={back}>
    <Field title={fields[field].label} value={text} maxLength={fields[field].max}
      onChangeText={(input) => { setText(input); setError(''); }} editable={!busy && !locked} multiline={field === 'bio'}
      autoCapitalize={handle ? 'none' : undefined} autoCorrect={!handle} />
    {handle && <>
      <Text style={styles.small}>朋聊号可在上次成功修改满一年后再次更换。</Text>
      <Text style={styles.muted}>{locked && next ? '下次可修改：' + next.toLocaleString('zh-CN', { dateStyle: 'long', timeStyle: 'short' }) : '现在可以修改。'}</Text>
    </>}
    {!!error && <Notice>{error}</Notice>}
    <Button label={busy ? '保存中…' : '保存'} variant="gradient"
      disabled={busy || locked || !changed || field === 'name' && !value} onPress={() => void save()} />
  </Screen>;
}
