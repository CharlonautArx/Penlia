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
case "${3:-chat}" in
 chat)
   read -r _ row <<< "$(locate 'prefix:小满，')"
   start_clip messages
   adb shell input swipe 480 "$row" 120 "$row" 400
   capture 01-actions 置顶
   tap 置顶
   capture 01-pinned 'prefix:小满，置顶'
   tap 'prefix:小满，置顶'
   tap 'input:消息'
   adb shell input text Penlia1124
   read -r sx sy <<< "$(locate 发送)"
   adb shell input swipe "$sx" "$sy" "$sx" "$sy" 580
   tap 只是分享
   tap 安静发送
   tap 确认发送
   capture 05-both Penlia1124
   stop_clip messages
   tap 查看小满的资料
   capture 08-profile 昵称：小满
   locate 朋聊号：xiaoman >/dev/null
   ;;
 call)
   CALL_CHECK_WALLPAPER=1 bash scripts/penlia-call-check.sh "$results"
   ;;
 group)
   tap 'tab:好友'
   tap 群聊
   capture 06-invitations 待确认的邀请
   tap 周日看展
   capture 06-preview 群成员
   tap 关闭
   adb shell pm grant "$package" android.permission.CAMERA
   tap 扫描群邀请
   capture 07-scanner 'input:输入识别码'
   tap 'input:输入识别码'
   adb shell input text invalid
   tap 查找识别码
   capture 07-invalid 这不是当前可用的朋聊二维码。
   tap 关闭识别
   tap 接受
   capture 06-joined 群资料和邀请
   tap 群资料和邀请
   capture 06-joined-members 群成员
   tap 关闭
   tap 返回
   tap 周末散步
   tap 群资料和邀请
   seed assets/play/cinema.jpg penlia-group.jpg
   tap 周末散步
   tap_picker thumbnail
   capture 06-avatar 群成员
   ;;
 space)
   tap 'tab:动态'
   capture 11-bell 动态消息
   tap 动态消息
   capture 11-inbox 模拟本机互动
   tap 返回
   tap 查看我的动态
   capture 10-timeline 发布私密动态
   python3 - "$results/ui.xml" <<'INNER'
import sys,xml.etree.ElementTree as ET
labels={v for n in ET.parse(sys.argv[1]).iter('node') for v in (n.get('text'),n.get('content-desc'))}
assert not labels.intersection({'本机旧动态','动态记录','相册','日志'}),labels
INNER
   tap 返回
   tap 相册
   capture 14-albums 管理分类
   tap 管理分类
   tap 新建分类
   tap 'input:分类名称'
   adb shell input text Weekends
   tap 'input:分类简介'
   adb shell input text Walks
   back
   tap 保存分类
   locate Weekends >/dev/null
   tap 关闭
   tap 慢慢过的日子
   tap 相册菜单
   tap 相册分类
   tap Weekends
   capture 14-assigned Weekends
   tap 返回
   tap Weekends
   capture 14-filtered 慢慢过的日子
   launch
   tap 'tab:动态'
   tap 相册
   tap Weekends
   capture 14-restored 慢慢过的日子
   tap 管理分类
   tap Weekends
   tap 删除分类
   tap 确认删除分类
   tap 关闭
   capture 14-preserved 慢慢过的日子
   ;;
 crop)
   tap 'tab:我的'
   tap 查看个人资料
   tap 个人主页
   capture 13-original 昵称：青禾
   tap 编辑主页背景
   seed assets/play/cinema.jpg penlia-profile.jpg
   tap 从手机相册选择
   tap_picker thumbnail
   capture 13-crop '拖动照片调整位置，双指缩放。'
   read -r cx cy <<< "$(locate '主页背景裁切框')"
   bash scripts/penlia-pinch.sh "$results" || echo "Multi-touch injection unavailable on this emulator" >> "$results/checks.txt"
   adb shell input swipe "$cx" "$cy" "$((cx + 65))" "$((cy + 32))" 420
   capture 13-composition '主页背景裁切框' 
   tap 保存主页背景
   capture 13-saved 编辑主页背景
   launch
   tap 'tab:我的'
   tap 查看个人资料
   tap 个人主页
   capture 13-restart 编辑主页背景
   python3 - "$results" <<'INNER'
from PIL import Image,ImageChops
from pathlib import Path
import sys
d=Path(sys.argv[1])
def section(name): return Image.open(d/(name+'.png')).convert('RGB').crop((30,230,510,334))
assert ImageChops.difference(section('13-original'), section('13-saved')).getbbox()
assert not ImageChops.difference(section('13-restart'), section('13-saved')).getbbox()
INNER
   ;;
esac
if grep -E 'FATAL EXCEPTION|Fatal signal.*app.penlia|ReactNativeJS.*(TypeError|ReferenceError)' "$results/logcat.txt"; then exit 1; fi
echo "PASS $3" >> "$results/checks.txt"
