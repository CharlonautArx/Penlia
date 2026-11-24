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
  sleep 3
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
case "${3:-chat}" in
 chat)
   tap 'prefix:小满，'
   tap 'input:消息'
   adb shell input text DualMarksQA
   long_press 发送
   tap 安静发送
   tap 只是分享
   tap 确认发送
   capture 05-chat-marks DualMarksQA
   back
   long_press DualMarksQA
   capture 05-chat-menu 引用
   tap 引用
   locate 取消引用 >/dev/null
   adb shell input text QuoteQA
   tap 发送
   capture 05-quote QuoteQA
   back
   long_press QuoteQA
   tap 多选
   adb shell uiautomator dump /sdcard/penlia-checked.xml >/dev/null
   adb pull /sdcard/penlia-checked.xml "$results/chosen.xml" >/dev/null
   read -r extraX extraY <<<"$(python3 - "$results/chosen.xml" <<'INNER'
import re,sys,xml.etree.ElementTree as E
def rect(value):return list(map(int,re.findall(r'\d+',value)))
result=[rect(x.get('bounds','')) for x in E.parse(sys.argv[1]).iter('node')
        if x.get('content-desc')=='选择消息' and x.get('checked')!='true']
best=sorted((b for b in result if b[3]>400 and b[1]<990 and b[3]-b[1]>40),key=lambda b:b[3],reverse=True)[0]
print(30,(best[1]+best[3])//2)
INNER
)"
   adb shell input tap "$extraX" "$extraY"
   locate 'prefix:已选 2 条' >/dev/null
   capture 05-selection 退出多选
   tap 转发
   tap 合并转发
   tap 阿竹
   tap button:确认转发
   locate QuoteQA >/dev/null
   long_press QuoteQA
   tap 删除
   tap 确认删除
   locate DualMarksQA >/dev/null
   back
   capture 03-preview 'prefix:小满，'
   tap 'prefix:阿竹，'
   tap 查看聊天记录
   capture 05-record QuoteQA
   launch
   tap 'prefix:小满，'
   locate DualMarksQA >/dev/null
   if grep -q 'text="QuoteQA"' "$results/ui.xml"; then echo 'Deleted message reappeared after restart'; fail; fi
   echo 'Local deletion persisted after restart' >> "$results/checks.txt"
   ;;
 moments)
   tap 'tab:动态'
   capture 04-header '最近在收集好喝的店。'
   adb shell input swipe 275 915 275 480 430
   tap 查看动态详情
   capture 01-detail 动态详情
   tap 'input:评论内容'
   adb shell input text CommentQA
   tap 发送
   adb shell input swipe 270 890 270 415 400
   capture 01-comment 'prefix:青禾：CommentQA'
   tap 'prefix:青禾：CommentQA'
   capture 01-reply-composer 'input:回复：青禾'
   adb shell input text ReplyQA
   tap 发送
   adb shell input swipe 230 980 230 490 450
   capture 01-thread 'prefix:青禾：ReplyQA'
   ;;
 audience)
   tap 'tab:动态'
   tap 发布动态
   tap 发布动态
   tap 'prefix:可见范围'
   tap 指定好友
   adb shell input swipe 270 945 270 530 450
   capture 02-groups 我的好友
   tap '选择整组 我的好友'
   capture 02-selected 'prefix:已选'
   adb shell input swipe 270 938 270 360 430
   adb shell input swipe 270 938 270 360 430
   tap '确认这个范围'
   ;;
esac
if grep -E 'FATAL EXCEPTION|Fatal signal.*app.penlia|ReactNativeJS.*(TypeError|ReferenceError)' "$results/logcat.txt"; then exit 1; fi
echo "PASS $3" >> "$results/checks.txt"
