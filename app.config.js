module.exports = ({ config }) => {
  if (process.env.EXPO_PUBLIC_PENLIA_UI_DEMO !== '1') return config;
  if (process.env.EAS_BUILD_PROFILE && process.env.EAS_BUILD_PROFILE !== 'ui-demo') {
    throw new Error('Use the ui-demo build profile for the UI demo.');
  }
  return {
    ...config,
    name: '朋聊演示',
    scheme: 'penlia-preview',
    platforms: ['android', 'ios', 'web'],
    android: { ...config.android, package: 'app.penlia.mobile.preview' },
    ios: { ...config.ios, bundleIdentifier: 'app.penlia.mobile.preview' },
  };
};
