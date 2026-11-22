#!/usr/bin/env bash
set -euo pipefail

apk=$(realpath "$1")
results=$(realpath -m "$2")
package=app.penlia.mobile.preview
mkdir -p "$results"
adb shell wm size 1080x2340
adb shell wm density 432
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

read_bounds() {
  python3 - "$results/ui.xml" "$1" <<'PYTHON'
import re
import sys
from xml.etree.ElementTree import parse

for node in parse(sys.argv[1]).iter('node'):
    if node.get('content-desc') != sys.argv[2]:
        continue
    values = re.findall(r'\d+', node.get('bounds', ''))
    if len(values) == 4:
        print(' '.join(values))
        break
else:
    sys.exit(1)
PYTHON
}

ime_frame() {
  adb shell dumpsys window > "$results/window-$1.txt"
  python3 - "$results/window-$1.txt" <<'PYTHON'
import re
import sys

with open(sys.argv[1]) as f:
    windows = f.read()
tops = []
for line in windows.splitlines():
    if not re.search(r'\b(?:type=ime|mType=ITYPE_IME)\b.*\b(?:mVisible|visible)=true\b', line):
        continue
    r = re.search(r'(?:mFrame|frame)=\[(\d+),(\d+)\]\[(\d+),(\d+)\]', line)
    if r:
        left, top, right, bottom = map(int, r.groups())
        if left == 0 and right == 1080 and bottom - top > 150:
            tops.append(top)
if tops:
    print(min(tops))
PYTHON
}

assert_home() {
  locate 'input:搜索会话' >/dev/null || fail
  python3 - "$results/ui.xml" <<'PY'
import re,sys
from xml.etree.ElementTree import parse
nodes = list(parse(sys.argv[1]).iter('node'))
labels={n.get(f) for n in nodes for f in ('text','content-desc')}
assert labels.isdisjoint({'群聊','发起会话','演示','返回'}), labels
assert not any(n.get('text')=='聊天' and int(re.findall(r'\d+',n.get('bounds'))[1])<240 for n in nodes)
editor=next(n for n in nodes if n.get('content-desc')=='搜索会话' and n.get('class')=='android.widget.EditText')
top=int(re.findall(r'\d+',editor.get('bounds'))[1])
assert 62<=top<165, top
print(f'Chat search starts at y={top}, below the Android status bar, with no app header.')
PY
}

touch "$results/launch.txt"
launch
tap '直接进入演示'
assert_home | tee -a "$results/checks.txt"
capture chats 'prefix:小满，'
tap 'input:搜索会话'
adb shell input text azhu
capture search 'prefix:阿竹，'
top=$(ime_frame search)
read -r left first right last <<< "$(read_bounds '搜索会话')"
test -n "$top" && test "$last" -lt "$top" || fail
grep -q 'text="azhu"[^>]*content-desc="搜索会话"[^>]*focused="true"' "$results/ui.xml" || fail
! grep -q 'content-desc="小满，' "$results/ui.xml" || fail
echo "System IME top=$top; focused search editor [$left,$first][$right,$last]; filtered to 阿竹." | tee -a "$results/checks.txt"
tap '清空搜索'
locate 'prefix:小满，' >/dev/null || fail
adb shell input keyevent 4
locate '好友' >/dev/null || fail
test -z "$(ime_frame search-dismissed)" || fail
tap '好友'
capture friends '我的好友'
python3 - "$results/ui.xml" <<'PY'
import re,sys
from xml.etree.ElementTree import parse
nodes=list(parse(sys.argv[1]).iter('node'))
def bounds(label):
    n=next(n for n in nodes if label in (n.get('content-desc'),n.get('text')))
    return list(map(int,re.findall(r'\d+', n.get('bounds'))))
friend,group,section=map(bounds,('新的朋友','群聊','我的好友'))
assert friend[3]<=group[1]<group[3]<=section[1], (friend,group,section)
assert friend[::2]==group[::2] and abs((friend[3]-friend[1])-(group[3]-group[1]))<=3,(friend,group)
print('Friends management rows match. Bounds:',friend,group,section)
PY
tap '和小满聊天'
locate 'input:消息' >/dev/null || fail
adb shell input keyevent 4
tap '群聊'
capture groups '我加入的群聊'
locate '拒绝邀请' >/dev/null || fail
locate '接受并加入' >/dev/null || fail
tap '创建群聊'
capture group-create 'input:群聊名称'
tap '关闭'
tap '接受并加入'
locate 'input:群消息' >/dev/null || fail
adb shell input keyevent 4
locate '我加入的群聊' >/dev/null || fail
adb shell input keyevent 4
tap '玩乐'
locate '一起' >/dev/null || fail
tap '动态'
locate '好友动态' >/dev/null || fail
tap '我的'
locate '查看个人资料' >/dev/null || fail
for cycle in 2 3 4 5; do
  launch
  assert_home | tee -a "$results/checks.txt"
done
adb shell cmd uimode night yes
capture dark 'input:搜索会话'
if grep -Eq 'AndroidRuntime.*Process: app\.penlia\.mobile\.preview|Fatal signal.*>>> app\.penlia\.mobile\.preview' "$results/logcat.txt"; then fail; fi
echo 'Passed five cold launches, native IME search and clearing, Friends -> group management, single chat, invite acceptance, group creator and all five tabs.' | tee -a "$results/checks.txt"
