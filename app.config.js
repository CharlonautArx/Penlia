module.exports = ({ config }) => {
  if (process.env.EXPO_PUBLIC_PENLIA_UI_DEMO !== '1') return config;
  if (process.env.EAS_BUILD_PROFILE && process.env.EAS_BUILD_PROFILE !== 'ui-demo') {
    throw new Error('Use the ui-demo build profile for the UI demo.');
  }
  const cameraPermission = '允许你在视频通话演示中开启本机预览。';
  const microphonePermission = '允许你在通话演示中检查麦克风权限。';
  const plugins = config.plugins.map((plugin) => {
    if (!Array.isArray(plugin) || plugin[0] !== 'expo-image-picker') return plugin;
    // Setting either permission to false blocks the same permission for expo-camera.
    return [plugin[0], { ...plugin[1], cameraPermission, microphonePermission }];
  });
  return {
    ...config,
    name: '朋聊演示',
    scheme: 'penlia-preview',
    platforms: ['android', 'ios', 'web'],
    plugins: [...plugins, ['expo-camera', { cameraPermission, microphonePermission, barcodeScannerEnabled: false }]],
    android: { ...config.android, package: 'app.penlia.mobile.preview' },
    ios: { ...config.ios, bundleIdentifier: 'app.penlia.mobile.preview' },
  };
};
