import { createServer } from 'node:http';
import { handle } from './api.mjs';

createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length <= 12000) chunks.push(chunk);
  }
  const result = await handle({
    rawPath: url.pathname,
    queryParameters: Object.fromEntries(url.searchParams),
    headers: request.headers,
    body: length > 12000 ? ' '.repeat(12001) : Buffer.concat(chunks).toString(),
    requestContext: { http: { method: request.method, sourceIp: request.socket.remoteAddress } },
  });
  response.writeHead(result.statusCode, result.headers).end(result.body);
}).listen(Number(process.env.PORT || 9000), process.env.HOST || '127.0.0.1');
