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

button_visible() { locate "$1" >/dev/null; }

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
        match = desc.lower().startswith(('photo','image','照片','图片'))
    elif sys.argv[2]=='video':
        match = desc.lower().startswith(('video','视频')) or (res == 'icon_thumbnail' and 'duration' in desc.lower())
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

route() {
  adb shell am start -W -a android.intent.action.VIEW -d "penlia-preview://$1" -p "$package" >> "$results/launch.txt"
  sleep .6
}

slide_up() { adb shell input swipe 280 1010 280 420 440; sleep .7; }
clear_input() {
  adb shell input keyevent KEYCODE_MOVE_END
  adb shell input keyevent $(printf 'KEYCODE_DEL %.0s' {1..65})
}
replace_field() {
  tap "input:$1"
  clear_input
  adb shell input text "$2"
  back
}
select_image() {
  tap "$1"
  tap_picker thumbnail
  locate "图片裁剪区域" >/dev/null
}

begin_clip() {
  adb emu screenrecord start --size 540x1200 --fps 18 --bit-rate 1700000 --time-limit 55 "$results/$1.webm" || true
}
end_clip() { adb emu screenrecord stop || true; }

seed_video() {
  adb shell mkdir -p /sdcard/Movies
  adb push "$1" "/sdcard/Movies/$2"
  adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file:///sdcard/Movies/$2"
  for i in $(seq 1 10); do
    if adb shell content query --uri content://media/external/video/media --projection _display_name | grep -F "$2" >/dev/null; then return; fi
    sleep 1
  done
  return 1
}
clear_videos() {
  local path
  path=$(adb shell content query --uri content://media/external/video/media --projection _id | sed -En 's/.*_id=([0-9]+).*/\1/p')
  for id in $path; do adb shell content delete --uri "content://media/external/video/media/$id"; done
}
suite="${3:-moments}"
launch
tap "直接进入"
capture 00-cold-start "tab:好友"
case "$suite" in
  moments)
    route 'friend-requests'
    capture 01-friend-requests "桃子"
    python3 - "$results/ui.xml" <<'PY'
import re,sys
from xml.etree.ElementTree import parse
elements = [(any((n.get(k) or '').strip() == name for k in ('text','content-desc')), name, n.get('bounds')) for n in parse(sys.argv[1]).iter('node') for name in ('桃子','小满')]
positions = {}
for match,name,bounds in elements:
 if match:
  coords = re.findall(r'\d+',bounds)
  positions[name]=min(positions.get(name,1201),int(coords[1]))
assert positions['桃子'] < positions['小满'], positions
PY
    route 'life/timeline/demo-self'
    capture 02-timeline-glass '发布私密动态'
    locate '返回' >/dev/null
    tap '动态选项'
    locate '空间隐私' >/dev/null
    back
    tap '发布私密动态'
    capture 03-one-picker '选择照片和视频'
    if grep -Fq '选择短视频' "$results/ui.xml"; then exit 1; fi
    seed_video fixture/21mb.mp4 penlia-outside-post-limit.mp4
    tap '选择照片和视频'
    tap_picker video
    tap_picker confirm
    capture 04-video-limit '视频文件大小不能超过 20 MB。'
    tap '知道了'
    clear_videos
    seed_video fixture/20mb.mp4 penlia-at-post-limit.mp4
    seed assets/demo/alley.jpg penlia-mixed-photo.jpg
    tap '选择照片和视频'
    tap_picker thumbnail
    tap_picker video
    tap_picker confirm
    capture 05-mixed-moment-draft '预览附件 2'
    tap '预览附件 2'
    capture 06-draft-video-preview '短视频'
    back
    launch
    route 'private-moment'
    capture 07-restored-mixed-draft '预览附件 2'
    slide_up
    tap 'button:发布动态'
    slide_up
    tap '确认这个范围'
    tap 'button:发布动态'
    sleep 5
    route 'life/timeline/demo-self'
    slide_up
    capture 08-published-mixed-feed '播放动态视频 2'
    ;;
  peer)
    seed assets/demo/alley.jpg penlia-chat-photo.jpg
    seed_video fixture/21mb.mp4 penlia-chat-large-video.mp4
    route 'chat/demo-xiaoman'
    tap '添加'
    capture 01-conversation-add '照片'
    for value in 语音通话 视频通话 位置; do locate "$value" >/dev/null; done
    if grep -Fq '短视频' "$results/ui.xml"; then exit 1; fi
    tap '照片'
    tap_picker thumbnail
    tap_picker video
    tap_picker confirm
    capture 02-mixed-chat '发送 2 个附件'
    tap '发送 2 个附件'
    capture 03-chat-video-sent '观看视频'
    route 'playground/place/sample-board'
    slide_up
    tap '发个聚会提议'
    tap '小满'
    slide_up
    slide_up
    tap '确认发送（1）'
    capture 04-share-confirmed '已分别发送至 1 个会话。'
    tap '完成'
    route 'chat/demo-xiaoman'
    capture 05-standalone-place-card '查看去处 夜航桌游社'
    tap '查看去处 夜航桌游社'
    capture 06-linked-details '夜航桌游社'
    ;;
  *) exit 2 ;;
esac
assert_pid
