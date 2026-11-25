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
import { pickOnePhoto } from '../media/picker';

import { cropJpeg, FullImageCrop, type CropSource } from '../media/FullImageCrop';
import { centered, type Framing } from './profile-crop';

type Recipe = { source: { jpeg: string; width: number; height: number }; frame: Framing };
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

async function recipeSource(source: CropSource) {
  const context = ImageManipulator.manipulate(source.uri);
  try {
    if (Math.max(source.width, source.height) > 1280)
      context.resize(source.width >= source.height ? { width: 1280 } : { height: 1280 });
    const image = await context.renderAsync();
    try {
      for (const compress of [0.82, 0.65, 0.48]) {
        const output = await image.saveAsync({ format: SaveFormat.JPEG, base64: true, compress });
        if (output.base64 && output.base64.length <= maxBase64)
          return { jpeg: output.base64, width: output.width, height: output.height };
      }
    } finally { image.release(); }
  } finally { context.release(); }
  throw new Error('这张照片暂时无法作为主页背景，请换一张再试。');
}

export function EditProfileCover({ cover, ratio, onClose }: { cover: ReturnType<typeof useProfileCover>; ratio: number; onClose: () => void }) {
  const [draft, setDraft] = useState<{ photo: string | null; recipe?: Recipe }>();
  const [selection, setSelection] = useState<{ source: CropSource; frame: Framing }>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  async function act(operation: () => Promise<void>) {
    setBusy(true); setFailure('');
    try { await operation(); }
    catch (error) { setFailure(errorMessage(error)); }
    finally { setBusy(false); }
  }
  const recipe = draft ? draft.recipe : cover.recipe;
  return <>
    <Sheet title="个人主页背景" onClose={() => { if (!busy) onClose(); }} tone="neutral">
      <View style={[local.preview, { aspectRatio: ratio }]}>
        <ProfileCoverImage height="100%" photo={draft ? draft.photo : cover.photo} />
      </View>
      {!!failure && <Notice>{failure}</Notice>}
      <Button label="从手机相册选择" icon="images-outline" variant="soft" disabled={busy} onPress={() => void act(async () => {
        const input = await pickOnePhoto();
        if (input) setSelection({ source: input, frame: centered });
      })} />
      {!!recipe && <Button label="重新构图" variant="soft" disabled={busy} onPress={() => setSelection({
        source: { ...recipe.source, uri: 'data:image/jpeg;base64,' + recipe.source.jpeg }, frame: recipe.frame,
      })} />}
      {!!(draft ? draft.photo : cover.photo) && <Button label="使用默认背景" variant="quiet" disabled={busy} onPress={() => setDraft({ photo: null })} />}
      <Button label="保存主页背景" disabled={busy || !draft} onPress={() => void act(async () => {
        if (!draft) return;
        await cover.save(draft.photo, draft.recipe);
        onClose();
      })} />
    </Sheet>
    {selection && <FullImageCrop source={selection.source} initial={selection.frame} ratio={ratio}
      onClose={() => setSelection(undefined)} onConfirm={async (source, frame) => {
        const output = await cropJpeg(source, ratio, frame, 1280, 512 * 1024);
        setDraft({ photo: output.base64, recipe: { source: await recipeSource(source), frame } });
        setSelection(undefined);
      }} />}
  </>;
}

const local = StyleSheet.create({
  preview: { overflow: 'hidden', borderRadius: radius.surface, backgroundColor: colors.panel },
});
