import { useTogetherRouter } from '../together/navigation';
import { ListRow } from '../together/ui';
import { useRecord } from '../social/ui';

export function RelatedRelays({ kind, id }: { kind: 'world' | 'journal' | 'collaboration'; id: string }) {
  const router = useTogetherRouter();
  const params = new URLSearchParams({ kind,id });
  const { data } = useRecord<{ relays: { id: string; title: string; eventDay: string }[] }>('/p3/relays-for?' + params);
  return data?.relays.map((relay) => (
    <ListRow key={relay.id} title={relay.title} detail={'瞬间共鸣 · ' + relay.eventDay}
      onPress={() => router.push({ pathname:'/world/[id]', params:{ id:relay.id } })} />
  ));
}
