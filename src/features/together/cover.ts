import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { pickOnePhoto } from '../media/picker';

export async function chooseCover() {
  const photo = await pickOnePhoto();
  if (!photo) return;
  const context = ImageManipulator.manipulate(photo.uri);
  try {
    if (Math.max(photo.width, photo.height) > 960)
      context.resize(photo.width > photo.height ? { width: 960 } : { height: 960 });
    const image = await context.renderAsync();
    try {
      for (const compress of [0.78, 0.6, 0.4]) {
        const result = await image.saveAsync({ format: SaveFormat.JPEG, base64: true, compress });
        if (result.base64 && result.base64.length <= 131072) return result.base64;
      }
      throw new Error('这张照片压缩后仍然太大，请换一张封面。');
    } finally {
      image.release();
    }
  } finally {
    context.release();
  }
}
