import { createServer } from 'node:http';
import { handle, HttpError } from './api.mjs';
import { pool } from './db.mjs';

const MAX_BODY_BYTES = 12000;

async function readBody(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) {
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

const server = createServer(async (request, response) => {
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
    readBody: () => readBody(request),
  });
  if (response.destroyed) return;
  response.writeHead(result.statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...(result.statusCode === 413 ? { Connection: 'close' } : {}),
  }).end(JSON.stringify(result.body));
});

const host = process.env.HOST ?? '0.0.0.0';
const port = Number(process.env.FC_CUSTOM_LISTEN_PORT ?? process.env.PORT ?? 9000);
server.listen(port, host, () => console.log(`Penlia API listening on ${host}:${server.address().port}`));

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => {
    server.close(async () => { await pool.end(); });
  });
}
