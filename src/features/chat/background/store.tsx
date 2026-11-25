import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import {
  assignBackground, blankBackgrounds, chatBackground, readBackgrounds, usedFiles, wallpaperFile,
  type Backgrounds, type LocalPicture,
} from './model';

export const nativeChatBackgrounds = Platform.OS !== 'web';

function folder(account: string) {
  return new Directory(Paths.document, 'penlia-chat-backgrounds', encodeURIComponent(account));
}

function clean(folder: Directory, value: Backgrounds) {
  try {
    if (!folder.exists) return;
    const keep = usedFiles(value);
    for (const entry of folder.list()) {
      if (entry instanceof File && wallpaperFile.test(entry.name) && !keep.has(entry.name)) deletePicture(entry.uri);
    }
  } catch { /* Retry cleanup when the account opens or saves again. */ }
}

export function deletePicture(uri: string) {
  try { const file = new File(uri); if (file.exists) file.delete(); }
  catch { /* Files that could not be removed can be swept on the next load. */ }
}

type Store = {
  value: Backgrounds;
  loading: boolean;
  error: boolean;
  retry: () => void;
  resolve: (peer?: string, voice?: boolean) => LocalPicture | undefined;
  save: (peer: string | undefined, source?: LocalPicture | null, voice?: boolean) => Promise<void>;
};
const Context = createContext<Store | null>(null);

export function ChatBackgroundProvider({ account, children }: { account?: string; children: ReactNode }) {
  const [value, setValue] = useState(blankBackgrounds);
  const [loading, setLoading] = useState(nativeChatBackgrounds && !!account);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(value);
  const queue = useRef(Promise.resolve());
  const ready = useRef(false);
  const key = 'penlia.chat-backgrounds.v1.' + account;

  useEffect(() => {
    if (!account || !nativeChatBackgrounds) return;
    let active = true;
    ready.current = false;
    setLoading(true);
    setError(false);
    void AsyncStorage.getItem(key).then((raw) => {
      if (!active) return;
      const document = readBackgrounds(raw);
      latest.current = document;
      setValue(document);
      ready.current = true;
      clean(folder(account), document);
    }).catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; ready.current = false; };
  }, [account, key, attempt]);

  function resolve(peer?: string, voice = false) {
    if (!account || !nativeChatBackgrounds) return;
    const picture = voice ? value.voice : chatBackground(value, peer);
    return picture && { ...picture, uri: new File(folder(account), picture.file).uri };
  }

  function save(peer: string | undefined, source?: LocalPicture | null, voice = false) {
    const pending = queue.current.then(async () => {
      if (!account || !ready.current) throw new Error('聊天背景设置尚未读取，请重试。');
      const destination = folder(account);
      let copied: File | undefined;
      try {
        if (source) {
          destination.create({ intermediates: true, idempotent: true });
          copied = new File(destination, randomUUID() + '.jpg');
          await new File(source.uri).copy(copied);
        }
        const picture = copied && source ? {
          file: copied.name, width: source.width, height: source.height, x: source.x, y: source.y,
        } : source === null ? null : undefined;
        const next = voice ? { ...latest.current, voice: picture ?? undefined } : assignBackground(latest.current, peer, picture);
        await AsyncStorage.setItem(key, JSON.stringify(next));
        latest.current = next;
        setValue(next);
        clean(destination, next);
      } catch (failure) {
        if (copied) deletePicture(copied.uri);
        throw failure;
      }
    });
    queue.current = pending.catch(() => {});
    return pending;
  }

  return <Context.Provider value={{ value, loading, error, retry: () => setAttempt((current) => current + 1), resolve, save }}>
    {children}
  </Context.Provider>;
}

export function useChatBackgrounds() {
  const store = useContext(Context);
  if (!store) throw new Error('ChatBackgroundProvider is missing');
  return store;
}
