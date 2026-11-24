export const recallWindow = 120_000;
export const recalledCaption = (mine: boolean) => mine ? '你撤回了一条消息' : '对方撤回了一条消息';
export const recalledQuote = '消息已撤回';
export function canRecall(mine: boolean, timestamp: number, now = Date.now()) {
  return mine && Number.isFinite(timestamp) && timestamp > 0 && timestamp <= now && now - timestamp < recallWindow;
}

export type RecallMarker = { id: string; timestamp: number; mine: boolean };
export function applyRecalls<T extends { id: string; timestamp: number; mine: boolean }>(
  messages: T[], markers: Record<string, RecallMarker>, hidden: Set<string>,
) {
  const active = messages.filter((row) => !hidden.has(row.id) && !Object.hasOwn(markers, row.id));
  return [...active, ...Object.values(markers).filter((row) => !hidden.has(row.id)).map((row) => ({ ...row, kind: 'recalled' as const }))]
    .sort((a, b) => b.timestamp - a.timestamp || b.id.localeCompare(a.id));
}
