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
swipe_thread() {
  local xy x y
  xy=$(locate "prefix:$1，")
  read -r x y <<< "$xy"
  adb shell input swipe 492 "$y" 82 "$y" 410
}
expect_missing() {
  adb shell uiautomator dump /sdcard/penlia-smoke.xml >/dev/null
  adb pull /sdcard/penlia-smoke.xml "$results/ui.xml" >/dev/null
  if grep -Fq "$1" "$results/ui.xml"; then echo "Unexpected element: $1"; fail; fi
}
order() {
  locate "prefix:$1，" >/dev/null
  python3 - "$results/ui.xml" "$@" <<'PY'
import re, sys
from xml.etree.ElementTree import parse
entries={}
for node in parse(sys.argv[1]).iter('node'):
    desc=node.get('content-desc','')
    for name in sys.argv[2:]:
        if desc.startswith(name+'，'):
            entries[name]=int(re.findall(r'\d+',node.get('bounds'))[1])
positions=[entries[n] for n in sys.argv[2:]]
assert positions==sorted(positions) and len(set(positions))==len(positions), (positions, entries)
PY
}
touch "$results/launch.txt"
adb shell cmd connectivity airplane-mode enable
adb shell svc wifi disable
adb shell svc data disable
set -x
launch
tap 直接进入
tap 'tab:好友'
capture 01-friends-all 阿竹
adb shell input swipe 466 720 75 720 800 &
drag_pid=$!
sleep .44
adb exec-out screencap -p > "$results/02-friends-drag.png"
wait "$drag_pid"
capture 03-friends-group 管理分组
adb shell input swipe 466 720 75 720 380
capture 04-group-chats 待确认的邀请
locate 周日看展 >/dev/null
locate 周末散步 >/dev/null
locate 创建群聊 >/dev/null
tap 周末散步
locate 周末散步 >/dev/null
back
locate 待确认的邀请 >/dev/null
adb shell input swipe 80 710 460 710 380
locate 管理分组 >/dev/null
adb shell input swipe 80 720 460 720 380
locate 阿竹 >/dev/null
tap 'Y 段好友'
locate 余橙 >/dev/null
tap 'A 段好友'
locate 阿竹 >/dev/null
tap 群聊
locate 待确认的邀请 >/dev/null
tap 全部
locate 阿竹 >/dev/null

tap 'tab:聊天'
xy=$(locate 'prefix:林鹿，')
read -r x y <<< "$xy"
adb shell input swipe 490 "$y" 461 "$y" 400
sleep 0.4
expect_missing '不显示'
swipe_thread 林鹿
capture 05-conversation-actions 不显示
locate 置顶 >/dev/null
locate 标为未读 >/dev/null
xy=$(locate 不显示)
read -r x y <<< "$xy"
adb shell input swipe 130 "$y" 463 "$y" 380
sleep 0.45
expect_missing '不显示'
swipe_thread 林鹿
tap 置顶
order 林鹿 小满
swipe_thread 阿竹
tap 置顶
order 阿竹 林鹿 小满
swipe_thread 阿竹
tap 取消置顶
order 林鹿 小满 阿竹
swipe_thread 沈言
tap 标为未读
locate 'prefix:沈言，已标为未读' >/dev/null
swipe_thread 林鹿
tap 不显示
sleep 0.6
expect_missing '林鹿，'
launch
tap 'tab:聊天'
locate 'prefix:沈言，已标为未读' >/dev/null
expect_missing '林鹿，'
tap 'prefix:沈言，'
locate 'input:消息' >/dev/null
back
locate 搜索会话 >/dev/null
expect_missing '沈言，已标为未读'
tap 'input:搜索会话'
adb shell input text linlu
capture 06-search-restore 恢复显示
tap 'prefix:林鹿，'
locate '昨天的照片洗出来了，给你留了一张。' >/dev/null
tap 返回
tap 恢复显示
sleep 0.6
expect_missing '恢复显示'
tap 'input:搜索会话'
adb shell input keyevent KEYCODE_MOVE_END
for _ in $(seq 1 5); do adb shell input keyevent KEYCODE_DEL; done
back
order 林鹿 小满 阿竹

swipe_thread 林鹿
locate 不显示 >/dev/null
swipe_thread 小满
locate 标为已读 >/dev/null
python3 - "$results/ui.xml" <<'PYCODE'
import sys
from xml.etree.ElementTree import parse
assert sum(n.get('content-desc') == '不显示' for n in parse(sys.argv[1]).iter('node')) == 1
PYCODE
tap 标为已读
expect_missing '小满，3 条未读消息'
swipe_thread 林鹿
locate 不显示 >/dev/null
adb shell input swipe 233 820 224 450 500
sleep 0.5
expect_missing '不显示'
if grep -E 'FATAL EXCEPTION|ReactNativeJS.*(TypeError|ReferenceError)' "$results/logcat.txt"; then exit 1; fi
echo 'Passed native pager swipes/clicks, contacts index and group invitations, row exclusivity, pin order, unread state, hide, recover and restart' | tee -a "$results/checks.txt"
