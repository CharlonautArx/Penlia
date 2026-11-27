#!/usr/bin/env bash
# This unprivileged companion is installed only on disposable CI emulators.
set -eu
source_dir=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
sdk=${ANDROID_HOME:?Android SDK required}
platform=$(find "$sdk/platforms" -name android.jar | sort -V | tail -1)
build_tools=$(find "$sdk/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -1)
test -f "$platform"
mkdir "$work/classes" "$work/dex"
javac -source 8 -target 8 -bootclasspath "$platform" -d "$work/classes" "$source_dir/WindowProbe.java"
"$build_tools/d8" --release --min-api 24 --lib "$platform" --output "$work/dex" "$work/classes/app/penlia/pilot/probe/WindowProbe.class"
"$build_tools/aapt" package -f -M "$source_dir/AndroidManifest.xml" -I "$platform" -F "$work/base.apk"
(cd "$work/dex" && "$build_tools/aapt" add "$work/base.apk" classes.dex)
"$build_tools/zipalign" -f 4 "$work/base.apk" "$work/aligned.apk"
openssl rand -hex 20 > "$work/pass"
keytool -genkeypair -keystore "$work/probe.p12" -storetype PKCS12 -storepass:file "$work/pass" \
  -alias probe -keyalg RSA -keysize 2048 -validity 2 -dname "CN=Ephemeral Emulator Test"
"$build_tools/apksigner" sign --ks "$work/probe.p12" --ks-pass "file:$work/pass" --out "$1" "$work/aligned.apk"
"$build_tools/apksigner" verify "$1"
