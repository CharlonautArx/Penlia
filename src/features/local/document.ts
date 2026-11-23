import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';

export function useLocalDocument<T>(key: string | undefined, load: () => Promise<T>) {
  const [value, setValue] = useState<T>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!!key);
  const [attempt, setAttempt] = useState(0);
  const current = useRef<T | undefined>(undefined);
  const loadRef = useRef(load);
  const writes = useRef(Promise.resolve());
  const confirmedWrites = useRef(0);
  const alive = useRef(true);

  useEffect(() => {
    let active = true;
    alive.current = true;
    if (key) void loadRef.current().then((data) => {
      if (!active) return;
      current.current = data;
      setValue(data);
    }).catch(() => {
      if (active) setError('暂时无法读取此设备上的记录。');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; alive.current = false; };
  }, [key, attempt]);

  function publish(data: T) {
    current.current = data;
    if (alive.current) setValue(data);
  }

  async function write(data: T) {
    if (!key) return;
    await AsyncStorage.setItem(key, JSON.stringify(data));
    if (alive.current) setError('');
  }

  async function persist(data: T) {
    try { await write(data); }
    catch { if (alive.current) setError('本机保存失败，请重试。'); }
  }

  function apply(change: (previous: T) => T) {
    if (current.current === undefined) return;
    const next = change(current.current);
    if (current.current !== next) {
      publish(next);
      return next;
    }
  }

  function update(change: (previous: T) => T) {
    if (confirmedWrites.current) {
      // Apply subsequent optimistic edits to the result of the confirmed write.
      writes.current = writes.current.then(async () => {
        const next = apply(change);
        if (next !== undefined) await persist(next);
      });
      return;
    }
    const next = apply(change);
    if (next !== undefined) writes.current = writes.current.then(() => persist(next));
  }

  function save(change: (previous: T) => T) {
    confirmedWrites.current++;
    const pending = writes.current.then(async () => {
      if (!key || current.current === undefined) throw new Error('没有可保存的本机记录。');
      const next = change(current.current);
      if (next === current.current) return;
      await write(next);
      publish(next);
    }).finally(() => { confirmedWrites.current--; });
    writes.current = pending.catch(() => {});
    return pending;
  }

  return { value, getLatest: () => current.current, loading, error, update, save, retry: () => {
    if (current.current !== undefined) {
      writes.current = writes.current.then(async () => {
        if (current.current !== undefined) await persist(current.current);
      });
    }
    else if (key && !loading) {
      setLoading(true);
      setError('');
      setAttempt((value) => value + 1);
    }
  } };
}

export function localId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}
