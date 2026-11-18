import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import type { ChatConnectEventListener, ChatMessage, ChatMessageEventListener } from 'react-native-chat-sdk';

import { errorMessage } from './api';
import { useSession } from './session';

type Sdk = typeof import('react-native-chat-sdk');
type Client = ReturnType<Sdk['ChatClient']['getInstance']>;
export type ImConnection = { sdk: Sdk; client: Client };
export type TextMessage = { id: string; mine: boolean; text: string; timestamp: number };

export function imUserId(id: string) {
  return 'penlia_' + id.replaceAll('-', '');
}

export function textMessage(connection: ImConnection, message: ChatMessage | undefined, ownId: string): TextMessage | null {
  if (!message || message.chatType !== connection.sdk.ChatMessageChatType.PeerChat ||
      !(message.body instanceof connection.sdk.ChatTextMessageBody)) return null;
  const mine = message.from === ownId;
  if (!mine && message.to !== ownId) return null;
  if (mine && message.status !== connection.sdk.ChatMessageStatus.SUCCESS) return null;
  return { id: message.msgId, text: message.body.content, mine, timestamp: message.serverTime || message.localTime };
}

let initialized: Promise<ImConnection> | undefined;
let transitions = Promise.resolve();

function initialize() {
  initialized ??= (async () => {
    const appKey = process.env.EXPO_PUBLIC_EASEMOB_APP_KEY;
    if (!appKey) throw new Error('请配置环信 App Key。');
    try {
      const sdk = await import('react-native-chat-sdk');
      const client = sdk.ChatClient.getInstance();
      await client.init(sdk.ChatOptions.withAppKey({
        appKey,
        debugModel: false,
        usingHttpsOnly: true,
        acceptInvitationAlways: false,
        autoAcceptGroupInvitation: false,
      }));
      return { sdk, client };
    } catch {
      throw new Error('无法初始化环信。请检查 App Key，并确认已安装朋聊开发构建。');
    }
  })().catch((error) => {
    initialized = undefined;
    throw error;
  });
  return initialized;
}

function enqueue(action: () => Promise<void>) {
  const next = transitions.then(action);
  transitions = next.catch(() => {});
  return next;
}

const ImContext = createContext<{
  connection: ImConnection | null;
  online: boolean;
  status: string;
  revision: number;
  retry: () => void;
  changed: () => void;
} | null>(null);

export function ImProvider({ children }: { children: ReactNode }) {
  const { session, request } = useSession();
  const [connection, setConnection] = useState<ImConnection | null>(null);
  const [online, setOnline] = useState(false);
  const [status, setStatus] = useState('正在连接环信…');
  const [attempt, setAttempt] = useState(0);
  const [revision, setRevision] = useState(0);
  const changed = useCallback(() => setRevision((value) => value + 1), []);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const ownId = session?.user.id;

  useEffect(() => {
    if (!ownId) return;
    let active = true;
    let current: ImConnection | undefined;
    let renewalPending = false;
    const ownUsername = imUserId(ownId);
    setConnection(null);
    setOnline(false);
    setStatus('正在连接环信…');

    async function credentials() {
      const result = await request<{ username: string; token: string }>('/im/token', { method: 'POST' });
      if (result.username !== ownUsername) throw new Error('聊天账号配置错误。');
      return result.token;
    }

    const renew = (expired: boolean) => {
      if (renewalPending || !active) return;
      if (expired) setOnline(false);
      renewalPending = true;
      void enqueue(async () => {
        if (!current || !active) return;
        const token = await credentials();
        if (!active) return;
        if (expired) {
          if (await current.client.getCurrentUsername()) await current.client.logout();
          await current.client.loginWithToken(ownUsername, token);
          if (active) listeners.onConnected?.();
        } else {
          await current.client.renewToken(token);
        }
      }).catch(() => {
        if (active) setStatus('聊天登录更新失败，请重试。');
      }).finally(() => { renewalPending = false; });
    };

    const listeners: ChatConnectEventListener = {
      onConnected() {
        if (!active) return;
        setOnline(true);
        setStatus('');
        changed();
      },
      onDisconnected() {
        if (!active) return;
        setOnline(false);
        setStatus('聊天连接已断开，正在等待重连。');
      },
      onTokenWillExpire: () => renew(false),
      onTokenDidExpire: () => renew(true),
      onOfflineMessageSyncFinish: () => { if (active) changed(); },
    };
    const messages: ChatMessageEventListener = {
      onMessagesReceived: () => { if (active) changed(); },
      onConversationsUpdate: () => { if (active) changed(); },
    };

    void enqueue(async () => {
      if (!active) return;
      current = await initialize();
      if (!active) return;
      const token = await credentials();
      if (!active) return;
      const { client } = current;
      if (await client.getCurrentUsername()) await client.logout();
      if (!active) return;
      client.addConnectionListener(listeners);
      client.chatManager.addMessageListener(messages);
      await client.loginWithToken(ownUsername, token);
      if (active) {
        setConnection(current);
        if (await client.isConnected()) listeners.onConnected?.();
      }
    }).catch((error) => {
      if (active) setStatus(error instanceof Error ? errorMessage(error) : '无法登录环信，请重试。');
    });

    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active' && active) changed();
    });
    return () => {
      active = false;
      foreground.remove();
      void enqueue(async () => {
        if (!current) return;
        current.client.removeConnectionListener(listeners);
        current.client.chatManager.removeMessageListener(messages);
        if (await current.client.getCurrentUsername() === ownUsername) await current.client.logout();
      }).catch(() => {});
    };
  }, [attempt, changed, ownId, request]);

  return <ImContext.Provider value={{ connection, online, status, revision, retry, changed }}>
    {children}
  </ImContext.Provider>;
}

export function useIm() {
  const context = useContext(ImContext);
  if (!context) throw new Error('ImProvider is required');
  return context;
}
