import type { ChatMessage } from 'react-native-chat-sdk';
import type { ImConnection, TextMessage } from '../../services/im';

export type LocationValue = { latitude: number; longitude: number; name: string; address: string };
export type ImageItem = { id: string; timestamp: number; mine: boolean; kind: 'image'; width: number; height: number;
  photoId?: string; source?: ChatMessage };
export type LocationItem = LocationValue & { id: string; timestamp: number; mine: boolean; kind: 'location' };
export type RichMessage = TextMessage | ImageItem | LocationItem;
export type PendingMessage =
  | { kind: 'text'; text: string }
  | { kind: 'image'; photoId: string; width: number; height: number; bytes: number }
  | ({ kind: 'location' } & LocationValue);

export function summaryOf(message: RichMessage) {
  if ('text' in message) return message.text;
  return message.kind === 'image' ? '[图片]' : '[位置] ' + message.name;
}

function decimal(value: unknown, max: number) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^-?\d+(\.\d+)?$/.test(value))) return;
  const number = Number(value);
  if (Number.isFinite(number) && Math.abs(number) <= max) return number;
}

export function locationValue(latitude: unknown, longitude: unknown, name: unknown, address: unknown): LocationValue | undefined {
  const lat = decimal(latitude, 90);
  const lon = decimal(longitude, 180);
  if (lat === undefined || lon === undefined) return;
  return {
    latitude: lat, longitude: lon,
    name: typeof name === 'string' ? name.trim().slice(0, 48) || '位置' : '位置',
    address: typeof address === 'string' ? address.trim().slice(0, 240) : '',
  };
}

export function readPeerMessage(connection: ImConnection, message: ChatMessage | undefined, own: string, peer: string): RichMessage | null {
  const { sdk } = connection;
  if (!message || message.chatType !== sdk.ChatMessageChatType.PeerChat) return null;
  const mine = message.from === own && message.to === peer;
  const fromPeer = message.from === peer && message.to === own;
  if ((!mine && !fromPeer) || (mine && message.status !== sdk.ChatMessageStatus.SUCCESS)) return null;
  const metadata = { id: message.msgId, timestamp: message.serverTime || message.localTime, mine };
  if (message.body instanceof sdk.ChatTextMessageBody) return { ...metadata, text: message.body.content };
  if (message.body instanceof sdk.ChatImageMessageBody) {
    const body = message.body;
    return { ...metadata, kind: 'image', width: body.width || 1, height: body.height || 1, source: message };
  }
  if (message.body instanceof sdk.ChatLocationMessageBody) {
    const body = message.body;
    const value = locationValue(body.latitude, body.longitude, message.attributes?.penlia_place_name, body.address);
    return value ? { ...metadata, ...value, kind: 'location' } : null;
  }
  return null;
}


export function buildPeerMessage(connection: ImConnection, peer: string, value: PendingMessage, photoUri?: string) {
  const { sdk } = connection;
  const peerType = sdk.ChatMessageChatType.PeerChat;
  if (value.kind === 'image') {
    if (!photoUri) throw new Error('这张本机照片已失效，请重新选择。');
    return sdk.ChatMessage.createImageMessage(peer, photoUri, peerType, {
      width: value.width, height: value.height, fileSize: value.bytes, displayName: 'photo.jpg', sendOriginalImage: true,
    });
  }
  if (value.kind === 'location') {
    const point = locationValue(value.latitude, value.longitude, value.name, value.address);
    if (!point) throw new Error('无效的地理位置。');
    const message = sdk.ChatMessage.createLocationMessage(peer, String(point.latitude), String(point.longitude), peerType, { address: point.address });
    message.attributes.penlia_place_name = point.name;
    return message;
  }
  return sdk.ChatMessage.createTextMessage(peer, value.text, peerType);
}

export function easemobAttachmentUrl(value: unknown) {
  if (typeof value !== 'string' || !/^https:\/\/[^/?#@\s\\]+\//i.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && ['easemob.com', 'hyphenate.com', 'easemob.com.cn'].some((domain) => url.hostname === domain || url.hostname.endsWith('.' + domain));
  } catch { return false; }
}
