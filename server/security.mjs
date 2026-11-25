import { isIP } from 'node:net';

const databaseNames = {
  development: /_(?:dev|development)$/,
  test: /_test$/,
  preview: /_(?:preview|staging)$/,
  production: /_(?:prod|production)$/,
};

function invalid(name) {
  throw new Error('Invalid server configuration: ' + name);
}

function requireSecret(env, name, minimum = 32) {
  const value = env[name];
  if (!value || value.length < minimum || /^(?:<|example|replace|changeme|placeholder)/i.test(value))
    invalid(name);
  return value;
}

export function easemobOrigin(env) {
  let url;
  try { url = new URL(env.EASEMOB_REST_URL); }
  catch { invalid('EASEMOB_REST_URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' ||
    url.search || url.hash) invalid('EASEMOB_REST_URL');
  return url;
}

export function easemobTtlUnit(env) {
  if (!env.EASEMOB_TTL_UNIT || env.EASEMOB_TTL_UNIT === 'seconds') return 1;
  if (env.EASEMOB_TTL_UNIT === 'milliseconds') return 1000;
  return invalid('EASEMOB_TTL_UNIT');
}

export function validateServerEnvironment(env = process.env) {
  const mode = env.PENLIA_ENV ?? (env.NODE_ENV === 'production' ? '' : 'development');
  if (!Object.hasOwn(databaseNames, mode)) invalid('PENLIA_ENV');
  if (env.PENLIA_ENV && !databaseNames[mode].test(env.PGDATABASE ?? '')) invalid('PGDATABASE');
  if (mode !== 'production') {
    if (/_(?:prod|production)$/.test(env.PGDATABASE ?? '')) invalid('PGDATABASE');
    return mode;
  }

  const host = env.PGHOST ?? '';
  if (!host || isIP(host) || !host.includes('.') || /(?:^|\.)(?:localhost|localdomain)$/i.test(host))
    invalid('PGHOST');
  if (env.PG_TLS === 'disable' || env.PGSSLMODE === 'disable') invalid('PostgreSQL TLS');
  if (env.PGUSER !== 'penlia_app') invalid('PGUSER');
  requireSecret(env, 'PGPASSWORD', 20);

  const controls = ['PENLIA_DIAGNOSTIC_TOKEN', 'PENLIA_MODERATION_JOB_TOKEN', 'PENLIA_LIFE_JOB_TOKEN'];
  const ready = env.PENLIA_IM_PRIVACY_READY === '1';
  if (env.PENLIA_IM_RECALL_READY === '1' && !ready) invalid('PENLIA_IM_PRIVACY_READY');
  if (ready) {
    easemobOrigin(env);
    easemobTtlUnit(env);
    if (!env.EASEMOB_APP_KEY || !env.EASEMOB_CLIENT_ID) invalid('Easemob application');
    requireSecret(env, 'EASEMOB_CLIENT_SECRET', 20);
    requireSecret(env, 'PENLIA_IM_CALLBACK_SECRET', 24);
    controls.push('PENLIA_IM_CALLBACK_PATH_KEY');
    if (!/^[A-Za-z0-9_-]{32,96}$/.test(env.PENLIA_IM_CALLBACK_PATH_KEY ?? ''))
      invalid('PENLIA_IM_CALLBACK_PATH_KEY');
  }
  const enabledSecrets = controls.filter((name) => env[name]).map((name) => requireSecret(env, name));
  if (new Set(enabledSecrets).size !== enabledSecrets.length) invalid('operational credentials must be distinct');
  return mode;
}

export function imPrivacyReady(env = process.env) {
  return env.PENLIA_IM_PRIVACY_READY === '1' && !!env.PENLIA_IM_CALLBACK_SECRET &&
    /^[A-Za-z0-9_-]{32,96}$/.test(env.PENLIA_IM_CALLBACK_PATH_KEY ?? '');
}
