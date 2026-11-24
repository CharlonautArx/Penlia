const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

module.exports = (config) => withAndroidManifest(config, (mod) => {
  const activity = AndroidConfig.Manifest.getMainActivityOrThrow(mod.modResults);
  activity.$['android:supportsPictureInPicture'] = 'true';
  return mod;
});
