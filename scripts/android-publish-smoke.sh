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
adb shell ime list -s > "$results/input-methods.txt"
adb shell settings get secure default_input_method > "$results/default-ime.txt"
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

read_bounds() {
  python3 - "$results/ui.xml" "$1" <<'PYTHON'
import re
import sys
from xml.etree.ElementTree import parse

for node in parse(sys.argv[1]).iter('node'):
    if node.get('content-desc') != sys.argv[2]:
        continue
    values = re.findall(r'\d+', node.get('bounds', ''))
    if len(values) == 4:
        print(' '.join(values))
        break
else:
    sys.exit(1)
PYTHON
}

assert_home() {
  locate '好友动态' >/dev/null || fail
  python3 - "$results/ui.xml" <<'PYTHON'
import re
import sys
from xml.etree.ElementTree import parse

nodes = tuple(parse(sys.argv[1]).iter('node'))
labels = {n.get(field) for n in nodes for field in ('text','content-desc')}
assert labels.isdisjoint({'动态选项','发布私密动态','演示','返回'}), labels & {'动态选项','发布私密动态','演示','返回'}
assert not any(n.get('text') == '动态' and n.get('class') == 'android.view.View' and
               int(re.findall(r'\d+', n.get('bounds'))[1]) < 160 for n in nodes)
def bounds(label):
    matches = [n for n in nodes if n.get('content-desc') == label]
    assert len(matches) == 1, (label, len(matches))
    return list(map(int, re.findall(r'\d+', matches[0].get('bounds'))))
privacy = bounds('空间隐私')
publish = bounds('发布动态')
cover = bounds('更换空间封面')
assert privacy[1::2] == publish[1::2] and privacy[2] < publish[0], (privacy,publish)
assert privacy[2] - privacy[0] >= 129 and privacy[3] - privacy[1] >= 129, privacy
assert publish[2] - publish[0] >= 4 * (privacy[2] - privacy[0]), publish
assert 60 <= cover[1] < 180, cover
print(f'Native toolbar removed; cover button y={cover[1]}, action bounds={privacy} and {publish}.')
PYTHON
}
assert_same_avatar() {
  [ "$(read_bounds '查看我的动态')" = "$avatar" ] || fail
  ! grep -Fq 'content-desc="返回"' "$results/ui.xml" || fail
}

touch "$results/launch.txt"
launch
tap '直接进入演示'
locate '发起会话' >/dev/null || fail
tap '好友'
locate '新的朋友' >/dev/null || fail
tap '玩乐'
locate '查看里弄七码咖啡' >/dev/null || fail
tap '我的'
locate '查看个人资料' >/dev/null || fail
tap '动态'
assert_home | tee -a "$results/checks.txt"
capture moments '好友动态'
avatar=$(read_bounds '查看我的动态')

tap '空间隐私'
capture privacy '空间访问权限'
adb shell input keyevent 4
assert_home | tee -a "$results/checks.txt"

tap '发布动态'
capture publish-options '选择发布方式'
locate '共创动态' >/dev/null || fail
! grep -Eq 'content-desc="(空间隐私|瞬间共鸣|动态选项)"' "$results/ui.xml" || fail
tap '发布动态'
capture ordinary 'input:动态正文'
adb shell input keyevent 4
locate '好友动态' >/dev/null || fail
tap '发布动态'
tap '共创动态'
capture collaboration '发起共创动态'
locate 'input:名称' >/dev/null || fail
adb shell input keyevent 4
locate '好友动态' >/dev/null || fail

tap '日志'
capture journals '写日志'
assert_same_avatar
tap '相册'
capture albums '新建相册'
assert_same_avatar
tap 'button:动态'
locate '好友动态' >/dev/null || fail
assert_same_avatar
tap '查看我的动态'
capture timeline '管理这条动态'
adb shell input keyevent 4
assert_home | tee -a "$results/checks.txt"

for cycle in 2 3 4 5; do
  launch
  locate '发起会话' >/dev/null || fail
done
adb shell cmd uimode night yes
tap '动态'
capture dark '好友动态'
assert_home | tee -a "$results/checks.txt"
if grep -Eq 'AndroidRuntime.*Process: app\.penlia\.mobile\.preview|Fatal signal.*>>> app\.penlia\.mobile\.preview' "$results/logcat.txt"; then fail; fi
echo 'Passed five cold launches, five bottom tabs, single publish row, privacy, both editors, inline panes, personal timeline and dark mode.' | tee -a "$results/checks.txt"
