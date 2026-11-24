export type Picture = { width: number; height: number; x: number; y: number };
export type Wallpaper = Picture & { file: string };
export type LocalPicture = Picture & { uri: string };
export type Backgrounds = { global?: Wallpaper; voice?: Wallpaper; peers: Record<string, Wallpaper | null> };

export const blankBackgrounds = (): Backgrounds => ({ peers: {} });
export const unit = (value: number) => Math.max(0, Math.min(1, value));

export function chatBackground(value: Backgrounds, peer?: string) {
  if (peer && Object.hasOwn(value.peers, peer)) return value.peers[peer] ?? undefined;
  return value.global;
}

export function assignBackground(value: Backgrounds, peer: string | undefined, wallpaper?: Wallpaper | null): Backgrounds {
  if (!peer) return { ...value, global: wallpaper ?? undefined };
  const peers = { ...value.peers, [peer]: wallpaper ?? null };
  if (wallpaper === undefined) delete peers[peer];
  return { ...value, peers };
}

export function usedFiles(value: Backgrounds) {
  return new Set([value.global, value.voice, ...Object.values(value.peers)].flatMap((item) => item ? [item.file] : []));
}

export const wallpaperFile = /^[0-9a-f-]{36}\.jpg$/;

export function readBackgrounds(raw: string | null): Backgrounds {
  if (!raw) return blankBackgrounds();
  const value = JSON.parse(raw) as Backgrounds;
  const valid = (item: Wallpaper) => !!item && wallpaperFile.test(item.file)
    && Number.isFinite(item.width) && item.width > 0 && Number.isFinite(item.height) && item.height > 0
    && Number.isFinite(item.x) && item.x >= 0 && item.x <= 1 && Number.isFinite(item.y) && item.y >= 0 && item.y <= 1;
  if (!value?.peers || typeof value.peers !== 'object' || Array.isArray(value.peers)
    || (value.voice !== undefined && !valid(value.voice))
    || (value.global !== undefined && !valid(value.global))
    || Object.values(value.peers).some((item) => item !== null && !valid(item))) throw new Error('Invalid background settings');
  return value;
}

export function pictureFrame(picture: Picture, width: number, height: number) {
  const scale = Math.max(width / picture.width, height / picture.height);
  const imageWidth = picture.width * scale;
  const imageHeight = picture.height * scale;
  return {
    width: imageWidth, height: imageHeight,
    left: (width - imageWidth) * picture.x, top: (height - imageHeight) * picture.y,
  };
}
