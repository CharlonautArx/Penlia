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
touch "$results/launch.txt"
launch
tap '直接进入'
tap '动态'
capture initial '查看我的动态'
adb shell dumpsys window > "$results/window-cover.txt"
if grep -Fq '好友动态' "$results/ui.xml"; then fail; fi
tap '日志'
capture journal '写日志'
tap '相册'
capture albums '新建相册'
tap 'button:动态'
capture feed '发布动态'
tap '查看我的动态'
capture timeline '动态选项'
adb shell input keyevent 4
adb shell mkdir -p /sdcard/Pictures
adb push assets/play/cinema.jpg /sdcard/Pictures/space-test.jpg
adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Pictures/space-test.jpg
sleep 1
tap '更换空间封面'
tap '更换自定义封面'
tap_picker thumbnail
locate '调整封面取景' >/dev/null
sleep 0.6
tap '保存封面'
capture 'default-crop' '发布动态'
tap '更换空间封面'
xy=$(locate '调整封面取景')
read -r x y <<< "$xy"
adb shell input swipe "$x" "$y" "$((x-170))" "$y" 480
tap '保存封面'
capture changed '发布动态'
tap '我的'
capture nav '查看个人资料'
adb shell dumpsys window > "$results/window-other-tab.txt" 
launch
tap '动态'
capture restored '查看我的动态'
adb shell pm clear "$package"
launch
tap '直接进入'
tap '动态'
capture initial '查看我的动态'
adb shell input swipe 255 184 255 743 2300 &
drag=$!
sleep 1.6
adb exec-out screencap -p > "$results/pulling.png"
wait "$drag"
sleep 1
adb exec-out screencap -p > "$results/released.png"
adb shell input swipe 220 870 220 570 720
sleep 0.8
adb exec-out screencap -p > "$results/feed-scroll.png"
adb shell input swipe 220 335 220 985 650
sleep .6
tap '日志'
capture journal '写日志'
tap '相册'
capture albums '新建相册'
tap 'button:动态'
capture feed '发布动态'
/usr/bin/python3 - "$results" "$3" <<'PY'
from PIL import Image,ImageChops,ImageStat
from pathlib import Path
import sys
p=Path(sys.argv[1])
def load(name): return Image.open(p/(name+'.png')).convert('RGB')
a,b,c=map(load,['initial','pulling','released'])
before=Image.open(sys.argv[2]).convert('RGB')
assert a.size == before.size == (540, 1200)
def rgb(image, box):
    return ImageStat.Stat(image.crop(box)).mean
for box in [(100,2,400,14),(120,22,350,42)]:
    new, old = rgb(a,box),rgb(before,box)
    print('Top edge RGB before and after',old,new)
    assert sum(old) - sum(new) > 100
    assert all(max(channel,0)<185 for channel in new)
for box in [(40,190,470,310),(145,342,335,390),(8,425,530,468)]:
    delta = sum(ImageStat.Stat(ImageChops.difference(a.crop(box),before.crop(box))).mean)/3
    print('Unchanged cover/mist/profile region mean difference:', delta)
    assert delta < 1.0
# The status icons are the only new nearly white pixels in their dark backing area.
def white_count(image, box):
    return sum(min(rgb)>232 for rgb in image.crop(box).getdata())
assert white_count(a,(327,49,410,79)) > 100
print('PASS full-color top edge, lower white fade, and light status icons.')
def score(im,x,y,w,h,other,offset):
    crop=(x,y,x+w,y+h)
    ref=im.crop(crop)
    region=other.crop((x,y+offset,x+w,y+h+offset))
    return sum(ImageStat.Stat(ImageChops.difference(ref,region)).mean)/3
for x,y,w,h in [(30,200,130,40),(34,290,150,45)]:
    shift=min(range(0,360),key=lambda d:score(a,x,y,w,h,b,d))
    print('Pull offset',shift,'region',x,y,'mean error',score(a,x,y,w,h,b,shift))
    assert shift>60 and score(a,x,y,w,h,b,shift)<12
    assert score(a,x,y,w,h,c,0)<5
assert score(a,100,145,300,80,load('changed'),0)>20
assert score(load('default-crop'),100,145,300,80,load('changed'),0)>8
assert score(load('changed'),100,145,300,80,load('restored'),0)<4
assert score(a,30,150,350,100,load('feed-scroll'),0)>18
print('PASS same-scale photo and identity motion, rebound, feed scroll and persisted cover change.')
PY

