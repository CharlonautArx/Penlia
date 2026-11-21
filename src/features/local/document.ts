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

  function persist(data: T) {
    if (!key) return;
    writes.current = writes.current.then(async () => {
      try {
        await AsyncStorage.setItem(key, JSON.stringify(data));
        if (alive.current) setError('');
      } catch {
        if (alive.current) setError('本机保存失败，请重试。');
      }
    });
  }

  function update(change: (previous: T) => T) {
    if (current.current === undefined) return;
    const next = change(current.current);
    if (current.current === next) return;
    current.current = next;
    setValue(next);
    persist(next);
  }

  return { value, getLatest: () => current.current, loading, error, update, retry: () => {
    if (current.current !== undefined) persist(current.current);
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
