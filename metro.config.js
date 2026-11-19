const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const fixturePaths = new Set(['data', 'places', 'visuals', 'space', 'pets', 'phone'].map((name) => path.join(__dirname, 'src', 'demo', name)));
const disabledFixtures = path.join(__dirname, 'src', 'demo', 'inactive.ts');

if (process.env.EXPO_PUBLIC_PENLIA_UI_DEMO !== '1') {
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName.startsWith('.')) {
      const localPath = path.resolve(path.dirname(context.originModulePath), moduleName).replace(/\.[cm]?[jt]sx?$/, '');
      if (fixturePaths.has(localPath)) return context.resolveRequest(context, disabledFixtures, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  };
}

module.exports = config;
