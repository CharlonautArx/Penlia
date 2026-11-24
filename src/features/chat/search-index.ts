export type SearchKind = 'text' | 'image' | 'video' | 'file' | 'location' | 'sticker';
export type SearchRow<T> = { id: string; timestamp: number; kind: SearchKind; caption: string; row: T };
export const foldSearch = (input: string) => input.normalize('NFKC').trim().toLocaleLowerCase();
export function localDay(value: number) {
  const date = new Date(value);
  const two = (number: number) => String(number).padStart(2, '0');
  return date.getFullYear() + '-' + two(date.getMonth() + 1) + '-' + two(date.getDate());
}

export function indexHistory<T>(entries: SearchRow<T>[]) {
  const dates = new Map<string, SearchRow<T>>();
  const prepared = entries.map((entry) => ({ entry, key: foldSearch(entry.caption) }));
  // A day opens at its first available message, even when a page is added later.
  for (const { entry } of prepared) {
    const day = localDay(entry.timestamp);
    const previous = dates.get(day);
    if (!previous || entry.timestamp < previous.timestamp) dates.set(day, entry);
  }
  return { dates, matching: (text: string, kind: 'date' | 'media' | 'sticker' | 'file' | undefined) => {
    const query = foldSearch(text);
    return prepared.filter(({ entry, key }) =>
      (!kind || kind === 'date' || (kind === 'media' ? entry.kind === 'image' || entry.kind === 'video' : entry.kind === kind))
      && (!query || key.includes(query))).map(({ entry }) => entry);
  } };
}

export function calendarMonths(earliest: number, now = Date.now()) {
  const first = new Date(earliest), last = new Date(now);
  const start = first.getFullYear() * 12 + first.getMonth();
  const end = last.getFullYear() * 12 + last.getMonth();
  return Array.from({ length: Math.max(1, end - start + 1) }, (_, offset) => {
    const index = end - offset, year = Math.floor(index / 12), month = index % 12;
    return { year, month, key: localDay(new Date(year, month, 1).getTime()).slice(0, 7),
      first: new Date(year, month, 1).getDay(), length: new Date(year, month + 1, 0).getDate() };
  });
}
