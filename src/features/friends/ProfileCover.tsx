import AsyncStorage from '@react-native-async-storage/async-storage';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { useAppearance } from '../../components/appearance';
import { Button, Notice, Sheet } from '../../components/ui';
import { isUiDemo } from '../../demo/mode';
import { errorMessage } from '../../services/api';
import { useSession } from '../../services/session';
import { colors, palette, radius, styles } from '../../theme';
import { pickOnePhoto, type SelectedImage } from '../media/picker';

import { ProfileCropView, type CoverSource } from './ProfileCropView';
import { centered, cropRect, type Framing } from './profile-crop';

type Recipe = { source: CoverSource; frame: Framing };
type Saved = { photo: string | null; recipe?: Recipe };
const maxBase64 = Math.floor(512 * 1024 / 3) * 4;

export function useProfileCover(id: string, own: boolean) {
  const { request, session } = useSession();
  const [photo, setPhoto] = useState<string | null>(null);
  const [recipe, setRecipe] = useState<Recipe>();
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState('');
  const key = 'penlia:profile-cover:v1:' + session?.user.id;
  useFocusEffect(useCallback(() => {
    let active = true;
    setFailure('');
    setReady(false);
    const load = async (): Promise<Saved> => {
      const raw = own ? await AsyncStorage.getItem(key) : null;
      const saved: Saved = raw?.startsWith('{') ? JSON.parse(raw) : { photo: raw };
      if (isUiDemo) return saved;
      const result = await request<{ photo: string | null }>(own ? '/me/profile-cover' : '/people/' + id + '/profile-cover');
      return { photo: result.photo, recipe: result.photo === saved.photo ? saved.recipe : undefined };
    };
    void load().then((result) => {
      if (active) { setPhoto(result.photo); setRecipe(result.recipe); setReady(true); }
    }).catch((error) => {
      if (active) { setPhoto(null); setFailure(errorMessage(error)); }
    });
    return () => { active = false; };
  }, [id, key, own, request]));

  async function save(next: string | null, recipe?: Recipe) {
    if (!own) return;
    if (!isUiDemo) await request('/me/profile-cover', { method: 'PUT', body: { photo: next } });
    if (next === null) await AsyncStorage.removeItem(key);
    else await AsyncStorage.setItem(key, JSON.stringify({ photo: next, recipe }));
    setFailure(''); setReady(true); setPhoto(next); setRecipe(recipe);
  }
  return { photo, recipe, ready, failure, save };
}

export function ProfileCoverImage({ photo, fades, height }: { photo: string | null; fades?: boolean; height: number | '100%' }) {
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

async function compress(input: Pick<SelectedImage, 'uri' | 'width' | 'height'>, rect?: ReturnType<typeof cropRect>) {
  const context = ImageManipulator.manipulate(input.uri);
  try {
    if (rect) context.crop(rect);
    else if (Math.max(input.width, input.height) > 1280) {
      context.resize(input.width >= input.height ? { width: 1280 } : { height: 1280 });
    }
    const image = await context.renderAsync();
    try {
      for (const quality of [0.82, 0.65, 0.48]) {
        const compressed = await image.saveAsync({ format: SaveFormat.JPEG, base64: true, compress: quality });
        if (compressed.base64 && compressed.base64.length <= maxBase64) return { jpeg: compressed.base64, width: image.width, height: image.height };
      }
    } finally { image.release(); }
  } finally { context.release(); }
  throw new Error('这张照片暂时无法作为主页背景，请换一张再试。');
}

export function EditProfileCover({ cover, ratio, onClose }: { cover: ReturnType<typeof useProfileCover>; ratio: number; onClose: () => void }) {
  const [source, setSource] = useState<CoverSource | null>(cover.recipe?.source ?? null);
  const [frame, setFrame] = useState(cover.recipe?.frame ?? centered);
  const [changed, setChanged] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');

  async function act(operation: () => Promise<void>) {
    setBusy(true);
    setFailure('');
    try { await operation(); }
    catch (error) { setFailure(errorMessage(error)); }
    finally { setBusy(false); }
  }

  return <Sheet scrollEnabled={!dragging} title="个人主页背景" onClose={() => { if (!busy) onClose(); }} tone="neutral">
    <View style={local.preview}>{source ? <ProfileCropView ratio={ratio} source={source} frame={frame} onDrag={setDragging}
      onFrame={value => { setFrame(value); setChanged(true); }} /> : <View style={{aspectRatio: ratio}}>
      <ProfileCoverImage height="100%" photo={changed ? null : cover.photo} /></View>}</View>
    {source && <Text style={styles.small}>拖动照片调整位置，双指缩放。</Text>}
    {!!failure && <Notice>{failure}</Notice>}
    <Button label="从手机相册选择" icon="images-outline" variant="soft" disabled={busy} onPress={() => void act(async () => {
      const input = await pickOnePhoto();
      if (input) { setSource(await compress(input)); setFrame(centered); setChanged(true); }
    })} />
    {!!(source || (!changed && cover.photo)) && <Button label="使用默认背景" variant="quiet" disabled={busy} onPress={() => { setSource(null); setChanged(true); }} />}
    <Button label="保存主页背景" disabled={busy || !changed} onPress={() => void act(async () => {
      if (source) {
        const cropped = await compress({ ...source, uri: 'data:image/jpeg;base64,' + source.jpeg }, cropRect(source.width,source.height,ratio,frame));
        await cover.save(cropped.jpeg, { source, frame });
      } else await cover.save(null);
      onClose();
    })} />
  </Sheet>;
}

const local = StyleSheet.create({
  preview: { overflow: 'hidden', borderRadius: radius.surface, backgroundColor: colors.panel },
});
