import { useState } from 'react';
import { Avatar } from '../../components/ui';
import { cropJpeg, FullImageCrop } from '../media/FullImageCrop';
import { pickOnePhoto, type SelectedImage } from '../media/picker';

export function GroupPortrait({ name, avatar }: { name: string; avatar?: string | null }) {
  return <Avatar name={name} size={42} source={avatar ? { uri: 'data:image/jpeg;base64,' + avatar } : undefined} />;
}

export function useGroupPortraitPicker() {
  const [selection, setSelection] = useState<{ photo: SelectedImage; save: (avatar: string) => void | Promise<void> }>();
  async function choose(save: (avatar: string) => void | Promise<void>) {
    const photo = await pickOnePhoto();
    if (photo) setSelection({ photo, save });
  }
  const crop = selection && <FullImageCrop source={selection.photo} ratio={1} round onClose={() => setSelection(undefined)}
    onConfirm={async (source, frame) => {
      const output = await cropJpeg(source, 1, frame, 192, 24576);
      await selection.save(output.base64);
      setSelection(undefined);
    }} />;
  return { choose, crop };
}
