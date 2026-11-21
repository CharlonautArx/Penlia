import { router } from 'expo-router';
import { ListRow } from '../../components/ui';
import { useRecord } from '../social/ui';

export function RelatedRelays({ kind, id }: { kind: 'world' | 'journal' | 'collaboration'; id: string }) {
  const params = new URLSearchParams({ kind,id });
  const { data } = useRecord<{ relays: { id: string; title: string; eventDay: string }[] }>('/p3/relays-for?' + params);
  return data?.relays.map((relay) => (
    <ListRow key={relay.id} title={relay.title} detail={'瞬间共鸣 · ' + relay.eventDay}
      onPress={() => router.push({ pathname:'/world/[id]', params:{ id:relay.id } })} />
  ));
}
