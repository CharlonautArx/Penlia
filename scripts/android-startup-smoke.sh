#!/usr/bin/env bash
set -euo pipefail

apk=$(realpath "$1")
results=$(realpath -m "$2")
package=app.penlia.mobile.preview
mkdir -p "$results"

adb install -r "$apk" > "$results/install.txt"
adb shell pm clear "$package" > "$results/clear.txt"
adb logcat -c
adb logcat -b all -v threadtime > "$results/logcat.txt" &
logcat_pid=$!
trap 'kill "$logcat_pid" 2>/dev/null || true' EXIT

fail() {
  adb shell dumpsys activity exit-info "$package" > "$results/exit-info.txt" || true
  adb exec-out screencap -p > "$results/failure.png" || true
  tail -n 30 "$results/launch.txt" || true
  rg -n -C 3 'FATAL EXCEPTION|Fatal signal|ReactNativeJS.*Error|Unable to start activity|UnsatisfiedLinkError|NoClassDefFoundError|Process: app\.penlia\.mobile\.preview' "$results/logcat.txt" | tail -n 90 || true
  exit 1
}

assert_pid() { adb shell pidof "$package" | grep -q '[0-9]' || fail; }

locate() {
  local label="$1" xy tree="$results/ui.xml"
  for attempt in $(seq 1 10); do
    assert_pid
    if adb shell uiautomator dump /sdcard/penlia-smoke.xml >/dev/null 2>&1; then
      adb pull /sdcard/penlia-smoke.xml "$tree" >/dev/null
      xy=$(python3 - "$tree" "$label" <<'PY'
import re
import sys
from xml.etree.ElementTree import parse

for node in parse(sys.argv[1]).iter('node'):
    if sys.argv[2] not in [node.get('text'), node.get('content-desc')]:
        continue
    bounds = [int(value) for value in re.findall(r'\d+', node.get('bounds', ''))]
    if len(bounds) == 4 and bounds[2] > bounds[0] and bounds[3] > bounds[1]:
        print((bounds[0] + bounds[2]) // 2, (bounds[1] + bounds[3]) // 2)
        break
PY
      )
      if [ -n "$xy" ]; then printf '%s\n' "$xy"; return; fi
    fi
    sleep 1
  done
  echo "Missing UI element: $label" >&2
  fail
}

tap() {
  local xy
  xy=$(locate "$1") || fail
  read -r x y <<< "$xy"
  adb shell input tap "$x" "$y"
}

launch() {
  adb shell am force-stop "$package"
  adb shell am start -W -n "$package/.MainActivity" >> "$results/launch.txt" || fail
  sleep 3
  assert_pid
}

touch "$results/launch.txt"
launch
tap '直接进入演示'
locate '发起会话' >/dev/null || fail
for screen in '好友' '玩乐' '动态' '我的' '聊天'; do
  tap "$screen"
  case "$screen" in
    '好友') locate '新的朋友' >/dev/null || fail ;;
    '玩乐') locate '一起生活' >/dev/null || fail ;;
    '动态') locate '发布私密动态' >/dev/null || fail ;;
    '我的') locate '隐私与安全' >/dev/null || fail ;;
    '聊天') locate '发起会话' >/dev/null || fail ;;
  esac
done
tap '玩乐'
tap '共享日程'
locate '添加日程' >/dev/null || fail
adb shell input keyevent 4
adb shell am start -W -a android.intent.action.VIEW -d 'penlia-preview://world/preview-world' "$package" >> "$results/launch.txt" || fail
locate '软风' >/dev/null || fail
echo 'Loaded the shared world and its demo pet.' | tee -a "$results/checks.txt"
for run in 2 3 4 5; do
  launch
  locate '发起会话' >/dev/null || fail
  echo "Cold launch $run reached the restored chat tab" | tee -a "$results/checks.txt"
done
adb exec-out screencap -p > "$results/success.png"
echo 'Passed five cold launches, entering demo, five tabs, shared calendar, and session restore.' | tee -a "$results/checks.txt"
