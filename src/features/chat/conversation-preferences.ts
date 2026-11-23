export type ConversationPreference = { pinned?: boolean; manualUnread?: true; hidden?: true };
export type ConversationPreferences = Record<string, ConversationPreference>;

export function setConversationPreference(
  state: ConversationPreferences, id: string, change: { pinned?: boolean; manualUnread?: boolean; hidden?: boolean },
): ConversationPreferences {
  const previous = state[id];
  const next: ConversationPreference = {
    pinned: change.pinned ?? previous?.pinned,
    manualUnread: (change.manualUnread ?? previous?.manualUnread) || undefined,
    hidden: (change.hidden ?? previous?.hidden) || undefined,
  };
  if (next.pinned === previous?.pinned && next.manualUnread === previous?.manualUnread && next.hidden === previous?.hidden) return state;
  const result = { ...state };
  if (next.pinned === undefined && !next.manualUnread && !next.hidden) delete result[id];
  else result[id] = next;
  return result;
}

export function conversationAppearance(preference: ConversationPreference | undefined, sdkPinned?: boolean) {
  return {
    pinned: preference?.pinned ?? sdkPinned ?? false,
    manualUnread: preference?.manualUnread === true,
    hidden: preference?.hidden === true,
  };
}

export function orderConversations<T extends { pinned: boolean; last: { timestamp: number }; person: { userId: string } }>(rows: T[]) {
  return [...rows].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.last.timestamp - a.last.timestamp
    || (a.person.userId < b.person.userId ? -1 : Number(a.person.userId > b.person.userId)));
}

export function conversationMatches(values: string[], term: string, hidden: boolean) {
  return term ? values.some((value) => value.toLowerCase().includes(term)) : !hidden;
}
