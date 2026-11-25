import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef } from 'react';

import { isUiDemo } from '../../demo/mode';
import { spaceSamples } from '../../demo/space';
import type { User } from '../../services/api';
import { useFriends } from '../../services/friends';
import { useSession } from '../../services/session';
import { localId, useLocalDocument } from '../local/document';
import {
  audienceAllows, blankDraft, canSeeEntry, emptySpace, type Album, type Entry, type Reply,
  type SpaceCard, type SpaceDocument,
} from './model';

type LegacyPost = {
  id: string; author?: string; username?: string; text: string; time: string;
  photo?: string; likes: number; liked: boolean; reaction?: string;
  comments?: { id: string; text: string; author?: string }[];
};

async function readSpace(key: string, ownerId: string, samples: ReturnType<typeof spaceSamples> | undefined): Promise<SpaceDocument> {
  const stored = await AsyncStorage.getItem(key);
  if (stored) {
    const document = JSON.parse(stored) as SpaceDocument;
    return document.space.cover ? document
      : { ...document, space: { ...document.space, cover: emptySpace().cover } };
  }
  const old = await AsyncStorage.getItem('penlia.moments.v1.' + ownerId);
  const legacy = old ? JSON.parse(old) as LegacyPost[] : [];
  const entries = samples?.entries ?? [];
  const migrated = legacy.flatMap((item, index): Entry[] => {
    const seed = entries.find(({ id }) => id === item.id);
    if (item.author && !seed) return [];
    const at = Date.parse(item.time);
    const previous = new Map(seed?.comments.map((reply) => [reply.id, reply]) ?? []);
    return [{
      ...(seed ?? blankDraft('thought')),
      id: item.id, text: item.text, ownerId: seed?.ownerId ?? ownerId,
      at: seed?.at ?? (Number.isFinite(at) ? at : Date.now() - index * 60_000),
      likes: item.likes, liked: item.liked, reaction: item.reaction,
      comments: (item.comments ?? []).map((comment) => previous.get(comment.id)
        ?? { id: comment.id, text: comment.text, authorId: ownerId, at: Date.now() }),
    }];
  });
  const seen = new Set(migrated.map(({ id }) => id));
  return {
    entries: [...migrated, ...entries.filter(({ id }) => !seen.has(id))],
    drafts: {}, albums: samples?.albums ?? [], space: samples?.space ?? emptySpace(), guestNotes: {},
  };
}

type SpaceState = ReturnType<typeof useAccountSpace>;
const Context = createContext<SpaceState | null>(null);
const fallbackSpace = emptySpace();

export function SpaceProvider({ children }: { children: ReactNode }) {
  const state = useAccountSpace();
  return <Context.Provider value={state}>{children}</Context.Provider>;
}

function useAccountSpace() {
  const { session, demoAvatarKey, saveProfile } = useSession();
  const { relationships, refresh } = useFriends();
  const me = session?.user;
  const samples = useMemo(() => isUiDemo ? spaceSamples() : undefined, []);
  const key = me && 'penlia.space.v1.' + me.id;
  const store = useLocalDocument(key, () => readSpace(key!, me!.id, samples));
  const migratedRegion = useRef<string | undefined>(undefined);
  const legacyRegion = store.value?.space.region;
  useEffect(() => {
    if (!me || me.region != null || !legacyRegion || migratedRegion.current === me.id) return;
    migratedRegion.current = me.id;
    void saveProfile({ region: legacyRegion, importRegion: true }).catch(() => {});
  }, [me, legacyRegion, saveProfile]);
  const friends = useMemo(() => relationships?.filter((friend) => friend.status === 'accepted') ?? [], [relationships]);

  useEffect(() => { if (me) void refresh(); }, [me?.id, refresh]);

  function person(id: string): User | undefined {
    if (me?.id === id) return me;
    const friend = friends.find((item) => item.userId === id);
    return friend && { id: friend.userId, name: friend.name, username: friend.username, bio: friend.bio };
  }

  function owns(id: string) { return !!me && id === me.id; }
  function connected(ownerId: string, viewerId: string) {
    if (!me) return false;
    const other = ownerId === me.id ? viewerId : viewerId === me.id ? ownerId : undefined;
    return !!other && friends.some(({ userId }) => userId === other);
  }
  function card(id: string): SpaceCard {
    const state = store.value;
    const base = owns(id) ? state?.space : samples?.friendSpace[id];
    const resolved = owns(id) && me?.region != null ? { ...(base ?? fallbackSpace), region: me.region } : base ?? fallbackSpace;
    const added = !owns(id) ? state?.guestNotes[id] : undefined;
    return added?.length ? { ...resolved, guestbook: [...resolved.guestbook, ...added] } : resolved;
  }
  function spaceVisible(id: string, viewer = me?.id ?? '') {
    return !!person(id) && (owns(id) || isUiDemo)
      && (viewer === me?.id || (owns(id) && connected(id, viewer)))
      && audienceAllows(card(id).privacy.access, id, viewer, connected(id, viewer));
  }
  function entryVisible(entry: Entry, viewer = me?.id ?? '') {
    return !entry.cloudId && spaceVisible(entry.ownerId, viewer)
      && canSeeEntry(entry, card(entry.ownerId).privacy, viewer, connected(entry.ownerId, viewer));
  }
  function albumVisible(album: Album, viewer = me?.id ?? '') {
    return spaceVisible(album.ownerId, viewer);
  }
  function updateEntry(id: string, change: (entry: Entry) => Entry) {
    const found = store.value?.entries.find((entry) => entry.id === id);
    if (!found || !entryVisible(found)) return;
    store.update((state) => ({ ...state, entries: state.entries.map((entry) => entry.id === id ? change(entry) : entry) }));
  }
  function note(ownerId: string, text: string) {
    if (!me || !text.trim() || !spaceVisible(ownerId) || !canInteract(ownerId)) return;
    const reply: Reply = { id: localId(), at: Date.now(), authorId: me.id, text: text.trim() };
    store.update((state) => owns(ownerId)
      ? { ...state, space: { ...state.space, guestbook: [...state.space.guestbook, reply] } }
      : { ...state, guestNotes: { ...state.guestNotes, [ownerId]: [...(state.guestNotes[ownerId] ?? []), reply] } });
  }
  function canInteract(ownerId: string) {
    return owns(ownerId) || (!!me && spaceVisible(ownerId) && card(ownerId).privacy.interact === 'friends');
  }

  return { ...store, me, demoAvatarKey, friends, person, owns, card, entryVisible, albumVisible, spaceVisible, updateEntry, note, canInteract };
}

export function useSpace() {
  const state = useContext(Context);
  if (!state) throw new Error('SpaceProvider is required');
  return state;
}
