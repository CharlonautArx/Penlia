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

trap fail ERR
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
    tab = key.startswith('tab:')
    if tab: key = key.removeprefix('tab:')
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
    if len(bounds) == 4 and (not tab or bounds[1] > 1030) and bounds[2] > bounds[0] and bounds[3] > bounds[1]:
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
back() { adb shell input keyevent 4; sleep .4; }
chat() { tap "prefix:$1，"; locate 'input:消息' >/dev/null; }
settings() { tap "查看$1的个人主页"; tap 'button:聊天背景'; }
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
gallery() { tap '从手机相册选择'; tap_picker thumbnail; locate '应用到所有聊天' >/dev/null; }
touch "$results/launch.txt"
adb shell cmd connectivity airplane-mode enable
adb shell svc wifi disable
adb shell svc data disable
launch
tap '直接进入'
chat '小满'
capture default 'input:消息'
settings '小满'
seed assets/play/cinema.jpg wallpaper-a.jpg
tap '从手机相册选择'
sleep .8
back
locate '从手机相册选择' >/dev/null
gallery
xy=$(locate '调整聊天背景位置')
read -r x y <<< "$xy"
adb shell input swipe "$x" "$y" "$((x+92))" "$y" 440
capture preview '应用到当前聊天'
tap '应用到当前聊天'
locate '已应用到当前聊天。' >/dev/null
back
back
capture peer 'input:消息'
adb shell input swipe 234 372 234 930 500
sleep .8
adb exec-out screencap -p > "$results/scroll.png"
tap 'input:消息'
adb shell input text 'offline-wallpaper'
sleep .8
adb shell dumpsys window > "$results/ime.txt"
grep -E 'mType=ITYPE_IME.*mVisible=true|mType=ime.*mVisible=true|type=ime.*visible=true|mImeShowing=true|mInputShown=true' "$results/ime.txt" > /dev/null || adb shell dumpsys input_method | grep -Eq 'mInputShown=true|mShowRequested=true'
adb exec-out screencap -p > "$results/keyboard.png"
tap '发送'
locate 'offline-wallpaper' >/dev/null
adb shell input keyevent 111
sleep .25
if adb shell dumpsys input_method | grep -Eq 'mInputShown=true|mShowRequested=true'; then back; fi
back
locate '搜索会话' >/dev/null

chat '阿竹'
capture other-default 'input:消息'
settings '阿竹'
adb shell rm /sdcard/Pictures/wallpaper-a.jpg
adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Pictures/wallpaper-a.jpg
seed assets/demo/coffee.jpg wallpaper-b.jpg
gallery
tap '应用到所有聊天'
locate '已更新全局聊天背景，单独设置优先。' >/dev/null
back
back
capture inherited 'input:消息'
settings '阿竹'
tap '恢复默认背景'
locate '已恢复默认背景。' >/dev/null
back
back
capture override-white 'input:消息'
settings '阿竹'
tap '跟随全局背景'
locate '当前聊天已跟随全局背景。' >/dev/null
back
back
capture following 'input:消息'
back
locate '搜索会话' >/dev/null
tap 'tab:好友'
tap '群聊'
tap '周末散步'
capture group 'input:群消息'
back
back
tap 'tab:聊天'
chat '小满'
capture peer-over-global 'input:消息'
adb shell rm /sdcard/Pictures/wallpaper-b.jpg
launch
locate '搜索会话' >/dev/null
chat '小满'
capture restarted 'input:消息'
back
tap 'tab:我的'
adb shell input swipe 260 1020 260 400 450
tap 'button:聊天背景'
tap '恢复默认背景'
locate '已恢复默认背景。' >/dev/null
back
tap 'tab:聊天'
chat '阿竹'
capture reset-global 'input:消息'

/usr/bin/python3 - "$results" <<'PYTHON'
from PIL import Image, ImageChops, ImageStat
from pathlib import Path
import sys
path=Path(sys.argv[1])
def sample(name):
    return Image.open(path/(name+'.png')).convert('RGB').crop((4,205,11,430))
def distance(a,b):
    return sum(ImageStat.Stat(ImageChops.difference(sample(a),sample(b))).mean)/3
assert min(ImageStat.Stat(sample('default')).mean)>250
for name in ['other-default','override-white','reset-global']:
    assert distance('default',name)<3, name
for name in ['scroll','keyboard','peer-over-global','restarted']:
    print('same background',name,distance('peer',name))
    assert distance('peer',name)<5, name
assert distance('peer','inherited')>15
assert distance('inherited','following')<4
assert distance('inherited','group')<5
print('PASS white, local preview/crop, peer priority, IME/scroll pixel stability, group/global, settings reset and cold offline restart.')
PYTHON
