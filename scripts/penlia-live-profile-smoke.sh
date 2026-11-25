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

suite="${3:-profile}"
launch
tap "直接进入"
capture 00-cold-start "tab:好友"

case "$suite" in
  profile)
    adb push fixture/CropPinch.jar /data/local/tmp/CropPinch.jar
    seed assets/demo/alley.jpg penlia-crop-source.jpg
    route 'profile'
    capture 01-independent-profile-fields "昵称"
    tap "昵称"
    replace_field "昵称" ARX
    tap "保存"
    locate "ARX" >/dev/null
    tap "个性签名"
    replace_field "个性签名" Canal-walk
    tap "保存"
    locate "Canal-walk" >/dev/null
    tap "朋聊号"
    replace_field "朋聊号" arx_penlia08
    tap "保存"
    tap "朋聊号"
    capture 02-annual-handle-limit "prefix:下次可修改"
    back
    select_image "更换头像"
    capture 03-avatar-frame "图片裁剪区域"
    begin_clip avatar-gestures
    adb shell 'CLASSPATH=/data/local/tmp/CropPinch.jar app_process / CropPinch 268 540'
    sleep 1
    capture 04-avatar-pinched "图片裁剪区域"
    adb shell input swipe 268 540 332 650 560
    capture 05-avatar-reframed "图片裁剪区域"
    python3 - "$results" <<'PY'
from PIL import Image, ImageChops
from pathlib import Path
import sys
d = Path(sys.argv[1])
def pixels(name): return Image.open(d / f'{name}.png').convert('RGB').crop((165, 440, 380, 665))
assert ImageChops.difference(pixels('03-avatar-frame'), pixels('04-avatar-pinched')).getbbox(), 'pinch did not change the image'
assert ImageChops.difference(pixels('04-avatar-pinched'), pixels('05-avatar-reframed')).getbbox(), 'pan did not change the image'
PY
    tap "完成"
    end_clip
    capture 06-profile-saved-avatar "恢复默认头像"
    route 'moments'
    locate "Canal-walk" >/dev/null
    slide_up
    capture 07-history-synced "周末捏的小杯子。"
    grep -F 'text="ARX"' "$results/ui.xml"
    route 'my-qr'
    capture 08-qr-profile "ARX"
    if grep -Fq '管理公开资料' "$results/ui.xml"; then exit 1; fi
    route 'friend-requests/relationship-demo-taozi'
    capture 09-restricted-applicant "好友申请验证消息"
    if grep -Eq '朋聊号|个人空间' "$results/ui.xml"; then exit 1; fi
    ;;
  backgrounds)
    seed assets/demo/alley.jpg penlia-crop-source.jpg
    route 'chat-background'
    select_image "从手机相册选择"
    capture 01-chat-wallpaper-crop "图片裁剪区域"
    tap "完成"
    tap "应用到所有聊天"
    capture 02-chat-wallpaper-saved "prefix:已更新全局聊天背景"
    route 'chat-background?mode=voice'
    select_image "从手机相册选择"
    capture 03-voice-wallpaper-crop "图片裁剪区域"
    tap "完成"
    tap "应用到语音通话"
    capture 04-voice-wallpaper-saved "prefix:已应用到语音通话"
    route 'person/demo-self'
    tap "编辑主页背景"
    select_image "从手机相册选择"
    capture 05-profile-wallpaper-crop "图片裁剪区域"
    tap "完成"
    tap "保存主页背景"
    capture 06-profile-wallpaper-saved "编辑主页背景"
    route 'moments'
    tap "更换空间封面"
    select_image "选择自定义封面"
    capture 07-space-cover-crop "图片裁剪区域"
    tap "完成"
    tap "保存封面"
    capture 08-space-cover-saved "更换空间封面"
    ;;
  places)
    route 'playground/place/sample-board'
    locate "夜航桌游社" >/dev/null
    slide_up
    tap "发个聚会提议"
    tap "input:搜索好友或群聊"
    adb shell input text xiaoman
    back
    tap "小满"
    tap "input:搜索好友或群聊"
    clear_input
    adb shell input text azhu
    back
    tap "阿竹"
    tap "input:搜索好友或群聊"
    clear_input
    back
    slide_up
    slide_up
    tap "周末散步"
    capture 01-selected-recipients "确认发送（3）"
    tap "确认发送（3）"
    capture 02-sent-to-three "已分别发送至 3 个会话。"
    tap "完成"
    route 'chat/demo-xiaoman'
    capture 03-peer-card "查看去处 夜航桌游社"
    tap "查看去处 夜航桌游社"
    capture 04-clickable-place "夜航桌游社"
    route 'chat/demo-azhu'
    capture 05-second-peer-card "查看去处 夜航桌游社"
    route 'group/preview-weekend'
    capture 06-group-card "查看去处 夜航桌游社"
    launch
    route 'group/preview-weekend'
    capture 07-card-after-restart "查看去处 夜航桌游社"
    ;;
  composer)
    seed assets/demo/alley.jpg penlia-crop-source.jpg
    route 'private-moment'
    capture 01-composer-empty "动态正文"
    if grep -Eq '最多.*照片|以内的 MP4' "$results/ui.xml"; then exit 1; fi
    tap "选择照片"
    tap_picker thumbnail
    capture 02-composer-with-photo "预览附件 1"
    if grep -Eq '最多.*照片|以内的 MP4' "$results/ui.xml"; then exit 1; fi
    ;;
  *) exit 2 ;;
esac
assert_pid
if grep -E 'FATAL EXCEPTION|ReactNativeJS.*(TypeError|ReferenceError)|Tried to synchronously call a non-worklet' "$results/logcat.txt" | grep -vE 'com\.android|com\.google'; then fail; fi
