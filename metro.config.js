const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const fixturePaths = new Set(['data', 'places', 'visuals', 'space', 'pets', 'phone', 'calls', 'life', 'life-fixtures', 'life-assets'].map((name) => path.join(__dirname, 'src', 'demo', name)));
const disabledFixtures = path.join(__dirname, 'src', 'demo', 'inactive.ts');

const appSource = path.join(__dirname, 'src') + path.sep;
const typography = path.join(appSource, 'components', 'native-typography.ts');
const nativeText = path.join(appSource, 'components', 'Typography.tsx');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const origin = context.originModulePath;
  if (moduleName === 'react-native' && origin.startsWith(appSource) && origin !== typography && origin !== nativeText)
    return context.resolveRequest(context, typography, platform);
  if (process.env.EXPO_PUBLIC_PENLIA_UI_DEMO !== '1' && moduleName.startsWith('.')) {
    const localPath = path.resolve(path.dirname(origin), moduleName).replace(/\.[cm]?[jt]sx?$/, '');
    if (fixturePaths.has(localPath)) return context.resolveRequest(context, disabledFixtures, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
