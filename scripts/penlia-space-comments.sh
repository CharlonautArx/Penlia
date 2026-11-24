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
case "${3:-draft}" in
 draft)
   tap 'tab:动态'
   capture 01-home '最近在收集好喝的店。'
   tap 查看我的动态
   capture 01-space '最近在收集好喝的店。'
   open private-moment
   tap 'input:动态正文'
   adb shell input text RetainedDraft
   back
   tap 'input:标注地点'
   adb shell input text WeekendRiver
   back
   tap 'prefix:可见范围'
   tap 全部好友
   tap '确认这个范围'
   seed assets/demo/coffee.jpg draft-coffee.jpg
   tap 选择照片
   tap_picker thumbnail
   tap_picker confirm
   capture 02-draft '预览附件 1'
   launch
   open private-moment
   capture 02-restored '预览附件 1'
   locate RetainedDraft >/dev/null
   locate WeekendRiver >/dev/null
   locate 'prefix:可见范围 · 全部好友' >/dev/null
   ;;
 privacy)
   open space/privacy
   tap '动态展示时间范围'
   tap 自定义时间
   capture 03-date 年份
   tap 'prefix:从 '
   capture 03-saved '动态展示时间范围'
   launch
   open space/privacy
   capture 03-restored '动态展示时间范围'
   ;;
 boundary)
   tap 'prefix:小满，'
   row='周六两点，老地方见？🌿'
   long_press "$row"
   capture 04-report-menu 举报
   tap 举报
   capture 04-report '生活边界保护计划'
   tap '预览提交内容'
   tap '确认举报'
   capture 04-submitted '举报已在本机保存'
   tap 完成
   open boundary
   capture 04-history '删除举报记录'
   tap '删除举报记录'
   tap '确认删除记录'
   capture 04-removed '暂无举报记录。'
   launch
   open boundary
   capture 04-restored '暂无举报记录。'
   ;;
 comments)
   tap 'tab:动态'
   adb shell input swipe 275 915 275 480 430
   tap 查看动态详情
   capture 05-detail '动态详情'
   tap 'input:评论内容'
   adb shell input text CommentQA
   tap 'button:发送'
   adb shell input swipe 270 890 270 415 400
   capture 05-detail-comments 'prefix:青禾：CommentQA'
   tap 返回
   adb shell input swipe 270 940 270 500 430
   capture 05-compact-comments 'prefix:青禾：CommentQA'
   tap 'prefix:青禾：CommentQA'
   capture 05-reply-keyboard 'input:回复：青禾'
   adb shell dumpsys input_method > "$results/keyboard.txt"
   adb shell input text ReplyQA
   tap 'button:发送'
   adb shell input swipe 270 890 270 415 400
   capture 05-thread 'prefix:青禾：ReplyQA'
   ;;
esac
if grep -Eq 'Process: app\.penlia\.mobile\.preview.*FATAL|ReactNativeJS.*(TypeError|ReferenceError)' "$results/logcat.txt"; then exit 1; fi
echo "PASS $3" >> "$results/checks.txt"
