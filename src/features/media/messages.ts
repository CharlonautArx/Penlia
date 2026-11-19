import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import type { ChatMessage } from 'react-native-chat-sdk';

import type { ImConnection } from '../../services/im';
import { nativePhotoUri } from '../space/media';
import { buildPeerMessage, easemobAttachmentUrl, type PendingMessage } from './protocol';
export * from './protocol';

function safeFile(candidate?: string) {
  if (!candidate || Platform.OS === 'web') return undefined;
  const path = candidate.replace(/^file:\/\//, '');
  if (!path.startsWith('/') || /%(?:2e|2f|5c)|[\\\u0000-\u001f]|(^|\/)\.\.?\//i.test(path)) return undefined;
  const document = Paths.document.uri.replace(/^file:\/\//, '').replace(/\/$/, '') + '/';
  const cache = Paths.cache.uri.replace(/^file:\/\//, '').replace(/\/$/, '') + '/';
  const storage = /^\/storage\/emulated\/\d+\/Android\/data\/app\.penlia\.mobile\/files\//.test(path);
  const library = Platform.OS === 'ios' && path.startsWith(document.replace(/Documents\/$/, 'Library/'));
  if (!path.startsWith(document) && !path.startsWith(cache) && !storage && !library) return undefined;
  try {
    const file = new File('file://' + path);
    return file.exists && file.size > 0 ? file.uri : undefined;
  } catch { return undefined; }
}

export function cachedAttachment(connection: ImConnection, message: ChatMessage | undefined, thumbnail = false) {
  if (!(message?.body instanceof connection.sdk.ChatImageMessageBody)) return undefined;
  const { localPath, thumbnailLocalPath } = message.body;
  return safeFile(localPath) ?? (thumbnail ? safeFile(thumbnailLocalPath) : undefined);
}

export class UnknownDelivery extends Error {}
export class SendRejected extends Error {
  constructor(readonly original: ChatMessage) { super('发送失败，可以重试。'); }
}

export async function deliverPeerMessage(connection: ImConnection, peer: string, value: PendingMessage,
  previous?: ChatMessage, onProgress?: (value: number) => void) {
  const { client } = connection;
  const message = previous ?? buildPeerMessage(connection, peer, value, value.kind === 'image' ? nativePhotoUri(value.photoId) : undefined);
  const submitted = message;
  return new Promise<ChatMessage>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new UnknownDelivery('暂未确认送达，请先查看会话，以免重复发送。')), value.kind === 'image' ? 50_000 : 20_000);
    const callbacks = {
      onSuccess: (confirmed: ChatMessage) => { clearTimeout(timeout); resolve(confirmed); },
      onError: () => { clearTimeout(timeout); reject(new SendRejected(submitted)); },
      onProgress: (_: string, progress: number) => onProgress?.(progress),
    };
    const transfer = previous ? client.chatManager.resendMessage(submitted, callbacks) : client.chatManager.sendMessage(submitted, callbacks);
    void transfer.catch(() => { clearTimeout(timeout); reject(new UnknownDelivery('暂未确认送达，请先查看会话。')); });
  });
}

export async function fetchAttachment(connection: ImConnection, message: ChatMessage) {
  const have = cachedAttachment(connection, message);
  if (have) return have;
  if (!(message.body instanceof connection.sdk.ChatImageMessageBody) || !easemobAttachmentUrl(message.body.remotePath)) {
    throw new Error('图片附件地址无法校验。');
  }
  return new Promise<string>((resolve, reject) => {
    const fail = () => { clearTimeout(timeout); reject(new Error('暂时无法下载图片，请检查网络后重试。')); };
    const timeout = setTimeout(fail, 30_000);
    void connection.client.chatManager.downloadAttachment(message, {
      onError: fail,
      onSuccess: (fresh) => {
        void Promise.resolve().then(async () => {
          const uri = cachedAttachment(connection, fresh)
            ?? cachedAttachment(connection, await connection.client.chatManager.getMessage(message.msgId));
          if (!uri) { fail(); return; }
          clearTimeout(timeout); resolve(uri);
        }).catch(fail);
      },
    }).catch(fail);
  });
}
