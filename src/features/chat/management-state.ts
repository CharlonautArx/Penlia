import { useState } from 'react';
import type { ManagedMessage } from './MessageManagement';
import type { Quote } from './record-model';

export function useHistoryState() {
  const [menu, setMenu] = useState<{ message: ManagedMessage; anchor?: { x: number; y: number } }>();
  const [selected, setSelected] = useState<Set<string>>();
  const [quote, setQuote] = useState<Quote>();
  const [share, setShare] = useState<ManagedMessage[]>();
  function toggle(id: string) {
    setSelected((current) => {
      if (!current) return current;
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  return { menu, setMenu, selected, setSelected, toggle, quote, setQuote, share, setShare };
}
