#!/usr/bin/env bash
set -euo pipefail

apk=$(realpath "$1")
results=$(realpath -m "$2")
package=app.penlia.mobile.preview
mkdir -p "$results"
adb shell wm size 1080x2340
adb shell wm density 432
adb shell settings put system font_scale 1.0
adb shell settings put secure show_ime_with_hard_keyboard 1
adb shell cmd uimode night no
sleep 4

adb install -r "$apk" > "$results/install.txt"
adb install -r "$(realpath "$3")" >> "$results/install.txt"
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

ime_frame() {
  adb shell dumpsys window > "$results/window-$1.txt"
  python3 - "$results/window-$1.txt" <<'PYTHON'
import re
import sys

with open(sys.argv[1]) as f:
    windows = f.read()
tops = []
for line in windows.splitlines():
    if not re.search(r'\b(?:type=ime|mType=ITYPE_IME)\b.*\b(?:mVisible|visible)=true\b', line):
        continue
    r = re.search(r'(?:mFrame|frame)=\[(\d+),(\d+)\]\[(\d+),(\d+)\]', line)
    if r:
        left, top, right, bottom = map(int, r.groups())
        if left == 0 and right == 1080 and bottom - top > 150:
            tops.append(top)
if tops:
    print(min(tops))
PYTHON
}

assert_ime_open() {
  local name="$1" editor="$2" top bounds left first right last
  locate "input:$editor" >/dev/null || fail
  top=$(ime_frame "$name")
  [ -n "$top" ] || { echo "Missing a visible system IME frame ($name)" >&2; fail; }
  for label in "$editor" '发送' "$3" "$4" '表情'; do
    bounds=$(read_bounds "$label") || fail
    read -r left first right last <<< "$bounds"
    if [ "$first" -ge "$last" ] || [ "$last" -gt "$top" ] || [ "$((top-last))" -gt 80 ]; then
      echo "$name $label $bounds, keyboard starts at $top" >&2
      fail
    fi
  done
  echo "$name: keyboardTop=$top; editor=$(read_bounds "$editor"); send=$(read_bounds '发送')" | tee -a "$results/checks.txt"
  adb exec-out screencap -p > "$results/$name.png"
}

assert_same_header() {
  test "$(read_bounds '查看我的动态')" = "$header" || { echo 'Space header moved' >&2; fail; }
  if grep -Fq 'content-desc="返回"' "$results/ui.xml"; then
    echo 'Pane switch added a navigation header.' >&2
    fail
  fi
}

touch "$results/launch.txt"
launch
tap '直接进入演示'
locate '发起会话' >/dev/null
tap '好友'
locate '新的朋友' >/dev/null
tap '玩乐'
locate '查看里弄七码咖啡' >/dev/null
tap '我的'
locate '查看个人资料' >/dev/null
tap '动态'
capture friends-feed '好友动态'
header=$(read_bounds '查看我的动态')
for cycle in 1 2; do
  tap '日志'
  capture journals '写日志'
  assert_same_header
  tap '相册'
  capture albums '新建相册'
  assert_same_header
  tap 'button:动态'
  locate '好友动态' >/dev/null
  assert_same_header
done
tap '相册'
tap '慢慢过的日子'
locate '3 张 · 本机相册' >/dev/null
adb shell input keyevent 4
locate '新建相册' >/dev/null
assert_same_header
tap 'button:动态'
tap '查看我的动态'
capture timeline '管理这条动态'
if grep -Fq 'content-desc="青禾的动态"' "$results/ui.xml"; then fail; fi
adb shell input keyevent 4
locate '好友动态' >/dev/null
assert_same_header
echo 'Pane switches kept the same header and navigation; album and owner timeline returned correctly.' | tee -a "$results/checks.txt"

tap '聊天'
tap 'prefix:小满，'
capture keyboard-closed 'input:消息'
closed=$(read_bounds '消息')
tap 'input:消息'
sleep 1.2
assert_ime_open keyboard-open 消息 更多输入方式 从图库选择图片
one_line=$(read_bounds '消息')
adb shell input text 'Penlia'
adb shell input keyevent 66
adb shell input text 'Second%sline'
adb shell input keyevent 66
adb shell input text 'Third%sline'
locate 'input:消息' >/dev/null
three_lines=$(read_bounds '消息')
read -r x old_top right bottom <<< "$one_line"
read -r x new_top right bottom <<< "$three_lines"
test "$((old_top-new_top))" -ge 24 || { echo 'Multiline field did not expand.' >&2; fail; }
assert_ime_open keyboard-multiline 消息 更多输入方式 从图库选择图片
for line in 4 5 6 7 8 9; do
  adb shell input keyevent 66
  adb shell input text "Line$line"
done
assert_ime_open keyboard-capped 消息 更多输入方式 从图库选择图片
read -r x capped_top right capped_bottom <<< "$(read_bounds '消息')"
test "$((capped_bottom-capped_top))" -le 345 || { echo 'Multiline field exceeded its cap.' >&2; fail; }
adb shell am instrument -w app.penlia.preview.tests/.ImeInput > "$results/unicode.txt"
grep -Fq 'unicode entered in the focused Android editor' "$results/unicode.txt" || fail
locate '你好 Penlia 😊' >/dev/null
assert_ime_open keyboard-unicode 消息 更多输入方式 从图库选择图片
tap '发送'
locate '你好 Penlia 😊' >/dev/null
locate 'input:消息' >/dev/null
grep -Fq 'text="输入模拟消息"' "$results/ui.xml" || fail
tap 'input:消息'
adb shell input text 'Draft'
for cycle in 1 2 3; do
  adb shell input keyevent 4
  sleep 0.8
  locate 'Draft' >/dev/null
  test -z "$(ime_frame "hidden-$cycle")" || { echo 'Keyboard remained visible on Back' >&2; fail; }
  test "$(read_bounds '消息')" = "$closed" || { echo 'Closed composer baseline drifted' >&2; fail; }
  tap 'input:消息'
  sleep 0.8
  assert_ime_open "reopen-$cycle" 消息 更多输入方式 从图库选择图片
done
tap '更多输入方式'
locate '位置' >/dev/null
tap '关闭'
locate 'Draft' >/dev/null
tap '表情'
tap '😊'
locate 'Draft😊' >/dev/null
echo 'The emoji drawer appended to the retained draft.' | tee -a "$results/checks.txt"
tap '从图库选择图片'
sleep 1.0
adb shell dumpsys activity activities > "$results/picker.txt"
grep -Ei 'photopicker|pickimages|documentsui|com[.](android|google[.]android)[.]providers[.]media' "$results/picker.txt" >/dev/null || fail
adb exec-out screencap -p > "$results/picker.png"
adb shell input keyevent 4
locate 'Draft😊' >/dev/null
echo 'The emoji drawer appended to the retained draft.' | tee -a "$results/checks.txt"
capture after-tools 'input:消息'

adb shell input keyevent 4
tap '群聊'
tap 'prefix:周末散步'
tap 'input:群消息'
sleep 1.2
assert_ime_open group-keyboard 群消息 更多群消息选项 从图库选择群图片
adb shell input keyevent 4
locate 'input:群消息' >/dev/null

for cycle in 2 3 4 5; do
  launch
  locate '发起会话' >/dev/null
done
if grep -Eq 'AndroidRuntime.*Process: app\.penlia\.mobile\.preview|Fatal signal.*>>> app\.penlia\.mobile\.preview' "$results/logcat.txt"; then fail; fi
echo 'Passed pane navigation, native private and group IME, multiline bounds, text send, draft retention and five cold starts.' | tee -a "$results/checks.txt"
