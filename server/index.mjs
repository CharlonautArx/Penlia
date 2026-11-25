import { validateServerEnvironment } from './security.mjs';

const mode = validateServerEnvironment();
const { pool, assertProductionDatabase } = await import('./db.mjs');
const { createApiServer } = await import('./http.mjs');
if (mode === 'production') {
  try { await assertProductionDatabase(); }
  catch {
    await pool.end();
    throw new Error('Production database readiness failed: isolation, TLS or runtime role');
  }
}

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
