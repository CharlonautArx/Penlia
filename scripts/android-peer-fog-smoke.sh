#!/usr/bin/env bash
set -euo pipefail

apk=$(realpath "$1")
results=$(realpath -m "$2")
package=app.penlia.mobile.preview
mkdir -p "$results"
adb shell wm size 720x1600
adb shell wm density 320
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
        if left == 0 and right == 720 and bottom - top > 150:
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
    if [ "$first" -ge "$last" ] || [ "$last" -gt "$top" ] || { [ "$label" = "发送" ] && [ "$((top-last))" -gt 80 ]; }; then
      echo "$name $label $bounds, keyboard starts at $top" >&2
      fail
    fi
  done
  echo "$name: keyboardTop=$top; editor=$(read_bounds "$editor"); send=$(read_bounds '发送')" | tee -a "$results/checks.txt"
  adb exec-out screencap -p > "$results/$name.png"
}


require_ime() { assert_ime_open "$1" 消息 添加 从图库选择图片; }
dismiss() { adb shell input keyevent 4; locate 'input:消息' >/dev/null; }
tap_picker() {
  local mode="$1" xy
  for attempt in $(seq 1 8); do
    if adb shell uiautomator dump /sdcard/penlia-picker.xml >/dev/null 2>&1 &&
       adb pull /sdcard/penlia-picker.xml "$results/picker-$mode.xml" >/dev/null; then
      xy=$(python3 - "$results/picker-$mode.xml" "$mode" <<'PYTHON'
import re,sys
from xml.etree.ElementTree import parse
for n in parse(sys.argv[1]).iter('node'):
    desc=n.get('content-desc','')
    text=n.get('text','')
    res=n.get('resource-id','').split('/')[-1]
    if sys.argv[2]=='thumbnail':
        match = desc.startswith(('Photo taken','Photo from','照片拍摄于')) or res in {'icon_thumbnail','image_thumbnail','photo_thumbnail'}
    else:
        match = (n.get('enabled')=='true' and (
            re.match(r'(?:Add|添加|Select|选择)\s*\(?1', text) or
            res in {'button_add','button_confirm','button_select'}))
    if match:
        bounds=list(map(int,re.findall(r'\d+',n.get('bounds',''))))
        if len(bounds)==4 and bounds[2]>bounds[0] and bounds[3]>bounds[1]:
            print((bounds[0]+bounds[2])//2,(bounds[1]+bounds[3])//2)
            break
PYTHON
      )
      if [ -n "$xy" ]; then
        read -r x y <<< "$xy"
        adb shell input tap "$x" "$y"
        return
      fi
    fi
    sleep 1
  done
  cp "$results/picker-$mode.xml" "$results/ui.xml" || true
  fail
}
launch_chat() { tap 'prefix:小满，'; locate 'input:消息' >/dev/null; }

touch "$results/launch.txt"
launch
tap '直接进入演示'
launch_chat
capture conversation 'input:消息'
closed=$(read_bounds '消息')
python3 - "$results/ui.xml" <<'PY'
import sys
from xml.etree.ElementTree import parse
nodes=list(parse(sys.argv[1]).iter('node'))
identity=next(n for n in nodes if n.get('content-desc')=='查看小满的个人主页')
assert not any(n.get('class')=='android.widget.ImageView' for n in identity.iter())
assert any(n.get('content-desc')=='共同小宠物' for n in nodes)
assert all('正在处理所选图片' not in n.get('text','') for n in nodes)
PY

if [ "$4" = gallery ]; then
  adb shell mkdir -p /sdcard/Pictures
  adb push assets/demo/alley.jpg /sdcard/Pictures/penlia-preview-test.jpg > "$results/seed-photo.txt"
  adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Pictures/penlia-preview-test.jpg >> "$results/seed-photo.txt"
  for attempt in $(seq 1 10); do
    adb shell content query --uri content://media/external/images/media --projection _id:_display_name > "$results/media-store.txt"
    if grep -q penlia-preview-test "$results/media-store.txt"; then break; fi
    sleep 1
  done
  grep -q penlia-preview-test "$results/media-store.txt" || fail
  tap 'input:消息'
  adb shell input text PenliaDraft
  require_ime keyboard-before-gallery
  tap '从图库选择图片'
  sleep 1
  adb shell dumpsys activity activities > "$results/picker.txt"
  grep -Eiq 'photopicker|pickimages|documentsui' "$results/picker.txt" || fail
  adb exec-out screencap -p > "$results/picker.png"
  adb shell input keyevent 4
  capture canceled PenliaDraft
  test -z "$(ime_frame gallery-canceled)" || fail
  test "$(read_bounds '消息')" = "$closed" || fail
  ! grep -Fq '正在处理所选图片' "$results/ui.xml" || fail
  tap '从图库选择图片'
  tap_picker thumbnail
  tap_picker confirm
  capture photo-preview '待发送图片'
  ! grep -Fq '正在处理所选图片' "$results/ui.xml" || fail
  tap '发送图片'
  tap '查看大图'
  capture photo '原图预览'
  tap '关闭预览'
  capture after-gallery PenliaDraft
  test "$(read_bounds '消息')" = "$closed" || fail
  test -z "$(ime_frame gallery-finished)" || fail
  tap '发送'
  locate PenliaDraft >/dev/null
  locate 'input:消息' >/dev/null
  grep -Eq 'text=""[^>]*class="android.widget.EditText"[^>]*content-desc="消息"' "$results/ui.xml" || fail
  echo 'Passed real system gallery cancel, confirm, preview, send and reopen; no processing banner or keyboard reopening; identical composer bounds after gallery; text send and reset.' | tee -a "$results/checks.txt"
else
  tap '查看小满的个人主页'
  capture profile '发消息'
  dismiss
  tap '共同小宠物'
  capture pet '小宠物规则'
  dismiss
  adb shell input swipe 380 540 380 1240 500
  locate '对了，你那台老相机修好了吗？' >/dev/null
  capture fog-scrolled '查看小满的个人主页'
  adb shell input swipe 380 1200 380 400 420
  locate '周六两点，老地方见？🌿' >/dev/null
  tap 'button:添加'
  capture add '语音通话'
  tap '关闭'
  for cycle in 2 3 4 5; do
    launch
    locate 'input:搜索会话' >/dev/null
  done
  echo 'Passed nickname and pet routes, historic scroll, independent add button and five cold launches.' | tee -a "$results/checks.txt"
fi
if grep -Eq 'AndroidRuntime.*Process: app\.penlia\.mobile\.preview|Fatal signal.*>>> app\.penlia\.mobile\.preview' "$results/logcat.txt"; then fail; fi
