const publicKeys = new Set([
  'EXPO_PUBLIC_API_URL',
  'EXPO_PUBLIC_EASEMOB_APP_KEY',
  'EXPO_PUBLIC_PENLIA_UI_DEMO',
]);

function validatePublicConfig(env) {
  for (const key of Object.keys(env)) {
    if (key.startsWith('EXPO_PUBLIC_') && !publicKeys.has(key))
      throw new Error('Unapproved public build variable: ' + key);
  }
  const stage = env.EAS_BUILD_PROFILE;
  const api = env.EXPO_PUBLIC_API_URL?.trim();
  if (api) {
    let url;
    try { url = new URL(api); }
    catch { throw new Error('Invalid EXPO_PUBLIC_API_URL'); }
    const insecureDevelopment = stage !== 'production' && stage !== 'preview' && url.protocol === 'http:';
    if ((!insecureDevelopment && url.protocol !== 'https:') || url.username || url.password ||
      url.search || url.hash || /\s/.test(api)) throw new Error('Invalid EXPO_PUBLIC_API_URL');
  }
  const appKey = env.EXPO_PUBLIC_EASEMOB_APP_KEY;
  if (appKey && !/^[A-Za-z0-9_-]{1,64}#[A-Za-z0-9_-]{1,64}$/.test(appKey))
    throw new Error('EXPO_PUBLIC_EASEMOB_APP_KEY must be an organization#application identifier');
  if (stage === 'production' && (!api || !appKey || env.EXPO_PUBLIC_PENLIA_UI_DEMO !== '0'))
    throw new Error('Production build requires the approved API, IM application, and online profile');
}

module.exports = { validatePublicConfig };
