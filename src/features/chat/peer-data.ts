import type { ImConnection } from '../../services/im';
import { type RichMessage } from '../media/protocol';

export async function fetchPeerPage(connection: ImConnection, peer: string, cursor?: string, times?: { start: number; end: number }) {
  const { sdk, client } = connection;
  return client.chatManager.fetchHistoryMessagesByOptions(peer, sdk.ChatConversationType.PeerChat, {
    cursor, pageSize: 40,
    options: new sdk.ChatFetchMessageOptions({
      startTs: times?.start ?? -1, endTs: times?.end ?? -1, direction: sdk.ChatSearchDirection.UP, needSave: true,
      msgTypes: [sdk.ChatMessageType.TXT, sdk.ChatMessageType.IMAGE, sdk.ChatMessageType.LOCATION,
        sdk.ChatMessageType.VIDEO, sdk.ChatMessageType.FILE, sdk.ChatMessageType.CUSTOM],
    }),
  });
}

export function mergePeerRows(current: RichMessage[], incoming: RichMessage[]) {
  const rows = new Map(current.map((row) => [row.id, row]));
  for (const row of incoming) rows.set(row.id, row);
  return [...rows.values()].sort((a,b) => b.timestamp - a.timestamp || b.id.localeCompare(a.id));
}
