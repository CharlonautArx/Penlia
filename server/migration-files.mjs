import { readdir, readFile } from 'node:fs/promises';

const directory = new URL('./migrations/', import.meta.url);

export async function readMigrations() {
  const names = (await readdir(directory)).filter((name) => /^\d+_[a-z0-9_]+\.sql$/.test(name)).sort();
  return Promise.all(names.map(async (name) => ({
    name,
    sql: await readFile(new URL(name, directory), 'utf8'),
  })));
}
