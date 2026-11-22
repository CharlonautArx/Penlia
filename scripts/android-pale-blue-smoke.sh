#!/usr/bin/env bash
set -euo pipefail

apk=$(realpath "$1")
results=$(realpath -m "$2")
package=app.penlia.mobile.preview
mkdir -p "$results"
source=$(realpath "$3")
api="$4"
adb shell wm size 720x1600
adb shell wm density 320
adb shell settings put system font_scale 1.0
adb shell settings put secure show_ime_with_hard_keyboard 1
adb shell cmd uimode night no
sleep 4

adb install -r "$apk" > "$results/install.txt"
adb shell ime list -s > "$results/input-methods.txt"
adb shell settings get secure default_input_method > "$results/default-ime.txt"
adb shell pm clear "$package" > "$results/clear.txt"
if [ "$api" -ge 33 ]; then
  adb shell cmd locale set-app-locales "$package" --user 0 --locales zh-CN
  adb shell cmd locale get-app-locales "$package" --user 0 > "$results/locale.txt"
fi
if adb shell getprop ro.kernel.qemu | grep -q 1; then
  adb shell am force-stop com.android.launcher3 || true
fi
adb logcat -c
adb logcat -b all -v threadtime > "$results/logcat.txt" &
logcat_pid=$!
trap 'kill "$logcat_pid" 2>/dev/null || true' EXIT

fail() {
  adb shell dumpsys activity exit-info "$package" > "$results/exit-info.txt" || true
  adb exec-out screencap -p > "$results/failure.png" || true
  tail -n 30 "$results/launch.txt" || true
  if [ -f "$results/ui.xml" ]; then
    python3 -c 'import sys,xml.etree.ElementTree as e; print([(n.get("package"),n.get("text"),n.get("content-desc")) for n in e.parse(sys.argv[1]).iter("node") if n.get("text") or n.get("content-desc")][:35])' "$results/ui.xml" || true
  fi
  grep -En -C 3 'FATAL EXCEPTION|Fatal signal|ReactNativeJS.*Error|Unable to start activity|UnsatisfiedLinkError|NoClassDefFoundError|Process: app\.penlia\.mobile\.preview' "$results/logcat.txt" | tail -n 90 || true
  exit 1
}

assert_pid() { adb shell pidof "$package" | grep -q '[0-9]' || fail; }

locate() {
  local label="$1" xy tree="$results/ui.xml"
  for attempt in $(seq 1 10); do
    assert_pid
    if adb shell uiautomator dump /sdcard/penlia-smoke.xml >/dev/null 2>&1 &&
      adb pull /sdcard/penlia-smoke.xml "$tree" >/dev/null && [ -s "$tree" ]; then
      xy=$(python3 - "$tree" "$label" <<'PY'
import re
import sys
from xml.etree.ElementTree import parse

for node in parse(sys.argv[1]).iter('node'):
    key = sys.argv[2]
    prefix = key.startswith('prefix:')
    if prefix:
        key = key.removeprefix('prefix:')
    if key.startswith('button:'):
        if node.get('class') != 'android.widget.Button':
            continue
        key = key.removeprefix('button:')
    if key.startswith('input:'):
        if node.get('class') != 'android.widget.EditText':
            continue
        key = key.removeprefix('input:')
    descriptions = [(node.get(field) or '').strip() for field in ('text', 'content-desc')]
    is_chat_tab = key == '聊天' and any(text.startswith('聊天，') and '条未读消息' in text for text in descriptions)
    if key not in descriptions and not is_chat_tab and not (prefix and any(v.startswith(key) for v in descriptions)):
        continue
    bounds = [int(value) for value in re.findall(r'\d+', node.get('bounds', ''))]
    if len(bounds) == 4 and bounds[2] > bounds[0] and bounds[3] > bounds[1]:
        print((bounds[0] + bounds[2]) // 2, (bounds[1] + bounds[3]) // 2)
        break
PY
      )
      if [ -n "$xy" ]; then printf '%s\n' "$xy"; return; fi
      if grep -Fq "Quickstep isn" "$tree" && adb shell getprop ro.kernel.qemu | grep -q 1; then
        echo 'Dismissing emulator Quickstep ANR (launcher process).' >&2
        adb shell am force-stop com.android.launcher3
        adb shell am start -W -n "$package/.MainActivity" >> "$results/launch.txt"
      fi
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

capture() {
  locate "$2" >/dev/null || fail
  sleep 0.4
  adb exec-out screencap -p > "$results/$1.png"
  echo "$1: found $2" | tee -a "$results/checks.txt"
}

capture_launch() {
  local name="$1" width="$2" height="$3" kind="$4"
  if [ "$kind" = art ]; then adb shell am force-stop "$package"; fi
  adb shell screenrecord --size "${width}x${height}" --bit-rate 6000000 --time-limit 6 "/sdcard/penlia-${name}.mp4" > "$results/$name-record.txt" 2>&1 &
  local record_pid=$!
  sleep 0.9
  adb shell am start -W -n "$package/.MainActivity" >> "$results/launch.txt"
  wait "$record_pid" || fail
  adb pull "/sdcard/penlia-${name}.mp4" "$results/$name.mp4" >/dev/null
  assert_pid
  python3 scripts/check-pale-blue-frames.py "$source" "$results/$name.mp4" "$kind" | tee -a "$results/checks.txt"
}

touch "$results/launch.txt"
adb shell cmd uimode night no
capture_launch cold-auth 360 800 art
capture auth-page '直接进入演示'
tap '直接进入演示'
locate 'input:搜索会话' >/dev/null

adb shell svc wifi disable
adb shell svc data disable
adb shell cmd connectivity airplane-mode enable || true
adb shell settings get global wifi_on > "$results/wifi.txt"
adb shell settings get global mobile_data > "$results/data.txt"
adb shell settings get global airplane_mode_on > "$results/airplane.txt"
test "$(tr -d '\r\n' < "$results/wifi.txt")" = 0
test "$(tr -d '\r\n' < "$results/data.txt")" = 0 || test "$(tr -d '\r\n' < "$results/airplane.txt")" = 1
capture_launch offline-cold 360 800 art
capture restored-chat 'input:搜索会话'
previous_pid=$(adb shell pidof "$package")
adb shell input keyevent KEYCODE_HOME
capture_launch offline-resume 360 800 warm
test "$previous_pid" = "$(adb shell pidof "$package")"
locate 'input:搜索会话' >/dev/null

adb shell cmd uimode night yes
adb shell wm size 720x1440
for _ in 1 2 3 4 5; do
  adb shell am get-config > "$results/dark-config.txt"
  if grep -q -- '-night-' "$results/dark-config.txt"; then break; fi
  sleep 0.5
done
grep -q -- '-night-' "$results/dark-config.txt"
capture_launch offline-dark-short 360 720 art
capture restored-dark-chat 'input:搜索会话'
if grep -Eq 'AndroidRuntime.*Process: app\.penlia\.mobile\.preview|Fatal signal.*>>> app\.penlia\.mobile\.preview' "$results/logcat.txt"; then fail; fi
echo "PASS API $api: first launch, demo session, offline cold launch, dark short display, and same-process warm resume." | tee -a "$results/checks.txt"
