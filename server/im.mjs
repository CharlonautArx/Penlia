import { easemobOrigin, easemobTtlUnit } from './security.mjs';

export const userTokenTtlSeconds = 900;
let appToken;
let pendingToken;

function serviceUrl(path) {
  const [organization, app, extra] = (process.env.EASEMOB_APP_KEY ?? '').split('#');
  if (!organization || !app || extra !== undefined || !process.env.EASEMOB_REST_URL) {
    throw new Error('Missing IM configuration');
  }
  const origin = easemobOrigin(process.env);
  return new URL('/' + [organization, app, ...path].map(encodeURIComponent).join('/'), origin);
}

async function request(path, { token, body, method = 'POST' } = {}) {
  const response = await fetch(serviceUrl(path), {
    method,
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
    headers: { Accept: 'application/json', 'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    await response.body?.cancel();
    const error = new Error('IM request failed');
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function getAppToken(refresh = false) {
  if (!refresh && appToken?.validUntil > Date.now()) return appToken.value;
  if (!pendingToken) {
    pendingToken = (async () => {
      const clientId = process.env.EASEMOB_CLIENT_ID;
      const clientSecret = process.env.EASEMOB_CLIENT_SECRET;
      if (!clientId || !clientSecret) throw new Error('Missing IM credentials');
      const data = await request(['token'], { body: {
        grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret,
      } });
      if (!data.access_token) throw new Error('Missing IM App Token');
      appToken = { value: data.access_token, validUntil: Date.now() + Math.max(0, data.expires_in - 60) * 1000 };
      return appToken.value;
    })().finally(() => { pendingToken = undefined; });
  }
  return pendingToken;
}

export async function checkEasemob() {
  await getAppToken(true);
  return true;
}

async function authorized(path, options) {
  const token = await getAppToken();
  try {
    return await request(path, { ...options, token });
  } catch (error) {
    if (error.status !== 401) throw error;
    if (appToken?.value === token) appToken = undefined;
    return request(path, { ...options, token: await getAppToken() });
  }
}

export function imUserId(id) {
  return 'penlia_' + id.replaceAll('-', '');
}

export async function userToken(id) {
  const username = imUserId(id);
  const unit = easemobTtlUnit(process.env);
  const body = { grant_type: 'inherit', username, autoCreateUser: true, ttl: userTokenTtlSeconds * unit };
  let data;
  try {
    data = await authorized(['token'], { body });
  } catch (error) {
    if (error.status !== 409) throw error;
    data = await authorized(['token'], { body: { ...body, autoCreateUser: false } });
  }
  const lifetime = Number(data.expires_in);
  if (typeof data.access_token !== 'string' || !data.access_token || data.access_token.length > 8192 ||
    !Number.isSafeInteger(lifetime) || lifetime < 1 || lifetime > userTokenTtlSeconds * unit)
    throw new Error('Invalid IM User Token response');
  return { username, token: data.access_token, expiresIn: Math.ceil(lifetime / unit) };
}

export async function syncFriends(first, second) {
  await Promise.all([userToken(first), userToken(second)]);
  const path = ['users', imUserId(first), 'contacts', 'users', imUserId(second)];
  try {
    // The REST operation creates the contact in both directions.
    await authorized(path);
  } catch (error) {
    if (error.status !== 400 && error.status !== 409) throw error;
    const contacts = await authorized(path.slice(0, -1), { method: 'GET' });
    if (!Array.isArray(contacts.data) || !contacts.data.includes(imUserId(second))) throw error;
  }
}

export async function recallDirectMessage(sender, peer, messageId) {
  const from = imUserId(sender);
  const to = imUserId(peer);
  const response = await authorized(['messages', 'msg_recall'], { body: {
    msg_id: messageId, from, to, chat_type: 'chat', force: false, sync_device: true,
  } });
  return response.data?.recalled === 'yes' && response.data.msg_id === messageId
    && response.data.from === from && response.data.to === to;
}
