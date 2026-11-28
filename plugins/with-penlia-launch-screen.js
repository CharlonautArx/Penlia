const fs = require('node:fs/promises');
const path = require('node:path');
const { withAndroidStyles, withDangerousMod, withMainActivity } = require('expo/config-plugins');
const { mergeContents, removeContents } = require('@expo/config-plugins/build/utils/generateCode');

function editMainActivity(source) {
  const noExpoHold = removeContents({ src: source, tag: 'expo-splashscreen' }).contents
    .replace(/^import expo\.modules\.splashscreen\.SplashScreenManager\n/m, '');
  const merge = (src, tag, anchor, offset, newSrc) =>
    mergeContents({ src, tag, anchor, offset, newSrc, comment: '  //' }).contents;
  const withLifecycle = merge(noExpoHold, 'penlia-launch-lifecycle', /^  override fun onCreate\(/, 0,
    [
      '  private var launchScreen: PenliaLaunchScreen? = null',
      '',
      '  override fun onDestroy() {',
      '    launchScreen?.dispose()',
      '    super.onDestroy()',
      '  }',
      '',
    ].join('\n'));
  const withPrepare = merge(withLifecycle, 'penlia-launch-prepare', /super\.onCreate\(null\)/, 0,
    '    launchScreen = PenliaLaunchScreen(this).also { it.prepare() }');
  return merge(withPrepare, 'penlia-launch-show', /super\.onCreate\(null\)/, 1,
    '    launchScreen?.show()');
}

function updateLaunchTheme(styles) {
  const splash = styles.resources.style.find((entry) => entry.$.name === 'Theme.App.SplashScreen');
  if (!splash) throw new Error('The Expo Android splash theme is missing.');
  const values = {
    'android:statusBarColor': '@android:color/transparent',
    'android:navigationBarColor': '@android:color/transparent',
    'android:windowLightStatusBar': 'true',
    'android:windowLightNavigationBar': 'true',
  };
  const overridden = new Set([...Object.keys(values), 'android:windowSplashScreenBehavior']);
  splash.item = [
    ...splash.item.filter((item) => !overridden.has(item.$.name)),
    ...Object.entries(values).map(([name, value]) => ({ $: { name }, _: value })),
  ];
  return styles;
}

module.exports = (config, { source }) => {
  config = withMainActivity(config, (mod) => {
    if (mod.modResults.language !== 'kt') throw new Error('The launch screen requires a Kotlin MainActivity.');
    mod.modResults.contents = editMainActivity(mod.modResults.contents);
    return mod;
  });
  config = withAndroidStyles(config, (mod) => {
    mod.modResults = updateLaunchTheme(mod.modResults);
    return mod;
  });
  return withDangerousMod(config, ['android', async (mod) => {
    const appPackage = mod.android?.package;
    if (!appPackage) throw new Error('An Android package is required.');
    const root = path.join(mod.modRequest.platformProjectRoot, 'app/src/main');
    const raw = path.join(root, 'res/raw');
    const java = path.join(root, 'java', ...appPackage.split('.'));
    const kotlin = await fs.readFile(path.join(__dirname, 'penlia-launch/PenliaLaunchScreen.kt'), 'utf8');
    await Promise.all([fs.mkdir(raw, { recursive: true }), fs.mkdir(java, { recursive: true })]);
    const launchArt = `penlia_launch_art${path.extname(source).toLowerCase()}`;
    // A non-clean prebuild may still have the previous PNG resource with the same Android ID.
    if (launchArt !== 'penlia_launch_art.png') {
      await fs.rm(path.join(raw, 'penlia_launch_art.png'), { force: true });
    }
    await Promise.all([
      fs.copyFile(path.resolve(mod.modRequest.projectRoot, source), path.join(raw, launchArt)),
      fs.writeFile(path.join(java, 'PenliaLaunchScreen.kt'), kotlin.replace('__APP_PACKAGE__', appPackage)),
    ]);
    return mod;
  }]);
};
