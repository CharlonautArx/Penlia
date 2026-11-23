#!/usr/bin/env bash
set -euo pipefail
base="$1"
work=$(mktemp -d)

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
    for label in ['生活边界保护计划', '想去的地点']:
        assert label.encode('utf-16le') in bundle, label
    assert '想去的地方'.encode('utf-16le') not in bundle
    for info in old.infolist():
        name = info.filename
        if name.startswith('META-INF/') and name.upper().endswith(('.SF', '.RSA', '.DSA', '.EC', '/MANIFEST.MF')):
            continue
        apk.writestr(info, bundle if name == 'assets/index.android.bundle' else old.read(info))
PY
buildtools="$ANDROID_HOME/build-tools/37.0.0"
"$buildtools/zipalign" -f -P 16 4 "$work/unsigned.apk" "$work/aligned.apk"
test -f android/app/debug.keystore
"$buildtools/apksigner" sign --ks android/app/debug.keystore --ks-pass pass:android --key-pass pass:android --out "$2" "$work/aligned.apk"
"$buildtools/apksigner" verify "$2"
