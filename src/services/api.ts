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
};
export type Session = { token: string; user: User };

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, { token, method = 'GET', body }: {
  token?: string; method?: string; body?: Record<string, string>;
} = {}): Promise<T> {
  const base = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '');
  if (!base || (!base.startsWith('https://') && !(__DEV__ && base.startsWith('http://')))) {
    throw new Error('请配置朋聊服务地址。');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  const response = await fetch(base + '/v1' + path, {
    method,
    signal: controller.signal,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => { throw new Error('无法连接朋聊服务，请检查网络后重试。'); }).finally(() => clearTimeout(timeout));
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, result?.error || '朋聊服务暂时不可用。');
  if (!result) throw new Error('朋聊服务返回了无效数据。');
  return result as T;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请重试。';
}
