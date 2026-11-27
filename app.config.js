const { light } = require('./src/palette.json');
const { validatePublicConfig } = require('./tooling/public-config.cjs');

module.exports = ({ config: base }) => {
  validatePublicConfig(process.env);
  const config = { ...base, backgroundColor: light.backdrop, plugins: [...base.plugins,
    ['expo-media-library', { photosPermission: false, savePhotosPermission: '允许朋聊将二维码图片保存到相册。', granularPermissions: [] }],
  ] };
  if (process.env.EXPO_PUBLIC_PENLIA_UI_DEMO !== '1') {
    return { ...config, plugins: [...config.plugins, ['expo-camera', {
      cameraPermission: '允许朋聊扫描好友或群邀请二维码。', microphonePermission: false, recordAudioAndroid: false,
    }]] };
  }
  if (process.env.EAS_BUILD_PROFILE && process.env.EAS_BUILD_PROFILE !== 'ui-demo') {
    throw new Error('Use the ui-demo build profile for the UI demo.');
  }
  const cameraPermission = '允许你在视频通话中开启本机预览。';
  const microphonePermission = '允许你检查本机麦克风权限。';
  const plugins = config.plugins.map((plugin) => {
    if (!Array.isArray(plugin) || plugin[0] !== 'expo-image-picker') return plugin;
    // Setting either permission to false blocks the same permission for expo-camera.
    return [plugin[0], { ...plugin[1], cameraPermission, microphonePermission }];
  });
  const liquidGlass = process.env.EXPO_PUBLIC_PENLIA_LIQUID_GLASS === '1';
  const packageId = liquidGlass ? 'app.penlia.mobile.liquidglass' : 'app.penlia.mobile.preview';
  return {
    ...config,
    name: liquidGlass ? '朋聊 · Liquid Glass 体验版' : config.name,
    version: '0.1.11',
    scheme: liquidGlass ? 'penlia-liquid' : 'penlia-preview',
    platforms: ['android', 'ios', 'web'],
    plugins: [...plugins, './plugins/with-penlia-call-pip', ['expo-camera', { cameraPermission, microphonePermission, barcodeScannerEnabled: true }]],
    android: { ...config.android, package: packageId, versionCode: 23, ...(liquidGlass && { allowBackup: false }) },
    ios: { ...config.ios, bundleIdentifier: packageId },
  };
};
