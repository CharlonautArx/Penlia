export type Framing = { x: number; y: number; zoom: number };
export const centered: Framing = { x: 0.5, y: 0.5, zoom: 1 };
export const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
export function cropRect(width: number, height: number, ratio: number, frame: Framing) {
  const zoom = clamp(frame.zoom, 1, 6);
  const w = clamp(Math.round(Math.min(width, height * ratio) / zoom), 1, width);
  const h = clamp(Math.round(w / ratio), 1, height);
  return { originX: Math.round((width - w) * clamp(frame.x, 0, 1)), originY: Math.round((height - h) * clamp(frame.y, 0, 1)), width: w, height: h };
}
