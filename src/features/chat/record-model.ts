export type Quote = { id: string; author: string; body: string };
export type RecordLine = {
  id: string;
  kind: 'text' | 'image' | 'video' | 'location';
  time: number;
  author: string;
  body: string;
  quote?: string;
};
export type MessageReferences = { quote?: Quote; recordId?: string };

export function parseQuote(value: unknown): Quote | undefined {
  if (typeof value !== 'string' || value.length > 2048) return;
  try {
    const { id, author, body } = JSON.parse(value);
    if (typeof id === 'string' && id.length <= 128 && typeof author === 'string' && author.length <= 80
      && typeof body === 'string' && body.length <= 180) return { id, author, body };
  } catch { /* Older messages do not contain quote metadata. */ }
}

export function readRecordId(value: unknown) {
  return typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value) ? value : undefined;
}

export function shareSafeText(value: string) {
  return /\/life\/moment(?:-share)?\//.test(value) ? '[动态分享]' : value;
}

export function sortedRecords<T extends RecordLine>(messages: T[]) {
  return [...messages].sort((first, second) => first.time - second.time || first.id.localeCompare(second.id, undefined, { numeric: true }));
}
