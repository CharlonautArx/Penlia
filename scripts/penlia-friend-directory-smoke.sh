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
open_groups() { tap 分组; }
open_owner() { tap 'tab:我的'; tap 查看个人资料; tap 个人主页; }
open_edit() { tap 好友设置; tap 备注与分组; }
make_group() {
  tap 新建分组
  locate 'input:分组名称' >/dev/null
  adb shell input text "$1"
  tap "button:保存分组"
  locate "重命名$1" >/dev/null
}
check_rail() {
  local rect
  rect=$(locate 'A 段好友')
  local x y
  read -r x y <<< "$rect"
  adb shell input swipe "$x" "$y" "$x" "$((y+145))" 535
  sleep .5
  locate 小满 >/dev/null
  tap 'A 段好友'
  locate 阿竹 >/dev/null
}
touch "$results/launch.txt"
set -x
adb shell cmd connectivity airplane-mode enable
adb shell svc wifi disable
adb shell svc data disable
launch
tap 直接进入
tap 'tab:好友'
capture 01-all-friends 阿竹
check_rail
adb shell input swipe 220 400 220 950 440
sleep .6
open_groups
capture 02-default-group '我的好友，9 位好友'
tap 管理分组
make_group Vacation
make_group Family
tap 上移Family
tap 重命名Vacation
tap 'input:分组名称'
adb shell input keyevent --longpress KEYCODE_MOVE_END
for i in $(seq 1 8); do adb shell input keyevent KEYCODE_DEL; done
adb shell input text Travel
tap "button:保存分组"
locate "重命名Travel" >/dev/null
tap 关闭
tap 阿竹
capture 03-friend-profile '朋聊号 azhu'
if grep -Fq '@azhu' "$results/ui.xml"; then exit 1; fi
tap 发消息
locate 'input:消息' >/dev/null
back
tap 个人空间
locate '动态记录' >/dev/null
back
open_edit
tap 'input:好友备注'
adb shell input text Zeta
back
tap Travel
tap "button:保存备注与分组"
capture 04-remark '昵称 阿竹'
open_edit
tap Family
tap "button:保存备注与分组"
back
locate 'Family，1 位好友' >/dev/null
locate 'Travel，0 位好友' >/dev/null
tap 'Family，1 位好友'
capture 05-grouped Zeta
tap 全部
tap 'Z 段好友'
locate Zeta >/dev/null
adb shell input swipe 224 396 224 965 450
sleep .6
open_owner
capture 06-owner-default '朋聊号 qinghe'
tap 编辑主页背景
seed assets/play/cinema.jpg penlia-own-profile.jpg
tap 从手机相册选择
tap_picker thumbnail
tap 保存主页背景
capture 07-owner-cover '昵称 青禾'
back
back
tap 'tab:动态'
sleep 1
adb exec-out screencap -p > "$results/08-space-unaffected.png"
launch
tap 'tab:好友'
open_groups
locate 'Family，1 位好友' >/dev/null
locate 'Travel，0 位好友' >/dev/null
tap 'Family，1 位好友'
tap Zeta
locate '昵称 阿竹' >/dev/null
back
tap 管理分组
tap 删除Family
tap 确认删除分组
tap 关闭
locate '我的好友，9 位好友' >/dev/null
locate Zeta >/dev/null
open_owner
capture 09-owner-restored '昵称 青禾'
python3 - "$results" <<'PY'
import sys
from pathlib import Path
from PIL import Image, ImageChops
path = Path(sys.argv[1])
def region(name):
    return Image.open(path / name).convert('RGB').crop((30, 190, 510, 322))
default = region('06-owner-default.png')
saved = region('07-owner-cover.png')
restored = region('09-owner-restored.png')
assert ImageChops.difference(default, saved).getbbox(), 'Photo did not replace the default cover'
assert not ImageChops.difference(saved, restored).getbbox(), 'Cover did not survive app restart'
PY
if grep -E 'FATAL EXCEPTION|ReactNativeJS.*(TypeError|ReferenceError)' "$results/logcat.txt"; then exit 1; fi
echo 'Passed offline Android profile, rename, reorder, membership move, delete, chat and profile cover persistence' | tee -a "$results/checks.txt"
adb shell wm size 1200x1500
tap 返回
back
tap 'tab:好友'
if ! locate 'A 段好友' > "$results/wide-rail.txt"; then fail; fi
python3 - "$results/wide-rail.txt" <<'PY'
import sys
from pathlib import Path
x, y = map(int, Path(sys.argv[1]).read_text().split())
assert 1010 <= x <= 1067, (x, y)
PY
capture 10-wide-index 'A 段好友'
