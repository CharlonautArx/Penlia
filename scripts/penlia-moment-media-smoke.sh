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


photo_fixtures() {
  local fixtures="$results/fixtures"
  mkdir -p "$fixtures"
  python3 - "$fixtures" <<'PIL'
from datetime import datetime, timedelta
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import colorsys, sys
folder = Path(sys.argv[1])
for number in range(1, 21):
    rgb = tuple(round(color * 255) for color in colorsys.hsv_to_rgb((number-1)/20, .62, .72 if number % 2 else .91))
    image = Image.new('RGB', (360, 360), rgb)
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 52)
    ImageDraw.Draw(image).text((180, 180), f'{number:02}', anchor='mm', fill='white', font=font)
    when = datetime(2026, 11, 20, 11, 30) + timedelta(minutes=number)
    exif = image.getexif()
    exif[306] = when.strftime('%Y:%m:%d %H:%M:%S')
    exif[36867] = exif[306]
    image.save(folder / f'penlia-{number:02}.jpg', exif=exif)
PIL
  adb shell mkdir -p /sdcard/Pictures/penlia-motion
  adb push "$fixtures/." /sdcard/Pictures/penlia-motion/
  adb shell 'for f in /sdcard/Pictures/penlia-motion/penlia-*.jpg; do am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file://$f" >/dev/null; done'
  for n in $(seq 1 12); do
    if test "$(adb shell content query --uri content://media/external/images/media --projection _display_name | grep -c 'penlia-[0-9][0-9].jpg')" = 20; then return; fi
    sleep 1
  done
  fail
}

choose_twenty() {
  local attempt candidates pos
  for attempt in $(seq 1 10); do
    if adb shell uiautomator dump /sdcard/picker20.xml >/dev/null &&
       adb pull /sdcard/picker20.xml "$results/picker20.xml" >/dev/null; then
      candidates=$(python3 - "$results/picker20.xml" <<'PICK'
import re, sys
from xml.etree.ElementTree import parse
for n in parse(sys.argv[1]).iter('node'):
    if n.get('resource-id','').endswith(':id/button_add') and re.search(r'\b20\b', n.get('text','')):
        x1,y1,x2,y2=map(int,re.findall(r'\d+',n.get('bounds','')))
        print('confirm', (x1+x2)//2,(y1+y2)//2)
        break
else:
    for n in parse(sys.argv[1]).iter('node'):
        if not n.get('content-desc','').startswith(('Photo taken', 'Photo from', '照片拍摄于')) or n.get('selected')=='true':
            continue
        x1,y1,x2,y2=map(int,re.findall(r'\d+',n.get('bounds','')))
        if y2-y1>=95 and y1>=305 and (y1+y2)//2 < 1007:
            print('tap',(x1+x2)//2,(y1+y2)//2)
PICK
)
      if [ -n "$candidates" ]; then
        while read -r command x y; do
          adb shell input tap "$x" "$y"
          if [ "$command" = 'confirm' ]; then return; fi
          sleep .15
        done <<< "$candidates"
      fi
    fi
    sleep .4
    if [ -z "${candidates:-}" ]; then adb shell input swipe 275 914 275 431 475; fi
  done
  cp "$results/picker20.xml" "$results/ui.xml" || true
  fail
}

enter_editor() {
  tap 'button:管理这条动态'
  tap '编辑或删除动态'
}
publish() {
  tap 'button:发布动态'
  tap '确认这个范围'
  tap 'button:发布动态'
}
save_edit() {
  tap 'button:保存修改'
  tap '确认这个范围'
  tap 'button:保存修改'
}
same_color() {
  python3 - "$@" <<'COLOR'
import sys
from PIL import Image
def sample(file, x, y):
    return Image.open(file).convert('RGB').getpixel((int(x)-22,int(y)-18))
base=sample(*sys.argv[1:4])
new=sample(*sys.argv[4:7])
print('Tile colors before and after sorting:', base,new)
assert max(abs(a-b) for a,b in zip(base,new)) < 45, (base,new)
COLOR
}
video_selected() {
  local xy
  for n in $(seq 1 10); do
    if adb shell uiautomator dump /sdcard/penlia-video.xml >/dev/null 2>&1 &&
       adb pull /sdcard/penlia-video.xml "$results/video-picker.xml" >/dev/null 2>&1; then
      xy=$(python3 -c 'import re,sys,xml.etree.ElementTree as e
for x in e.parse(sys.argv[1]).iter("node"):
 if x.get("resource-id","").endswith(":id/icon_thumbnail") or x.get("content-desc","").startswith(("Video taken","Video from","视频拍摄于")):
  a,b,c,d=map(int,re.findall(r"\d+",x.get("bounds","")))
  if d-b>45: print((a+c)//2,(b+d)//2); break' "$results/video-picker.xml")
      if [ -n "$xy" ]; then adb shell input tap $xy; return; fi
    fi
    sleep 1
  done
  fail
}

case "$3" in
 feed)
   open private-moment
   tap 'input:动态正文'
   adb shell input text PrivateFeedNativeQA
   back
   publish
   open moments
   capture 01-mixed-feed PrivateFeedNativeQA
   locate 'suffix:全部好友可见' >/dev/null
   locate 'suffix:仅自己可见' >/dev/null
   tap '查看我的动态'
   capture 02-personal PrivateFeedNativeQA
   enter_editor
   tap 'input:动态正文'
   adb shell input keyevent KEYCODE_MOVE_END
   adb shell input text Edited
   back
   save_edit
   capture 03-personal-updated PrivateFeedNativeQAEdited
   open moments
   capture 04-feed-updated PrivateFeedNativeQAEdited
   ;;
 photos)
   photo_fixtures
   open private-moment
   tap 'input:动态正文'
   adb shell input text TwentyPhotosNativeQA
   back
   tap '选择照片'
   choose_twenty
   capture 01-grid '预览附件 1'
   read -r x1 y1 <<< "$(locate '预览附件 1')"
   read -r x8 y8 <<< "$(locate '预览附件 8')"
   adb shell settings put system show_touches 1
   start_clip 02-cross-row || true
   adb shell input swipe "$x1" "$y1" "$x8" "$y8" 8500 &
   swipe_pid=$!
   sleep 4
   adb exec-out screencap -p > "$results/02-while-dragging.png"
   wait "$swipe_pid"
   stop_clip || true
   capture 03-dragged '预览附件 8'
   read -r mx my <<< "$(locate '预览附件 8')"
   same_color "$results/01-grid.png" "$x1" "$y1" "$results/03-dragged.png" "$mx" "$my"
   launch
   open private-moment
   capture 04-order-restored '预览附件 8'
   read -r restored_x restored_y <<< "$(locate '预览附件 8')"
   same_color "$results/01-grid.png" "$x1" "$y1" "$results/04-order-restored.png" "$restored_x" "$restored_y"
   tap '预览附件 1'
   capture 05-photo-preview '原图预览'
   tap '关闭预览'
   adb shell input swipe 262 1031 262 310 490
   sleep .5
   capture 06-last-row '预览附件 20'
   adb shell input swipe 263 1047 263 330 490
   sleep .5
   publish
   open moments
   capture 07-published TwentyPhotosNativeQA
   enter_editor
   capture 08-published-edit '预览附件 1'
   tap '移除附件 1'
   capture 09-deleted '预览附件 1'
   adb shell input swipe 260 1014 260 276 530
   sleep .5
   capture 10-add-after-delete '选择照片'
   adb shell input swipe 263 1060 263 340 490
   sleep .5
   save_edit
   open moments
   enter_editor
   adb shell input swipe 262 1031 262 310 490
   sleep .5
   capture 11-saved-19 '预览附件 19'
   if grep -Fq '预览附件 20' "$results/ui.xml"; then fail; fi
   ;;
 edge)
   photo_fixtures
   open private-moment
   tap '选择照片'
   choose_twenty
   capture 01-before-edge '预览附件 7'
   if grep -Fq '预览附件 20' "$results/ui.xml"; then fail; fi
   read -r x y <<< "$(locate '预览附件 7')"
   adb shell settings put system show_touches 1
   adb shell input swipe "$x" "$y" 265 1149 9900 &
   edge_pid=$!
   sleep 8.7
   adb exec-out screencap -p > "$results/02-edge-held.png"
   wait "$edge_pid"
   capture 03-after-edge '预览附件 20'
   ;;
 video)
   ffmpeg -hide_banner -loglevel error -threads 1 -f lavfi -i 'color=0x3398a4:size=240x240:rate=24' -t 2 \
     -pix_fmt yuv420p -c:v libx264 -movflags +faststart "$results/durable-video.mp4"
   adb shell mkdir -p /sdcard/Movies
   adb push "$results/durable-video.mp4" /sdcard/Movies/durable-video.mp4
   adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Movies/durable-video.mp4
   sleep 2
   open private-moment
   tap 'input:动态正文'
   adb shell input text VideoNativeQA
   back
   tap 选择短视频
   video_selected
   capture 01-picked-video '预览附件 1'
   launch
   open private-moment
   tap '预览附件 1'
   capture 02-video-restored '关闭预览'
   tap '关闭预览'
   publish
   open moments
   capture 03-video-published VideoNativeQA
   enter_editor
   tap '预览附件 1'
   capture 04-video-edit-preview '关闭预览'
   ;;
esac
if grep -Eq 'Process: app\.penlia\.mobile\.preview.*FATAL|ReactNativeJS.*(TypeError|ReferenceError)' "$results/logcat.txt"; then exit 1; fi
echo "PASS $3" | tee -a "$results/checks.txt"
