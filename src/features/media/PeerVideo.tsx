import type { MessageLongPress } from '../chat/record-model';
import { useState } from 'react';
import { Text } from 'react-native';
import { Button, Notice, Sheet } from '../../components/ui';
import type { ImConnection } from '../../services/im';
import { errorMessage } from '../../services/api';
import { styles } from '../../theme';
import { MomentVideo } from '../moments/media';
import { fetchAttachment, type VideoItem } from './messages';

export function PeerVideo({ item, connection, onLongPress }: { item: VideoItem; connection?: ImConnection | null; onLongPress?: MessageLongPress }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uri, setUri] = useState('');
  const [error, setError] = useState('');
  async function view() {
    setOpen(true);
    if (uri || loading) return;
    if (!connection) {
      setError('聊天未连接，请稍后重试。');
      return;
    }
    setLoading(true);
    setError('');
    try {
      setUri(await fetchAttachment(connection, item.source));
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <Button label="观看视频" onLongPress={onLongPress} icon="videocam-outline" variant="soft" onPress={() => void view()} />
      {open && (
        <Sheet title="聊天视频" onClose={() => setOpen(false)}>
          {uri ? (
            <MomentVideo source={{ uri }} />
          ) : loading ? (
            <Text style={styles.muted}>正在下载视频…</Text>
          ) : (
            <Notice action="重试" onAction={() => void view()}>
              {error}
            </Notice>
          )}
        </Sheet>
      )}
    </>
  );
}
