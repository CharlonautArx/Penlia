import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Button, Notice, Sheet } from '../../components/ui';
import { styles } from '../../theme';
import { Choice } from './AudienceSheet';
import { selectPhotos } from './media';
import type { SpaceCard } from './model';
import { coverTones, CoverPreview } from './SpaceHeader';
import { useSpace } from './store';

export function CoverEditor({ initial, onClose }: { initial: SpaceCard; onClose: () => void }) {
  const state = useSpace();
  const [cover, setCover] = useState(initial.cover);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function pick() {
    if (!state.me || busy) return;
    setError(''); setBusy(true);
    try {
      const [photo] = await selectPhotos(state.me.id, 1);
      if (photo) setCover({ ...cover, photo });
    } catch { setError('暂时无法读取这张照片。'); }
    finally { setBusy(false); }
  }

  return <Sheet title="编辑封面" onClose={onClose}>
    <CoverPreview cover={cover} />
    <Text style={styles.strong}>空间封面</Text>
    {([['mist', '粉蓝柔雾'], ['dawn', '暖调晨光'], ['blue', '蓝调傍晚']] as const).map(([tone, label]) =>
      <Choice key={tone} label={label} picked={!cover.photo && cover.tone === tone} onPress={() => setCover({ tone })}
        left={<LinearGradient colors={coverTones[tone]} style={local.swatch} />} />)}
    <Button label={busy ? '正在读取…' : cover.photo ? '更换自定义封面' : '选择自定义封面'}
      icon="image-outline" variant="soft" disabled={busy} onPress={() => void pick()} />
    {!!error && <Notice>{error}</Notice>}
    <Button label="保存封面" variant="gradient" disabled={busy} onPress={() => {
      state.update((previous) => ({ ...previous, space: { ...previous.space, cover } }));
      onClose();
    }} />
  </Sheet>;
}

const local = StyleSheet.create({ swatch: { width: 36, height: 29, borderRadius: 8 } });
