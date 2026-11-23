import AsyncStorage from '@react-native-async-storage/async-storage';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { useAppearance } from '../../components/appearance';
import { Button, Notice, Sheet } from '../../components/ui';
import { isUiDemo } from '../../demo/mode';
import { errorMessage } from '../../services/api';
import { useSession } from '../../services/session';
import { colors, palette, radius } from '../../theme';
import { pickOnePhoto, type SelectedImage } from '../media/picker';

const maxBase64 = Math.floor(512 * 1024 / 3) * 4;

export function useProfileCover(id: string, own: boolean) {
  const { request, session } = useSession();
  const [photo, setPhoto] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState('');
  const key = 'penlia:profile-cover:v1:' + session?.user.id;
  useFocusEffect(useCallback(() => {
    let active = true;
    setFailure('');
    setReady(false);
    const load = isUiDemo ? (own ? AsyncStorage.getItem(key) : Promise.resolve(null))
      : request<{ photo: string | null }>(own ? '/me/profile-cover' : '/people/' + id + '/profile-cover').then((value) => value.photo);
    void load.then((result) => {
      if (active) { setPhoto(result); setReady(true); }
    }).catch((error) => {
      if (active) { setPhoto(null); setFailure(errorMessage(error)); }
    });
    return () => { active = false; };
  }, [id, key, own, request]));

  async function save(next: string | null) {
    if (!own) return;
    if (isUiDemo) {
      if (next === null) await AsyncStorage.removeItem(key);
      else await AsyncStorage.setItem(key, next);
    } else {
      await request('/me/profile-cover', { method: 'PUT', body: { photo: next } });
    }
    setFailure('');
    setReady(true);
    setPhoto(next);
  }
  return { photo, ready, failure, save };
}

export function ProfileCoverImage({ photo, fades, height }: { photo: string | null; fades?: boolean; height: number }) {
  const { scheme } = useAppearance();
  const colorset = scheme === 'dark' ? ['#503645', '#33323D', '#263F41'] as const
    : ['#FFE4EC', '#EEF1FA', '#DDF8F6'] as const;
  const panel = palette[scheme].panel;
  return <View accessible={false} pointerEvents="none" style={{ height, overflow: 'hidden' }}>
    <LinearGradient colors={colorset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.8 }} style={StyleSheet.absoluteFill} />
    {!!photo && <Image source={{ uri: 'data:image/jpeg;base64,' + photo }} resizeMode="cover"
      fadeDuration={0} style={StyleSheet.absoluteFill} />}
    {fades && <LinearGradient colors={[panel + '00', panel + '28', panel]} locations={[0.48, 0.72, 1]}
      style={StyleSheet.absoluteFill} />}
  </View>;
}

async function compress(input: SelectedImage) {
  const context = ImageManipulator.manipulate(input.uri);
  try {
    if (Math.max(input.width, input.height) > 1280) {
      context.resize(input.width >= input.height ? { width: 1280 } : { height: 1280 });
    }
    const image = await context.renderAsync();
    try {
      for (const quality of [0.82, 0.65, 0.48]) {
        const compressed = await image.saveAsync({ format: SaveFormat.JPEG, base64: true, compress: quality });
        if (compressed.base64 && compressed.base64.length <= maxBase64) return compressed.base64;
      }
    } finally { image.release(); }
  } finally { context.release(); }
  throw new Error('这张照片暂时无法作为主页背景，请换一张再试。');
}

export function EditProfileCover({ cover, onClose }: { cover: ReturnType<typeof useProfileCover>; onClose: () => void }) {
  const [draft, setDraft] = useState<string | null>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');

  async function act(operation: () => Promise<void>) {
    setBusy(true);
    setFailure('');
    try { await operation(); }
    catch (error) { setFailure(errorMessage(error)); }
    finally { setBusy(false); }
  }

  return <Sheet title="个人主页背景" onClose={() => { if (!busy) onClose(); }} tone="neutral">
    <View style={local.preview}><ProfileCoverImage height={164} photo={draft === undefined ? cover.photo : draft} /></View>
    {!!failure && <Notice>{failure}</Notice>}
    <Button label="从手机相册选择" icon="images-outline" variant="soft" disabled={busy} onPress={() => void act(async () => {
      const input = await pickOnePhoto();
      if (input) setDraft(await compress(input));
    })} />
    {!!(draft ?? cover.photo) && draft !== null && <Button label="使用默认背景" variant="quiet" disabled={busy} onPress={() => setDraft(null)} />}
    <Button label="保存主页背景" disabled={busy || draft === undefined} onPress={() => void act(async () => {
      if (draft !== undefined) {
        await cover.save(draft);
        onClose();
      }
    })} />
  </Sheet>;
}

const local = StyleSheet.create({
  preview: { overflow: 'hidden', borderRadius: radius.surface, backgroundColor: colors.panel },
});
