import { createServer } from 'node:http';
import { handle, HttpError } from './api.mjs';
import { mediaLimit } from './p0/moments.mjs';

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

export function createApiServer({ phoneAuth } = {}) {
  return createServer(async (request, response) => {
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
      readBody: () => readBody(request, request.method === 'POST' && url.pathname === '/v1/moment-media'
        ? Math.ceil(mediaLimit / 3) * 4 + 1024 : MAX_BODY_BYTES),
    }, { phoneAuth });
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
