#!/usr/bin/env bash
set -euo pipefail

apk=$(realpath "$1")
results=$(realpath -m "$2")
package=app.penlia.mobile.preview
mkdir -p "$results"
adb shell wm size 1080x2340
adb shell wm density 432
adb shell settings put system font_scale 1.0
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
    descriptions = [node.get('text') or '', node.get('content-desc') or '']
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
capture login '直接进入演示'
tap '直接进入演示'
capture chat '发起会话'
tap '好友'
capture friends '新的朋友'
tap '动态'
capture moments '发布私密动态'
tap '我的'
capture profile '隐私与安全'
tap '隐私与安全'
capture privacy '社交权限'
adb shell input keyevent 4
tap '玩乐'
capture play '查看里弄七码咖啡'
tap '选择城市，当前上海'
capture cities '选择城市'
tap '杭州'
locate '选择城市，当前杭州' >/dev/null || fail
tap '选择城市，当前杭州'
tap '上海'
tap '手作'
tap '查看白釉制物室'
capture place '收藏去处'
tap '收藏去处'
locate '取消收藏' >/dev/null || fail
adb shell input keyevent 4
tap '想去的地方'
locate '查看白釉制物室' >/dev/null || fail
adb shell input keyevent 4
tap '一起'
capture together '约朋友一起玩'
tap '约朋友一起玩'
capture activities '发起约局'
tap '小游戏'
capture games '反应力挑战'
tap '单人'
tap '反应力挑战'
capture game '点这里开始'
adb shell input keyevent 4
adb shell input keyevent 4
adb shell input keyevent 4
tap '聊天'
locate '发起会话' >/dev/null || fail

adb shell cmd uimode night yes
launch
capture dark-chat '发起会话'
tap '玩乐'
capture dark-play '一起'

adb shell wm density 480
adb shell settings put system font_scale 1.35
launch
capture large '发起会话'
tap '玩乐'
capture large-play '一起'
tap '一起'
capture large-together '约朋友一起玩'
adb shell input keyevent 4
for i in 4 5; do
  launch
  locate '发起会话' >/dev/null || fail
done
if grep -Eq 'AndroidRuntime.*Process: app\.penlia\.mobile\.preview|Fatal signal.*>>> app\.penlia\.mobile\.preview' "$results/logcat.txt"; then
  fail
fi
echo 'Verified five cold launches, five tabs, location filtering and saved place, Together, activity and a local game.' | tee -a "$results/checks.txt"
