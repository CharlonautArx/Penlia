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
if [ "$#" -ge 3 ]; then
  adb install -r "$(realpath "$3")" >> "$results/install.txt"
fi
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


require_ime() { assert_ime_open "$1" 消息 添加 从图库选择图片; }
dismiss() { adb shell input keyevent 4; locate 'input:消息' >/dev/null; }
launch_chat() { tap 'prefix:小满，'; locate 'input:消息' >/dev/null; }

touch "$results/launch.txt"
launch
tap '直接进入演示'
launch_chat
capture conversation 'input:消息'
closed=$(read_bounds '消息')
python3 - "$results/ui.xml" <<'PY'
import re,sys
from xml.etree.ElementTree import parse

nodes = list(parse(sys.argv[1]).iter('node'))
labels={n.get(field) for n in nodes for field in ('text','content-desc')}
assert labels.isdisjoint({'聊天选项','演示','模拟视频来电','输入模拟消息','更多输入方式'}), labels
def element(label):
    return next(n for n in nodes if n.get('content-desc')==label)
def bounds(label):
    return tuple(map(int,re.findall(r'\d+',element(label).get('bounds'))))
back,identity,pet=map(bounds,('返回','查看小满的个人主页','共同小宠物'))
add,photo,editor,emoji,send=map(bounds,('添加','从图库选择图片','消息','表情','发送'))
assert back[2]<=identity[0]<identity[2]<=pet[0],(back,identity,pet)
assert add[2]<=photo[0]<photo[2]<=editor[0]<editor[2]<=emoji[0]<emoji[2]<=send[0],(add,photo,editor,emoji,send)
assert (max(top[1] for top in (add,photo,editor,emoji,send))-
        min(top[1] for top in (add,photo,editor,emoji,send))) <= 14
assert element('消息').get('text')=='',element('消息').attrib
assert element('发送').get('enabled')=='false'
print('Navigation and blank composer geometry:',back,identity,pet,add,photo,editor,emoji,send)
PY
tap '共同小宠物'
locate '小宠物规则' >/dev/null
dismiss
tap '查看小满的个人主页'
locate '发消息' >/dev/null || locate '小满' >/dev/null
dismiss

adb shell input swipe 600 540 600 1650 510
locate '对了，你那台老相机修好了吗？' >/dev/null
adb shell input swipe 600 1670 600 520 410
locate '周六两点，老地方见？🌿' >/dev/null
echo 'Older messages reached and returned to newest without changing the chat feed.' | tee -a "$results/checks.txt"

tap 'input:消息'
require_ime keyboard
one_line=$(read_bounds '消息')
adb shell input text Penlia
adb shell input keyevent 66
adb shell input text Second%sline
adb shell input keyevent 66
adb shell input text Third%sline
require_ime multiline
read -r _ one_top _ _ <<< "$one_line"
read -r _ multi_top _ _ <<< "$(read_bounds '消息')"
test "$((one_top-multi_top))" -ge 24 || fail
for line in 4 5 6 7 8 9; do
  adb shell input keyevent 66
  adb shell input text "Line$line"
done
require_ime multiline-capped
read -r _ capped_top _ capped_bottom <<< "$(read_bounds '消息')"
test "$((capped_bottom-capped_top))" -le 345 || fail
for attempt in 1 2 3; do
  if adb shell am instrument -w app.penlia.preview.tests/.ImeInput > "$results/unicode.txt" 2>&1 &&
    grep -Fq 'unicode entered in the focused Android editor' "$results/unicode.txt"; then break; fi
  sleep 1
done
grep -Fq 'unicode entered in the focused Android editor' "$results/unicode.txt" || fail
locate '你好 Penlia 😊' >/dev/null
require_ime keyboard-unicode
tap '发送'
locate '你好 Penlia 😊' >/dev/null
locate 'input:消息' >/dev/null
grep -Eq 'text=""[^>]*class="android.widget.EditText"[^>]*content-desc="消息"' "$results/ui.xml" || fail

tap 'input:消息'
adb shell input text Draft
for cycle in 1 2 3; do
  adb shell input keyevent 4
  sleep 0.8
  locate Draft >/dev/null
  test -z "$(ime_frame "dismissed-$cycle")" || fail
  test "$(read_bounds '消息')" = "$closed" || fail
  tap 'input:消息'
  require_ime "reopen-$cycle"
done
tap 'button:添加'
capture add '语音通话'
locate '视频通话' >/dev/null
locate '位置' >/dev/null
! grep -Eq '(text|content-desc)="(聊天选项|更多输入方式|模拟视频来电|查看好友资料|从图库选择图片)"' "$results/ui.xml" || fail
tap '语音通话'
capture voice '语音通话 · 演示'
locate 'prefix:本机模拟通话信令' >/dev/null
tap '模拟对方接听'
locate '演示通话中' >/dev/null
tap '挂断'
tap '完成'
tap 'button:添加'
tap '视频通话'
capture video '视频通话 · 演示'
locate 'prefix:本机模拟通话信令' >/dev/null
tap '关闭'
tap 'button:添加'
tap '位置'
capture location '获取当前位置'
locate 'prefix:仅获取这一次位置' >/dev/null
tap '关闭'
locate Draft >/dev/null
tap '表情'
tap '😊'
locate 'Draft😊' >/dev/null

adb shell mkdir -p /sdcard/Pictures
adb push assets/demo/alley.jpg /sdcard/Pictures/penlia-preview-test.jpg > "$results/seed-photo.txt"
adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Pictures/penlia-preview-test.jpg >> "$results/seed-photo.txt"
for attempt in $(seq 1 10); do
  adb shell content query --uri content://media/external/images/media --projection _id:_display_name > "$results/media-store.txt"
  if grep -q penlia-preview-test "$results/media-store.txt"; then break; fi
  sleep 1
done
grep -q penlia-preview-test "$results/media-store.txt" || fail
tap '从图库选择图片'
sleep 1
adb shell dumpsys activity activities > "$results/picker.txt"
grep -Eiq 'photopicker|pickimages|documentsui' "$results/picker.txt" || fail
adb exec-out screencap -p > "$results/picker.png"
tap 'prefix:Photo taken'
tap 'prefix:Add (1)'
capture photo-preview '待发送图片'
tap '发送图片'
locate '查看大图' >/dev/null
tap '查看大图'
capture photo '原图预览'
tap '关闭预览'
locate 'Draft😊' >/dev/null

for cycle in 2 3 4 5; do
  launch
  locate 'input:搜索会话' >/dev/null
done
launch_chat
locate '查看大图' >/dev/null
if grep -Eq 'AndroidRuntime.*Process: app\.penlia\.mobile\.preview|Fatal signal.*>>> app\.penlia\.mobile\.preview' "$results/logcat.txt"; then fail; fi
echo 'Passed five cold launches, repeated native IME and multiline bounds, Unicode, send, older messages, draft and emoji, calls, location composer, pet, identity and a persisted gallery photo.' | tee -a "$results/checks.txt"
