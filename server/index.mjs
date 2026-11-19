import { createApiServer } from './http.mjs';
import { pool } from './db.mjs';

// A reviewed CAPTCHA and SMS adapter are required before enabling phone routes.
const server = createApiServer();
const host = process.env.HOST ?? '0.0.0.0';
const port = Number(process.env.FC_CUSTOM_LISTEN_PORT ?? process.env.PORT ?? 9000);
server.listen(port, host, () => console.log(`Penlia API listening on ${host}:${server.address().port}`));

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => {
    server.close(async () => { await pool.end(); });
  });
}
