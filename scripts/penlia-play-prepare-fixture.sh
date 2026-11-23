#!/usr/bin/env bash
set -euo pipefail
base="$1"
work=$(mktemp -d)

# Paint the diagnostic only in this disposable checkout. The lower strip keeps the native blur off as a control.
python3 - <<'PY'
from pathlib import Path
p = Path('src/features/play/DiscoveryEntrance.tsx')
s = p.read_text()
backdrop = '<View style={local.backdropPaint} />'
blur = 'style={StyleSheet.absoluteFill} />}'
assert s.count(backdrop) == 1
assert s.count(blur) == 1
s = s.replace(backdrop, """<View style={local.backdropPaint}>
        <View style={{ position: 'absolute', top: 0, bottom: 0, left: '64%', width: 8, backgroundColor: '#000000' }} />
      </View>""")
p.write_text(s.replace(blur, 'style={[StyleSheet.absoluteFill, { bottom: 27 }]} />}'))
PY
npx expo export:embed --entry-file node_modules/expo-router/entry.js --platform android --dev false --bundle-output "$work/index.js" --assets-dest "$work/assets" --reset-cache
hermes=$(node -p 'require.resolve("hermes-compiler/package.json", { paths: [require.resolve("react-native/package.json")] })')
"${hermes%/package.json}/hermesc/linux64-bin/hermesc" -emit-binary -O -out "$work/index.android.bundle" "$work/index.js"
python3 - "$base" "$work" <<'PY'
import sys
from pathlib import Path
from zipfile import ZipFile

work = Path(sys.argv[2])
bundle = (work / 'index.android.bundle').read_bytes()
with ZipFile(sys.argv[1]) as old, ZipFile(work / 'unsigned.apk', 'w') as apk:
    assert old.read('assets/index.android.bundle')[:12] == bundle[:12]
    for info in old.infolist():
        name = info.filename
        if name.startswith('META-INF/') and name.upper().endswith(('.SF', '.RSA', '.DSA', '.EC', '/MANIFEST.MF')):
            continue
        apk.writestr(info, bundle if name == 'assets/index.android.bundle' else old.read(info))
PY
buildtools="$ANDROID_HOME/build-tools/37.0.0"
"$buildtools/zipalign" -f -P 16 4 "$work/unsigned.apk" "$work/aligned.apk"
keytool -genkeypair -keystore "$work/debug.keystore" -storepass android -keypass android -alias androiddebugkey -dname 'CN=Android Debug,O=Android,C=US' -keyalg RSA -keysize 2048 -validity 10000
"$buildtools/apksigner" sign --ks "$work/debug.keystore" --ks-pass pass:android --key-pass pass:android --out "$2" "$work/aligned.apk"
"$buildtools/apksigner" verify "$2"
