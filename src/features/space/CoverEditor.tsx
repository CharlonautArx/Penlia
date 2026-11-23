import { useRef, useState } from 'react';
import { Image, Platform, View } from 'react-native';

import { Button, Notice, Sheet } from '../../components/ui';
import { nativePhotoUri, readLocalPhoto, selectPhotos } from './media';
import type { SpaceCard } from './model';
import { ImmersiveCover } from './ImmersiveCover';
import { CoverPreview } from './SpaceHeader';
import { useSpace } from './store';

export function CoverEditor({ initial, onClose, framing }: { initial: SpaceCard; framing?: { width: number; resting: number; reserve: number }; onClose: () => void }) {
  const state = useSpace();
  const [cover, setCover] = useState(initial.cover);
  const [dragging, setDragging] = useState(false);
  const [previewWidth, setPreviewWidth] = useState(0);
  const previewScale = framing ? previewWidth / framing.width : 1;
  const [error, setError] = useState('');
  const [operation, setOperation] = useState<'pick' | 'save'>();
  const pending = useRef<'pick' | 'save' | undefined>(undefined);
  const changed = !!cover.photo && (cover.photo.id !== initial.cover.photo?.id
    || cover.photo.type !== initial.cover.photo?.type
    || (cover.focus?.x ?? 0.5) !== (initial.cover.focus?.x ?? 0.5)
    || (cover.focus?.y ?? 0.5) !== (initial.cover.focus?.y ?? 0.5));

  async function pick() {
    if (!state.me || pending.current) return;
    setError('');
    pending.current = 'pick';
    setOperation('pick');
    try {
      // Preserve the original image for cropping and avoid the Android picker's re-encoding pass.
      const [photo] = await selectPhotos(state.me.id, 1, 1);
      if (photo) {
        await checkPhoto(photo.id);
        setCover({ tone: cover.tone, photo });
      }
    } catch {
      setError('暂时无法读取这张照片，请重新选择。');
    } finally {
      pending.current = undefined;
      setOperation(undefined);
    }
  }

  async function save() {
    if (!changed || pending.current) return;
    setError('');
    pending.current = 'save';
    setOperation('save');
    try {
      await state.save((previous) => ({ ...previous, space: { ...previous.space, cover } }));
      onClose();
    } catch {
      setError('封面保存失败，已保留原封面。请重试。');
    } finally {
      pending.current = undefined;
      setOperation(undefined);
    }
  }

  return <Sheet scrollEnabled={!dragging} title="编辑封面" onClose={() => {
    if (pending.current !== 'save') onClose();
  }}>
    {framing ? <View onLayout={({ nativeEvent }) => setPreviewWidth(nativeEvent.layout.width)}
      style={{ aspectRatio: framing.width / framing.resting }}>
      {previewWidth > 0 && <ImmersiveCover cover={cover} width={previewWidth} resting={framing.resting * previewScale}
        reserve={framing.reserve * previewScale} onDrag={setDragging}
        onFocus={!operation ? (focus) => setCover((current) => ({ ...current, focus })) : undefined} />}
    </View> : <CoverPreview cover={cover} />}
    <Button label={operation === 'pick' ? '正在读取…' : '选择自定义封面'}
      icon="image-outline" variant="soft" disabled={!!operation} onPress={() => void pick()} />
    {!!error && <Notice>{error}</Notice>}
    <Button label={operation === 'save' ? '正在保存…' : '保存封面'} variant="gradient"
      disabled={!!operation || !changed} onPress={() => void save()} />
  </Sheet>;
}

async function checkPhoto(id: string) {
  const blob = Platform.OS === 'web' ? await readLocalPhoto(id) : undefined;
  const uri = blob ? URL.createObjectURL(blob) : nativePhotoUri(id);
  if (!uri) throw new Error('无法读取照片。');
  try {
    await new Promise<void>((resolve, reject) => Image.getSize(uri, () => resolve(), reject));
  } finally {
    if (blob) URL.revokeObjectURL(uri);
  }
}
