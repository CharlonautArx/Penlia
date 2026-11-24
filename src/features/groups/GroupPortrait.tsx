import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Avatar } from '../../components/ui';
import { pickOnePhoto, squareCrop } from '../media/picker';

export function GroupPortrait({ name, avatar }: { name: string; avatar?: string | null }) {
  return <Avatar name={name} size={42} source={avatar ? { uri: 'data:image/jpeg;base64,' + avatar } : undefined} />;
}

export async function pickGroupPortrait() {
  const photo = await pickOnePhoto();
  if (!photo) return;
  const context = ImageManipulator.manipulate(photo.uri);
  try {
    const square = squareCrop(photo.width, photo.height, 1);
    context.crop(square);
    context.resize({ width: Math.min(192, square.width) });
    const image = await context.renderAsync();
    try {
      for (const compress of [0.8, 0.55]) {
        const result = await image.saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
        if (result.base64 && result.base64.length <= 32768) return result.base64;
      }
      throw new Error('群头像过大，请换一张照片。');
    } finally { image.release(); }
  } finally { context.release(); }
}
