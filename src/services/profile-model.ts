export type ProfilePatch = { username?: string; name?: string; bio?: string; region?: string; importRegion?: boolean; avatar?: string | null; importAvatar?: boolean };
export const handlePattern = /^[a-z0-9_]{3,24}$/;
export const normalizeHandle = (value: string) => value.trim().toLowerCase();

export function nextHandleChange(value: Date) {
  const next = new Date(value);
  const month = next.getUTCMonth();
  next.setUTCFullYear(next.getUTCFullYear() + 1);
  if (next.getUTCMonth() !== month) next.setUTCDate(0);
  return next.toISOString();
}

type Identity = { id: string; name: string; username: string };

// Project identity fields only. Message text, notes and evidence are separate immutable fields.
export function presentLocalIdentity<T>(result: T, user: Identity): T {
  if (Array.isArray(result)) return result.map((item) => presentLocalIdentity(item, user)) as T;
  if (!result || typeof result !== 'object') return result;
  const source = result as Record<string, unknown>;
  const value = Object.fromEntries(Object.entries(source).map(([key, item]) => [
    key, ['quote', 'evidence', 'body', 'content', 'explanation'].includes(key) ? item : presentLocalIdentity(item, user),
  ]));
  if ([value.id, value.userId, value.senderId, value.memberId].includes(user.id) && typeof value.name === 'string')
    value.name = user.name;
  if (value.id === user.id && typeof value.username === 'string') value.username = user.username;
  if (value.authorId === user.id) {
    if (typeof value.author === 'string') value.author = user.name;
    if (typeof value.authorUsername === 'string') value.authorUsername = user.username;
  }
  if (value.ownerId === user.id && typeof value.owner === 'string') value.owner = user.name;
  if (value.actorId === user.id) {
    if (typeof value.actor === 'string') value.actor = user.name;
    if (typeof value.actorName === 'string') value.actorName = user.name;
  }
  return value as T;
}
