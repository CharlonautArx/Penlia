import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Avatar, Button, Notice } from '../../components/ui';
import { errorMessage } from '../../services/api';
import { styles } from '../../theme';
import { savePreparedPhoto } from '../space/media';
import { cropJpeg, FullImageCrop } from './FullImageCrop';
import { pickOnePhoto, type SelectedImage } from './picker';

export function AvatarEditor({ account, value, onChange, name = '朋友', fallback, compact, remote }: {
  account: string; value?: string | null; onChange: (photo: string | null, jpeg?: string) => void | Promise<void>; name?: string;
  fallback?: Parameters<typeof Avatar>[0]['source']; compact?: boolean; remote?: boolean;
}) {
  const [chosen, setChosen] = useState<SelectedImage>();
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  async function pick() {
    if (busy) return;
    setBusy(true); setFeedback('');
    try { setChosen(await pickOnePhoto()); }
    catch (error) { setFeedback(errorMessage(error)); }
    finally { setBusy(false); }
  }
  const portrait = <Pressable accessibilityRole="button" accessibilityLabel="更换头像" disabled={busy} onPress={() => void pick()}>
    <Avatar name={name} source={fallback} localPhotoId={value ?? undefined} size={compact ? 72 : 64} />
  </Pressable>;
  return <>
    {compact ? portrait : <View style={styles.card}>
      <View style={styles.row}>
        {portrait}
        <View style={styles.grow}><Text style={styles.strong}>头像照片</Text></View>
        <Button label="从图库选头像" disabled={busy} variant="soft" onPress={() => void pick()} />
      </View>
      {!!(value || remote) && <Button label="恢复默认头像" variant="quiet" disabled={busy} onPress={() => {
        setBusy(true); setFeedback('');
        void Promise.resolve(onChange(null)).catch((error) => setFeedback(errorMessage(error))).finally(() => setBusy(false));
      }} />}
          </View>}
    {!!feedback && <Notice>{feedback}</Notice>}
    {chosen && <FullImageCrop source={chosen} ratio={1} round onClose={() => setChosen(undefined)}
      onConfirm={async (source, frame) => {
        const photo = await cropJpeg(source, 1, frame, 256, 32 * 1024);
        const asset = await savePreparedPhoto(photo.uri, account);
        await onChange(asset.id, photo.base64);
        setChosen(undefined);
      }} />}
  </>;
}
