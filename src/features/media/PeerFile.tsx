import { File, Paths } from 'expo-file-system';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import { useState } from 'react';
import { Platform, Share, Text } from 'react-native';
import { Button, ListRow, Notice, Sheet } from '../../components/ui';
import { errorMessage } from '../../services/api';
import type { ImConnection } from '../../services/im';
import { styles } from '../../theme';
import type { MessageLongPress } from '../chat/record-model';
import { fetchAttachment, type FileItem } from './messages';

export function fileDetails(item: FileItem) {
  const suffix = item.name.split('.').at(-1);
  return [suffix && suffix !== item.name ? suffix.toUpperCase() : '文件', item.bytes
    ? item.bytes < 1024 ? item.bytes + ' B' : item.bytes < 1048576
      ? (item.bytes / 1024).toFixed(1) + ' KB' : (item.bytes / 1048576).toFixed(1) + ' MB' : '大小未知'].join(' · ');
}

export function PeerFile({ item, connection, onLocate, onLongPress }: {
  item: FileItem; connection: ImConnection | null; onLocate?: () => void; onLongPress?: MessageLongPress;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  async function download() {
    setBusy(true); setNotice('');
    try {
      const name = item.name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120) || '聊天文件';
      if (Platform.OS === 'web' && item.sampleText !== undefined) {
        const url = URL.createObjectURL(new Blob([item.sampleText], { type: 'text/plain' }));
        const anchor = document.createElement('a');
        anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        return;
      }
      const source = item.sampleText !== undefined ? new File(Paths.cache, 'penlia-sample-note.txt') :
        connection && item.source ? new File(await fetchAttachment(connection, item.source)) : undefined;
      if (!source) throw new Error('附件暂不可用，请连接聊天服务后重试。');
      if (item.sampleText !== undefined) source.write(item.sampleText);
      if (Platform.OS === 'android') {
        const access = await StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!access.granted) return;
        const target = await StorageAccessFramework.createFileAsync(access.directoryUri, name,
          item.sampleText !== undefined ? 'text/plain' : 'application/octet-stream');
        try { await StorageAccessFramework.writeAsStringAsync(target, await source.base64(), { encoding: 'base64' }); }
        catch (failure) {
          await StorageAccessFramework.deleteAsync(target, { idempotent: true }).catch(() => {});
          throw failure;
        }
        setNotice('文件已保存。');
      } else {
        await Share.share({ url: source.uri, title: name });
      }
    } catch (failure) {
      setNotice(errorMessage(failure) || '文件已失效，无法打开。');
    } finally { setBusy(false); }
  }
  return <>
    <Button label={item.name} icon="document-outline" variant="soft" onPress={() => setOpen(true)} onLongPress={onLongPress} />
    {open && <Sheet title="聊天文件" onClose={() => { if (!busy) setOpen(false); }}>
      <ListRow title={item.name} detail={fileDetails(item)} />
      {item.sampleText !== undefined && <Text style={styles.body}>{item.sampleText}</Text>}
      {!!notice && <Notice>{notice}</Notice>}
      <Button label={busy ? '正在保存…' : '下载文件'} disabled={busy} onPress={() => void download()} />
      {onLocate && <Button label="定位原消息" variant="quiet" onPress={() => { setOpen(false); onLocate(); }} />}
    </Sheet>}
  </>;
}
