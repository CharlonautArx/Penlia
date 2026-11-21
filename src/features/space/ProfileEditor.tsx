import { useState } from 'react';
import { Text, TextInput } from 'react-native';

import { Button, Notice, Sheet } from '../../components/ui';
import { demoPortrait } from '../../demo/visuals';
import { errorMessage } from '../../services/api';
import { useSession } from '../../services/session';
import { styles } from '../../theme';
import { AvatarEditor } from '../media/AvatarEditor';

export function ProfileEditor({ onClose }: { onClose: () => void }) {
  const { session, updateProfile, demoAvatarKey, localAvatar, changeLocalAvatar } = useSession();
  const user = session?.user;
  const [draft, setDraft] = useState(localAvatar ?? null);
  const [name, setName] = useState(user?.name ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!user) return null;
  async function save() {
    if (busy || !name.trim()) return;
    setBusy(true);
    setError('');
    try {
      await updateProfile(name.trim(), bio.trim());
      if ((draft ?? undefined) !== localAvatar) await changeLocalAvatar(draft);
      onClose();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  return <Sheet title="编辑资料" onClose={() => { if (!busy) onClose(); }}>
    <AvatarEditor account={user.id} name={name || user.name} fallback={demoPortrait(demoAvatarKey ?? user.username)}
      value={draft} onChange={setDraft} />
    <Text style={styles.strong}>昵称</Text>
    <TextInput accessibilityLabel="昵称" value={name} onChangeText={setName} maxLength={16} style={styles.input} />
    <Text style={styles.strong}>个性签名</Text>
    <TextInput accessibilityLabel="签名" value={bio} onChangeText={setBio} maxLength={60} style={styles.input} />
    {!!error && <Notice>{error}</Notice>}
    <Button label={busy ? '保存中…' : '保存'} variant="gradient" disabled={busy || !name.trim()} onPress={() => void save()} />
  </Sheet>;
}
