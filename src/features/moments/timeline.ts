import type { Entry } from '../space/model';
import type { Moment } from './model';

export type TimelineRow =
  | { key: string; time: number; pinned: boolean; moment: Moment; entry?: undefined }
  | { key: string; time: number; pinned: boolean; entry: Entry; moment?: undefined };
export type MomentIdentity = { id: string; clientId?: string | null };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function lookupKeys(entries: Entry[], owner: string) {
  return [...new Set(entries.filter((e) => e.kind === 'thought' && e.ownerId === owner && !e.cloudId)
    .flatMap((e) => [e.id, e.clientId].filter((id): id is string => !!id && uuid.test(id))))];
}

function identityIndex(identities: MomentIdentity[]) {
  const index = new Map<string, string>();
  for (const item of identities) {
    if (item.clientId) index.set(item.clientId, item.id);
    index.set(item.id, item.id);
  }
  return index;
}

// Record only exact owner-scoped identities. Matching text or photo names can collapse distinct posts.
export function reconcileEntries(entries: Entry[], owner: string, identities: MomentIdentity[]) {
  const index = identityIndex(identities);
  let changed = false;
  const next = entries.map((entry) => {
    if (entry.kind !== 'thought' || entry.ownerId !== owner || entry.cloudId) return entry;
    const cloudId = index.get(entry.clientId ?? '') ?? index.get(entry.id);
    if (!cloudId) return entry;
    changed = true;
    return { ...entry, cloudId };
  });
  return changed ? next : entries;
}

function order(a: TimelineRow, b: TimelineRow) {
  return Number(b.pinned) - Number(a.pinned) || b.time - a.time || b.key.localeCompare(a.key);
}

export function timelineRows(moments: Moment[], entries: Entry[], owner?: string, hasMore = false): TimelineRow[] {
  const cloud = new Map<string, TimelineRow>();
  for (const moment of moments) {
    if (owner && moment.authorId !== owner) continue;
    cloud.set(moment.id, { key: 'moment:' + moment.id, moment, pinned: !!moment.pinned, time: Date.parse(moment.createdAt) });
  }
  const rows = [...cloud.values()];
  if (!owner) return rows;
  const index = identityIndex(moments.filter((m) => m.authorId === owner));
  const boundary = hasMore ? rows.at(-1) : undefined;
  const archives = new Map<string, Entry>();
  for (const entry of entries) {
    if (entry.kind !== 'thought' || entry.ownerId !== owner) continue;
    const identity = entry.clientId || entry.id;
    const old = archives.get(identity);
    if (!old || entry.cloudId || (!old.cloudId && (entry.editedAt ?? entry.at) > (old.editedAt ?? old.at))) archives.set(identity, entry);
  }
  for (const entry of archives.values()) {
    if (entry.cloudId || index.has(entry.id) || (entry.clientId && index.has(entry.clientId))) continue;
    const row = { key: 'entry:' + entry.id, entry, pinned: !!entry.pinned, time: entry.at };
    if (!boundary || order(row, boundary) <= 0) rows.push(row);
  }
  return rows.sort(order);
}
