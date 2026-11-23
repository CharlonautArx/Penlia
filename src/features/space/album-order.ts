import type { Album } from './model';

export function movePosition(index: number, from: number, to: number) {
  "worklet";
  if (index === from) return to;
  if (from < index && index <= to) return index - 1;
  if (to <= index && index < from) return index + 1;
  return index;
}

export function moveAlbumPhoto(album: Album, from: number, to: number): Album {
  if (from === to || !album.photos[from] || !album.photos[to]) return album;
  const photos = [...album.photos];
  const [photo] = photos.splice(from, 1);
  photos.splice(to, 0, photo);
  return { ...album, photos, cover: movePosition(album.cover, from, to) };
}

export function removeAlbumPhotos(album: Album, selected: ReadonlySet<number>): Album {
  const photos = album.photos.filter((_, index) => !selected.has(index));
  const cover = selected.has(album.cover) ? 0 :
    album.photos.slice(0, album.cover).filter((_, index) => !selected.has(index)).length;
  return { ...album, photos, cover: Math.min(cover, Math.max(0, photos.length - 1)) };
}
