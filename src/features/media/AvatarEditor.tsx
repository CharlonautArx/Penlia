import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, Notice } from '../../components/ui';
import { errorMessage } from '../../services/api';
import { colors, styles } from '../../theme';
import { pickOnePhoto, preparePhoto, type SelectedImage } from './picker';

export function AvatarEditor({ account, value, onChange, name = '朋友', fallback }: {
  account: string; value?: string | null; onChange: (photo: string | null) => void; name?: string;
  fallback?: Parameters<typeof Avatar>[0]['source'];
}) {
  const [chosen, setChosen] = useState<SelectedImage>();
  const [zoom, setZoom] = useState(1);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);

  async function pick() {
    setBusy(true); setFeedback('');
    try {
      const photo = await pickOnePhoto();
      if (photo) { setChosen(photo); setZoom(1); }
      else setFeedback('已取消选择，头像未改动。');
    } catch (error) { setFeedback(errorMessage(error)); }
    finally { setBusy(false); }
  }
  async function apply() {
    if (!chosen) return;
    setBusy(true);
    try {
      const photo = await preparePhoto(chosen, account, zoom);
      onChange(photo.id); setChosen(undefined); setFeedback('已准备头像，保存资料后在此设备生效。');
    } catch (error) { setFeedback(errorMessage(error)); }
    finally { setBusy(false); }
  }

  return <View style={local.card}>
    <View style={styles.row}>
      {chosen ? <View style={local.crop}>
        <Image accessible accessibilityLabel="圆形裁剪预览" source={{ uri: chosen.uri }} resizeMode="cover"
          style={[local.photo, { transform: [{ scale: zoom }] }]} />
      </View> : <Avatar name={name} source={fallback} localPhotoId={value ?? undefined} size={64} />}
      <View style={styles.grow}>
        <Text style={styles.strong}>{chosen ? '裁剪头像' : '头像照片'}</Text>
        <Text style={styles.small}>{chosen ? '以中间为基准，可放大取景。' : '从系统单选照片 · 保存在此设备'}</Text>
      </View>
      {!chosen && <Button label="从图库选头像" disabled={busy} variant="soft" onPress={() => void pick()} />}
    </View>
    {chosen && <View style={local.buttons}>
      <Button label="缩小" variant="soft" disabled={busy || zoom <= 1} onPress={() => setZoom((v) => Math.max(1, v - 0.25))} />
      <Button label="放大" variant="soft" disabled={busy || zoom >= 2.5} onPress={() => setZoom((v) => Math.min(2.5, v + 0.25))} />
      <Button label={busy ? '处理中…' : '使用裁剪结果'} disabled={busy} variant="gradient" onPress={() => void apply()} />
      <Button label="放弃" variant="quiet" disabled={busy} onPress={() => setChosen(undefined)} />
    </View>}
    {!!value && !chosen && <Button label="恢复默认头像" variant="quiet" onPress={() => { onChange(null); setFeedback(''); }} />}
    {!!feedback && <Notice>{feedback}</Notice>}
  </View>;
}

const local = StyleSheet.create({
  card: { ...styles.card, padding: 10, gap: 8 },
  crop: { width: 87, height: 87, borderWidth: 2, borderColor: colors.accent, borderRadius: 44, overflow: 'hidden' },
  photo: { width: '100%', height: '100%' },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
});
