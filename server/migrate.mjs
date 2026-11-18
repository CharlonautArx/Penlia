import { readdir, readFile } from 'node:fs/promises';
import { pool } from './db.mjs';

const directory = new URL('./migrations/', import.meta.url);
try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(182129779)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY)');
    const applied = await client.query('SELECT name FROM schema_migrations');
    const names = new Set(applied.rows.map(({ name }) => name));
    const files = (await readdir(directory)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
    for (const name of files) {
      if (names.has(name)) continue;
      await client.query(await readFile(new URL(name, directory), 'utf8'));
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      console.log('Applied', name);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
} catch (error) {
  console.error('Migration failed:', error.code || error.name);
  process.exitCode = 1;
} finally {
  await pool.end();
}
