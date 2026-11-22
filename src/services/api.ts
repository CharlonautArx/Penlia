import { isUiDemo } from '../demo/mode';

export type User = { id: string; username: string; name: string; bio: string };
export type Relationship = {
  id: string;
  userId: string;
  username: string;
  name: string;
  bio: string;
  status: 'pending' | 'accepted';
  outgoing: boolean;
  chatReady: boolean;
  verificationMessage?: string | null;
};
export type Session = { token: string; user: User };

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export function apiOrigin() {
  if (isUiDemo) throw new Error('当前仅使用本机数据。');
  const base = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');
  // React Native's URL polyfill accepts several malformed strings.
  const validBase = base && /^https?:\/\/[^/?#@\s\\]+(?:\/[^?#\s\\]*)?$/.test(base);
  if (!validBase || (!base.startsWith('https://') && !__DEV__) || !new URL(base).hostname) {
    throw new Error('请配置朋聊服务地址。');
  }
  return base;
}

export async function api<T>(path: string, { token, method = 'GET', body }: {
  token?: string; method?: string; body?: Record<string, unknown>;
} = {}): Promise<T> {
  const base = apiOrigin();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  let response: Response;
  let result: { error?: unknown } | null;
  try {
    response = await fetch(base + '/v1' + path, {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    result = await response.json().catch(() => null);
    if (controller.signal.aborted) throw new Error('请求超时。');
  } catch {
    throw new Error('无法连接朋聊服务，请检查网络后重试。');
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    throw new ApiError(response.status, typeof result?.error === 'string' ? result.error : '朋聊服务暂时不可用。');
  }
  if (!result) throw new Error('朋聊服务返回了无效数据。');
  return result as T;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请重试。';
}
