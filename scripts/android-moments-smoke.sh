#!/usr/bin/env bash
set -euo pipefail

apk=$(realpath "$1")
results=$(realpath -m "$2")
package=app.penlia.mobile.preview
mkdir -p "$results"
adb shell wm size 1080x2340
adb shell wm density 432
adb shell settings put system font_scale 1.0
adb shell settings put secure show_ime_with_hard_keyboard 0
adb shell cmd uimode night no
sleep 4

adb install -r "$apk" > "$results/install.txt"
adb shell pm clear "$package" > "$results/clear.txt"
adb shell cmd locale set-app-locales "$package" --user 0 --locales zh-CN
adb shell cmd locale get-app-locales "$package" --user 0 > "$results/locale.txt"
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
    if adb shell uiautomator dump /sdcard/penlia-smoke.xml >/dev/null 2>&1; then
      adb pull /sdcard/penlia-smoke.xml "$tree" >/dev/null
      xy=$(python3 - "$tree" "$label" <<'PY'
import re
import sys
from xml.etree.ElementTree import parse

for node in parse(sys.argv[1]).iter('node'):
    key = sys.argv[2]
    if key.startswith('input:'):
        if node.get('class') != 'android.widget.EditText':
            continue
        key = key.removeprefix('input:')
    descriptions = [(node.get(field) or '').strip() for field in ('text', 'content-desc')]
    is_chat_tab = key == '聊天' and any(text.startswith('聊天，') and '条未读消息' in text for text in descriptions)
    if key not in descriptions and not is_chat_tab:
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

touch "$results/launch.txt"
launch
tap '直接进入演示'
locate '发起会话' >/dev/null || fail
tap '好友'
locate '新的朋友' >/dev/null || fail
tap '玩乐'
locate '查看里弄七码咖啡' >/dev/null || fail
tap '动态'
capture moments '查看我的动态'
tap '日志'
capture journal '写日志'
adb shell input keyevent 4
tap '相册'
capture albums '新建相册'
adb shell input keyevent 4
tap '查看我的动态'
capture timeline '管理这条动态'
tap '管理这条动态'
tap '置顶这条动态'
capture pinned '管理置顶动态'
adb shell input keyevent 4
tap '我的'
capture me '查看个人资料'
tap '查看个人资料'
capture profile '本机补充资料'
adb shell input keyevent 4
tap '状态'
tap '设置状态'
capture status-editor '保存状态'
tap 'input:状态文字'
adb shell input text 'Late%swalk%stoday'
sleep 0.4
tap '保存状态'
capture status 'Late walk today'

launch
locate '发起会话' >/dev/null || fail
tap '动态'
tap '查看我的动态'
locate '管理置顶动态' >/dev/null || fail
adb shell input keyevent 4
tap '我的'
tap '状态'
locate 'Late walk today' >/dev/null || fail
tap '清除状态'
tap '确认清除'
locate '设置状态' >/dev/null || fail

adb shell cmd uimode night yes
launch
tap '动态'
capture dark '查看我的动态'
adb shell wm density 480
adb shell settings put system font_scale 1.35
launch
tap '动态'
capture large '查看我的动态'
launch
locate '发起会话' >/dev/null || fail
tap '我的'
tap '状态'
locate '设置状态' >/dev/null || fail
if grep -Eq 'AndroidRuntime.*Process: app\.penlia\.mobile\.preview|Fatal signal.*>>> app\.penlia\.mobile\.preview' "$results/logcat.txt"; then
  fail
fi
echo 'Passed five cold launches, five tabs, personal timeline and persisted pin, journals, albums, profile, and permanent state set/clear after restart.' | tee -a "$results/checks.txt"
