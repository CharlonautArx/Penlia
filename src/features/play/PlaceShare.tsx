import { randomUUID } from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Avatar, Button, Empty, Icon, Notice, SearchField, Section, Sheet } from '../../components/ui';
import { useDemo } from '../../demo/state';
import { demoPortrait } from '../../demo/visuals';
import { errorMessage } from '../../services/api';
import { useFriends } from '../../services/friends';
import { imUserId, useIm } from '../../services/im';
import { useSession } from '../../services/session';
import { colors, space, styles, touch } from '../../theme';
import { displayName, emptyDirectory } from '../friends/directory';
import { useDirectory } from '../friends/store';
import { GroupPortrait } from '../groups/GroupPortrait';
import { deliverPeerMessage, UnknownDelivery } from '../media/messages';
import type { ChatGroup } from '../privacy/types';
import { useRecord } from '../social/ui';
import { encodePlaceCard } from './place-card-model';
import { bookingUrl, disclosure, placeProvider, type Place } from './places';

export type PlaceTarget = { kind: 'peer' | 'group'; id: string };

export function usePlaceDelivery() {
  const { session, request } = useSession();
  const demo = useDemo();
  const { connection, online, changed } = useIm();
  const { relationships } = useFriends();
  return async (target: PlaceTarget, text: string, clientId: string) => {
    if (!session) throw new Error('请先登录。');
    if (target.kind === 'group') {
      await request('/groups/' + target.id + '/messages', { method: 'POST', body: { clientId, content: text } });
    } else {
      if (relationships && !relationships.some((row) => row.userId === target.id && row.status === 'accepted'))
        throw new Error('这位好友已不可用。');
      if (demo) { demo.send(target.id, text); return; }
      if (!online || !connection || await connection.client.getCurrentUsername() !== imUserId(session.user.id))
        throw new Error('好友聊天尚未连接。');
      await request('/im/contact', { method: 'POST', body: { userId: target.id } });
      await deliverPeerMessage(connection, imUserId(target.id), { kind: 'text', text });
      changed();
    }
  };
}

export function PlaceShareButton({ place, prominent = false }: { place: Place; prominent?: boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button label="发个聚会提议" icon="paper-plane-outline" variant={prominent ? 'gradient' : 'soft'} onPress={() => setOpen(true)} />
    {open && <Recipients place={place} close={() => setOpen(false)} />}
  </>;
}

function Recipients({ place, close }: { place: Place; close: () => void }) {
  const { relationships, refresh, error: friendsError } = useFriends();
  const { value: directory } = useDirectory();
  const { data, error: groupError } = useRecord<{ groups: ChatGroup[] }>('/groups');
  const deliver = usePlaceDelivery();
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState(new Set<string>());
  const [done, setDone] = useState(new Set<string>());
  const [unknown, setUnknown] = useState(new Set<string>());
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const work = useRef(false);
  const operations = useRef(new Map<string, string>());
  useEffect(() => { void refresh(); }, [refresh]);
  const friends = (relationships ?? []).filter((item) => item.status === 'accepted');
  const groups = data?.groups ?? [];
  const term = query.trim().toLowerCase();
  const labelOf = (item: typeof friends[number]) => displayName(item, directory ?? emptyDirectory);
  const all = [...friends.map((item) => ({ kind: 'peer' as const, id: item.userId, label: labelOf(item),
    search: [labelOf(item), item.name, item.username].join(' '),
    avatar: <Avatar userId={item.userId} name={item.name} source={demoPortrait(item.username)} size={34} /> })),
  ...groups.map((item) => ({ kind: 'group' as const, id: item.id, label: item.name, search: item.name,
    avatar: <GroupPortrait name={item.name} avatar={item.avatar} /> }))];
  const key = ({ kind, id }: PlaceTarget) => kind + ':' + id;
  const pending = all.filter((item) => chosen.has(key(item)) && !done.has(key(item)) && !unknown.has(key(item)));

  function toggle(id: string) {
    if (work.current || done.has(id) || unknown.has(id)) return;
    setChosen((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  async function share() {
    if (work.current || !pending.length) return;
    work.current = true; setBusy(true); setErrors([]);
    const succeeded = new Set(done), uncertain = new Set(unknown);
    const problems: string[] = [];
    try {
      const text = encodePlaceCard({ id: place.id, provider: placeProvider(place), title: place.title.slice(0, 64),
        area: (place.city + ' · ' + place.district).slice(0, 72), category: place.category, intro: place.intro.slice(0, 120),
        source: disclosure(place).slice(0,48), cover: place.id, official: bookingUrl(place) });
      for (const target of pending) {
        const id = key(target);
        let ticket = operations.current.get(id);
        if (!ticket) { ticket = randomUUID(); operations.current.set(id, ticket); }
        try { await deliver(target, text, ticket); succeeded.add(id); }
        catch (failure) {
          if (failure instanceof UnknownDelivery) uncertain.add(id);
          problems.push(target.label + ' · ' + errorMessage(failure));
        }
      }
      setDone(succeeded); setUnknown(uncertain);
      setErrors(problems);
      setSent(problems.length === 0);
    } catch (failure) { setErrors([errorMessage(failure)]); }
    finally { work.current = false; setBusy(false); }
  }

  return <Sheet title="分享聚会提议" avoidKeyboard onClose={() => { if (!work.current) close(); }}>
    <Text style={styles.strong}>{place.title}</Text>
    {!!friendsError && <Notice>{friendsError}</Notice>}
    {!!groupError && <Notice>{groupError}</Notice>}
    {errors.map((failure) => <Notice key={failure}>{failure}</Notice>)}
    {sent ? <>
      <Text style={styles.muted}>已分别发送至 {done.size} 个会话。</Text>
      <Button label="完成" onPress={close} />
    </> : <>
      <SearchField label="搜索好友或群聊" placeholder="搜索好友或群聊" value={query} onChangeText={setQuery} />
      {(['peer', 'group'] as const).map((kind) => {
        const items = all.filter((item) => item.kind === kind && item.search.toLowerCase().includes(term));
        return <View key={kind}>
          <Section title={kind === 'peer' ? '好友' : '群聊'} />
          {items.length ? items.map((item) => {
            const id = key(item);
            const checked = chosen.has(id);
            const detail = done.has(id) ? '已发送' : unknown.has(id) ? '待确认送达' : undefined;
            return <Pressable key={id} accessibilityRole="checkbox" accessibilityLabel={item.label}
              accessibilityState={{ checked, disabled: !!detail || busy }} disabled={!!detail || busy}
              onPress={() => toggle(id)} style={[styles.row, styles.divider, { gap: space.xs, minHeight: touch, paddingVertical: space.xxs }]}>
              {item.avatar}
              <Text style={[styles.body, styles.grow]}>{item.label}</Text>
              {detail ? <Text style={styles.small}>{detail}</Text> : <Icon name={checked ? 'checkmark-circle' : 'ellipse-outline'} color={checked ? colors.accent : colors.quiet} size={22} />}
            </Pressable>;
          }) : <Empty busy={kind === 'peer' ? !relationships : !data && !groupError}>没有匹配的会话</Empty>}
        </View>;
      })}
      <Button label={busy ? '发送中…' : '确认发送（' + pending.length + '）'} variant="gradient"
        disabled={busy || !pending.length} onPress={() => void share()} />
    </>}
  </Sheet>;
}
