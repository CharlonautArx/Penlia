export const momentPhotoLimit = 20;

export function movePhoto<T>(items: readonly T[], from: number, to: number): readonly T[] {
  'worklet';
  if (from === to || from < 0 || from >= items.length || to < 0 || to >= items.length) return items;
  const next = items.slice();
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

export function photoDropIndex(from: number, dx: number, dy: number, step: number, count: number) {
  'worklet';
  const col = Math.max(0, Math.min(2, Math.round(from % 3 + dx / step)));
  const row = Math.max(0, Math.floor(Math.floor(from / 3) + dy / step + 0.5));
  return Math.min(count - 1, row * 3 + col);
}

export function photoShiftedIndex(index: number, from: number, to: number) {
  'worklet';
  if (from < to && index > from && index <= to) return index - 1;
  if (from > to && index >= to && index < from) return index + 1;
  return index;
}

export function photoEdgeSpeed(y: number, top: number, height: number) {
  'worklet';
  const edge = Math.min(74, height / 4);
  if (edge <= 0) return 0;
  const distance = Math.min(edge, Math.max(-edge, y < top + edge ? y - top - edge : Math.max(0, y - top - height + edge)));
  return Math.sign(distance) * 650 * (Math.abs(distance) / edge) ** 1.5;
}

export function momentPhotoGrid<T>(images: readonly T[], detail: boolean) {
  const visible = detail ? images : images.slice(0, 9);
  return {
    rows: Array.from({ length: Math.ceil(visible.length / 3) }, (_, row) => visible.slice(row * 3, row * 3 + 3)),
    more: !detail && images.length > 9 ? images.length - 8 : 0,
  };
}
