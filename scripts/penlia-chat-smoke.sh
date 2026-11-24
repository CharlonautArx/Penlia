#!/usr/bin/env bash
set -Eeuo pipefail

apk=$(realpath "$1")
results=$(realpath -m "$2")
package=app.penlia.mobile.preview
mkdir -p "$results"
adb shell wm size 540x1200
adb shell wm density 240
adb shell settings put system font_scale 1.0
adb shell settings put secure show_ime_with_hard_keyboard 1
adb shell cmd uimode night no
sleep 4

adb install -r "$apk" > "$results/install.txt"

adb shell ime list -s > "$results/input-methods.txt"
adb shell settings get secure default_input_method > "$results/default-ime.txt"
adb shell pm clear "$package" > "$results/clear.txt"
adb shell cmd locale set-app-locales "$package" --user 0 --locales zh-CN
adb shell cmd locale get-app-locales "$package" --user 0 > "$results/locale.txt"
if adb shell getprop ro.kernel.qemu | grep -q 1; then
  adb shell settings put global hide_error_dialogs 1 || true
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

trap fail ERR
assert_pid() { adb shell pidof "$package" | grep -q '[0-9]' || fail; }

locate() {
  local label="$1" xy tree="$results/ui.xml"
  for attempt in $(seq 1 15); do
    assert_pid
    adb shell rm -f /sdcard/penlia-smoke.xml
    if adb shell uiautomator dump /sdcard/penlia-smoke.xml >/dev/null 2>&1 &&
      adb pull /sdcard/penlia-smoke.xml "$tree" >/dev/null && [ -s "$tree" ]; then
      xy=$(python3 - "$tree" "$label" <<'PY'
import re
import sys
from xml.etree.ElementTree import parse

for node in parse(sys.argv[1]).iter('node'):
    key = sys.argv[2]
    tab = key.startswith('tab:')
    if tab: key = key.removeprefix('tab:')
    suffix = key.startswith('suffix:')
    if suffix: key = key.removeprefix('suffix:')
    prefix = key.startswith('prefix:')
    if prefix:
        key = key.removeprefix('prefix:')
    if key.startswith('button:'):
        if node.get('class') != 'android.widget.Button':
            continue
        key = key.removeprefix('button:')
    if key.startswith('switch:'):
        if node.get('class') != 'android.widget.Switch':
            continue
        key = key.removeprefix('switch:')
    if key.startswith('input:'):
        if node.get('class') != 'android.widget.EditText':
            continue
        key = key.removeprefix('input:')
    descriptions = [(node.get(field) or '').strip() for field in ('text', 'content-desc')]
    is_chat_tab = key == '聊天' and any(text.startswith('聊天，') and '条未读消息' in text for text in descriptions)
    if key not in descriptions and not is_chat_tab and not (prefix and any(v.startswith(key) for v in descriptions)) and not (suffix and any(v.endswith(key) for v in descriptions)):
        continue
    bounds = [int(value) for value in re.findall(r'\d+', node.get('bounds', ''))]
    if len(bounds) == 4 and (not tab or bounds[1] > 1030) and bounds[2] > bounds[0] and bounds[3] > bounds[1]:
        print((bounds[0] + bounds[2]) // 2, (bounds[1] + bounds[3]) // 2)
        break
PY
      )
      if [ -n "$xy" ]; then printf '%s\n' "$xy"; return; fi
      if grep -Fq "System UI isn" "$tree"; then
        wait_button=$(python3 - "$tree" <<'INNER'
import re,sys
from xml.etree.ElementTree import parse
for node in parse(sys.argv[1]).iter('node'):
    if node.get('text')!='Wait': continue
    x1,y1,x2,y2=map(int,re.findall(r'\d+',node.get('bounds','')))
    print((x1+x2)//2,(y1+y2)//2)
    break
INNER
)
        if [ -n "$wait_button" ]; then adb shell input tap $wait_button; sleep 2; fi
      fi
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
  sleep 5
  assert_pid
}

capture() {
  locate "$2" >/dev/null || fail
  sleep 0.4
  adb exec-out screencap -p > "$results/$1.png"
  echo "$1: found $2" | tee -a "$results/checks.txt"
}

back() { adb shell input keyevent 4; sleep .6; }

start_clip() {
  adb emu screenrecord start --size 540x1200 --fps 16 --bit-rate 1600000 --time-limit 90 "$results/$1.webm"
}
stop_clip() {
  adb emu screenrecord stop
  test -s "$results/$1.webm"
}
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
seed() {
  adb shell mkdir -p /sdcard/Pictures
  adb push "$1" "/sdcard/Pictures/$2"
  adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file:///sdcard/Pictures/$2"
  for n in $(seq 1 10); do
    if adb shell content query --uri content://media/external/images/media --projection _display_name | grep -F "$2" >/dev/null; then return; fi
    sleep 1
  done
  return 1
}

touch "$results/launch.txt"
sleep 12
adb shell cmd connectivity airplane-mode enable
adb shell svc wifi disable
adb shell svc data disable
set -x
launch
tap 直接进入

capture home 搜索会话
long_press() {
  local x y
  read -r x y <<<"$(locate "$1")"
  adb shell input swipe "$x" "$y" "$x" "$y" 610
}
open() {
  adb shell am start -W -a android.intent.action.VIEW -d "penlia-preview://$1" "$package" >> "$results/launch.txt"
  sleep 1
}

assert_state() {
  python3 - "$results/ui.xml" "$1" "$2" <<'PY'
from xml.etree.ElementTree import parse
import sys
_, file, label, field = sys.argv
nodes = [n for n in parse(file).iter('node') if label in (n.get('text'), n.get('content-desc'))]
if field == 'disabled':
    assert any(n.get('enabled') == 'false' for n in nodes), [(n.attrib) for n in nodes]
else:
    assert any(n.get(field) == 'true' for n in nodes), [(n.attrib) for n in nodes]
PY
}
open_chat() { tap 'prefix:小满，'; locate 聊天设置 >/dev/null; }
open_history() { tap 聊天设置; tap 'button:查找聊天记录'; locate 'input:搜索聊天记录' >/dev/null; }
case "$3" in
 fonts)
   tap 'tab:我的'
   adb shell input swipe 265 960 265 311 520
   tap 'button:字体大小'
   capture 01-font-default 文字预览
   assert_state 中字号 selected
   cp "$results/ui.xml" "$results/font-default.xml"
   read -r small_x small_y <<<"$(locate 小字号)"
   read -r big_x big_y <<<"$(locate 超大字号)"
   tap 小字号
   adb shell input swipe "$small_x" "$small_y" "$big_x" "$big_y" 620
   capture 02-font-maximum 文字预览
   assert_state 超大字号 selected
   cp "$results/ui.xml" "$results/font-max.xml"
   python3 - "$results/font-default.xml" "$results/font-max.xml" <<'FONT'
import re, sys
from xml.etree.ElementTree import parse

def height(path):
    for node in parse(path).iter('node'):
        if (node.get('text') or '').startswith('周末见。选一家安静的小店'):
            bounds = list(map(int, re.findall(r'\d+', node.get('bounds', ''))))
            return bounds[3] - bounds[1]
    raise AssertionError('Preview text not found')

base, larger = map(height, sys.argv[1:])
print(f'Native text preview bounds: {base}px → {larger}px')
assert larger > base
FONT
   launch
   open font-size
   capture 03-font-restored 文字预览
   assert_state 超大字号 selected
   launch
   capture 04-list-large 'prefix:小满，'
   tap 'tab:好友'
   capture 05-friends-large 全部
   adb shell settings put system font_scale 1.45
   launch
   open font-size
   capture 06-system-override 文字预览
   assert_state 超大字号 selected
   ;;
 history)
   open_chat
   tap 聊天设置
   tap 'switch:特别关心'
   tap 'switch:消息免打扰'
   capture 01-chat-settings 'switch:消息免打扰'
   assert_state 特别关心 checked
   assert_state 消息免打扰 checked
   launch
   open_chat
   tap 聊天设置
   locate 'switch:消息免打扰' >/dev/null
   assert_state 特别关心 checked
   assert_state 消息免打扰 checked
   tap 'button:查找聊天记录'
   tap 'input:搜索聊天记录'
   adb shell input text 'weekend'
   back
   capture 02-keyword '没有找到相关消息。'
   back
   open_history
   tap 日期
   capture 03-date 'suffix: 有聊天记录'
   inactive=$(python3 -c 'import sys,xml.etree.ElementTree as e; print(next(n.get("content-desc") for n in e.parse(sys.argv[1]).iter("node") if n.get("content-desc","").endswith(" 无聊天记录")))' "$results/ui.xml")
   assert_state "$inactive" disabled
   tap 'suffix: 有聊天记录'
   capture 04-date-position 返回最新消息
   tap 返回最新消息
   open_history
   tap 文件
   tap 'button:[文件] 周末行程.txt'
   capture 05-file '定位原消息'
   ;;
 recall)
   open_chat
   tap 'input:消息'
   adb shell input text NativeRecallQA
   capture 01-keyboard NativeRecallQA
   adb shell dumpsys input_method > "$results/keyboard.txt"
   tap 发送
   long_press NativeRecallQA
   capture 02-context-menu 撤回
   tap 撤回
   capture 03-recalled '你撤回了一条消息'
   open_history
   tap 'input:搜索聊天记录'
   adb shell input text NativeRecallQA
   back
   capture 04-search-cleared '没有找到相关消息。'
   launch
   capture 05-preview 'prefix:小满，'
   grep -F "你撤回了一条消息" "$results/ui.xml" >/dev/null
   ;;
 media)
   open_chat
   seed assets/demo/coffee.jpg chat-offline-coffee.jpg
   tap '从图库选择图片'
   tap_picker thumbnail
   tap_picker confirm
   capture 01-selected '发送图片'
   tap 发送图片
   capture 02-chat-image '查看大图'
   tap '查看大图'
   capture 03-full-image '关闭预览'
   tap '关闭预览'
   open_history
   tap '图片与视频'
   capture 04-media-grid '预览[图片]'
   tap '预览[图片]'
   tap '定位原消息'
   capture 05-located-image 返回最新消息
   ;;
 background)
   open_chat
   tap 聊天设置
   tap '设置当前聊天背景'
   capture 01-background-default '恢复默认背景'
   seed assets/demo/coffee.jpg chat-wallpaper-coffee.jpg
   tap '从手机相册选择'
   tap_picker thumbnail
   capture 02-background-preview '应用到当前聊天'
   if grep -Fq '应用到所有聊天' "$results/ui.xml"; then fail; fi
   tap '应用到当前聊天'
   capture 03-background-saved '已应用到当前聊天。'
   launch
   open_chat
   tap 聊天设置
   tap '设置当前聊天背景'
   capture 04-background-restored '跟随全局背景'
   tap '恢复默认背景'
   capture 05-background-reset '已恢复默认背景。'
   ;;
esac
if grep -Eq 'Process: app\.penlia\.mobile\.preview.*FATAL|ReactNativeJS.*(TypeError|ReferenceError)' "$results/logcat.txt"; then exit 1; fi
echo "PASS $3" | tee -a "$results/checks.txt"
