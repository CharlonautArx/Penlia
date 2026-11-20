const fs = require('node:fs/promises');
const path = require('node:path');
const { AndroidConfig, withAndroidColors, withAndroidColorsNight, withDangerousMod } = require('expo/config-plugins');
const palettes = require('../src/palette.json');

const apply = (mod, palette) =>
  mod((config) => {
    for (const [key, value] of Object.entries(palette)) {
      config.modResults = AndroidConfig.Colors.assignColorValue(config.modResults, { name: 'penlia_' + key, value });
    }
    return config;
  });

module.exports = (config) => {
  config = apply((action) => withAndroidColors(config, action), palettes.light);
  config = apply((action) => withAndroidColorsNight(config, action), palettes.dark);
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const raw = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/res/raw');
      await fs.mkdir(raw, { recursive: true });
      await fs.writeFile(
        path.join(raw, 'penlia_colors_keep.xml'),
        '<resources xmlns:tools="http://schemas.android.com/tools" tools:keep="@color/penlia_*" />\n',
      );
      return mod;
    },
  ]);
};
