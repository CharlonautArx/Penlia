import { createServer } from 'node:http';
import { handle, HttpError } from './api.mjs';
import { momentVideoLimit } from './p0/moments.mjs';
import { profileCoverLimit } from './p0/profile-cover.mjs';

import { reportBodyLimit } from './p1/moderation.mjs';

const MAX_BODY_BYTES = 12000;

async function readBody(request, maxBytes = MAX_BODY_BYTES) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    bytes += chunk.length;
    if (bytes > maxBytes) {
      request.resume();
      throw new HttpError(413, '请求太大。');
    }
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new HttpError(400, '请求格式无效。');
  }
}

export function createApiServer(options = {}) {
  return createServer({ headersTimeout: 10000, requestTimeout: 30000, maxHeaderSize: 8192 }, async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    let url;
    try {
      if (!request.url?.startsWith('/') || request.url.startsWith('//')) throw new Error();
      url = new URL(request.url, 'http://localhost');
    } catch {
      response.writeHead(400).end();
      return;
    }
    const result = await handle({
      method: request.method,
      path: url.pathname,
      query: url.searchParams,
      headers: request.headers,
      sourceIp: request.socket.remoteAddress ?? 'unknown',
      readBody: () => {
        if (request.method === 'POST' && url.pathname === '/v1/friends/code'
          && !request.headers['transfer-encoding'] && Number(request.headers['content-length'] ?? 0) === 0) return {};
        if (request.method === 'POST' && (/^\/v1\/p1\/gatherings(?:\/[0-9a-f-]{36}\/details)?$/.test(url.pathname))) return readBody(request, 144 * 1024);
        if (request.method === 'PATCH' && url.pathname === '/v1/me') return readBody(request, 46000);
        if (request.method === 'POST' && url.pathname === '/v1/p1/reports') return readBody(request, reportBodyLimit);
        if (request.method === 'POST' && url.pathname === '/v1/chat-records') return readBody(request, 144 * 1024);
        if(request.method==='POST'&&url.pathname==='/v1/moment-media')
          return readBody(request,Math.ceil(momentVideoLimit/3)*4+132096);
        if(request.method==='POST'&&/^\/v1\/p2\/capsule-entries\/[0-9a-f-]{36}\/audio$/.test(url.pathname))
          return readBody(request,Math.ceil(2097152/3)*4+1024);
        if ((request.method === 'POST' && url.pathname === '/v1/groups') ||
            (request.method === 'PUT' && /^\/v1\/groups\/[a-f0-9-]{36}\/avatar$/.test(url.pathname)))
          return readBody(request, 32768 + 1024);
        if (request.method === 'PUT' && url.pathname === '/v1/me/profile-cover')
          return readBody(request, Math.ceil(profileCoverLimit / 3) * 4 + 1024);
        return readBody(request,MAX_BODY_BYTES);
      },
    }, options);
    if (response.destroyed) return;
    if (Buffer.isBuffer(result.binary)) {
      response.writeHead(result.statusCode, { 'Cache-Control':'private, no-store', ...result.headers }).end(result.binary);
      return;
    }
    response.writeHead(result.statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(result.statusCode === 413 ? { Connection: 'close' } : {}),
    }).end(JSON.stringify(result.body));
  });
}
