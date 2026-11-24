export const momentPhotoLimit = 20;

export function momentPhotoGrid<T>(images: readonly T[], detail: boolean) {
  const visible = detail ? images : images.slice(0, 9);
  return {
    rows: Array.from({ length: Math.ceil(visible.length / 3) }, (_, row) => visible.slice(row * 3, row * 3 + 3)),
    more: !detail && images.length > 9 ? images.length - 8 : 0,
  };
}
