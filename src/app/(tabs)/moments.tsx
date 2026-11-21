import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef } from 'react';
import { PrivateFeed } from '../../features/moments/Feed';
import { useSession } from '../../services/session';

export default function MomentsScreen() {
  const { mine, author, local, pane } = useLocalSearchParams<{ mine?: string; author?: string; local?: string; pane?: string }>();
  const { session } = useSession();
  const me = session?.user.id;
  const handled = useRef('');
  useFocusEffect(useCallback(() => {
    const id = mine === '1' || local === '1' ? me : author;
    const key = id ? id + '/' + local : '';
    if (!key) { handled.current = ''; return; }
    if (!id || handled.current === key) return;
    handled.current = key;
    router.setParams({ mine: '0', author: '', local: '0' });
    if (local === '1') router.push({ pathname: '/space/[id]', params: { id, archive: '1' } });
    else router.push({ pathname: '/life/timeline/[id]', params: { id } });
  }, [mine, author, local, me]));
  return <PrivateFeed linkedPane={pane === 'journal' || pane === 'albums' ? pane : undefined} />;
}
