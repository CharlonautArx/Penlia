#!/usr/bin/env bash
set -euo pipefail
a=$(find originals -type f -name 'a.apk' -print -quit)
b=$(find originals -type f -name 'b.apk' -print -quit)
test -n "$a"
test -n "$b"
mkdir -p output
status=0
if bash scripts/android-startup-smoke.sh "$a" output/a; then
  echo 'Baseline A unexpectedly passed the startup checks.'
  status=1
else
  echo 'Baseline A failed its startup checks. Target crash evidence follows.'
  rg -n 'NoClassDefFoundError.*ExtSdkDispatch|JNI DETECTED ERROR|Fatal signal|AndroidRuntime.*FATAL' output/a/logcat.txt | tail -30 || true
fi
if bash scripts/android-startup-smoke.sh "$b" output/b; then
  echo 'Baseline B with only R8 disabled completed startup.'
else
  echo 'Baseline B failed. Review its separately captured Android log.'
  status=1
fi
exit "$status"
