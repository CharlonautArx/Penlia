#!/usr/bin/env bash
set -euo pipefail

apk=$(realpath "$1")
results=$(realpath -m "$2")
package=app.penlia.mobile.preview
mkdir -p "$results"
adb shell wm size 720x1600
adb shell wm density 320
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
        if left == 0 and right == 720 and bottom - top > 150:
            tops.append(top)
if tops:
    print(min(tops))
PYTHON
}

assert_ime_open() {
  local name="$1" editor="$2" top bounds left first right last
  locate "input:$editor" >/dev/null || fail
  top=$(ime_frame "$name")
  [ -n "$top" ] || { echo "Missing a visible system IME frame ($name)" >&2; fail; }
  for label in "$editor" '发送' "$3" "$4" '表情'; do
    bounds=$(read_bounds "$label") || fail
    read -r left first right last <<< "$bounds"
    if [ "$first" -ge "$last" ] || [ "$last" -gt "$top" ] || { [ "$label" = "发送" ] && [ "$((top-last))" -gt 80 ]; }; then
      echo "$name $label $bounds, keyboard starts at $top" >&2
      fail
    fi
  done
  echo "$name: keyboardTop=$top; editor=$(read_bounds "$editor"); send=$(read_bounds '发送')" | tee -a "$results/checks.txt"
  adb exec-out screencap -p > "$results/$name.png"
}


require_ime() { assert_ime_open "$1" 消息 添加 从图库选择图片; }
dismiss() { adb shell input keyevent 4; locate 'input:消息' >/dev/null; }

launch_chat() { tap 'prefix:小满，'; locate 'input:消息' >/dev/null; }
dump() { adb shell uiautomator dump /sdcard/penlia-smoke.xml >/dev/null; adb pull /sdcard/penlia-smoke.xml "$results/ui.xml" >/dev/null; }

long_send() {
  local xy
  xy=$(locate '发送') || fail
  read -r x y <<< "$xy"
  adb shell input swipe "$x" "$y" "$x" "$y" 520
  locate '确认发送' >/dev/null
}

assert_menu() {
  local draft="$1" quiet="$2" sharing="$3"
  dump
  python3 - "$results/ui.xml" "$draft" "$quiet" "$sharing" <<'PYCHECK'
import re,sys
from xml.etree.ElementTree import parse

nodes=list(parse(sys.argv[1]).iter('node'))
def found(label):
    return next((n for n in nodes if label in (n.get('text'), n.get('content-desc'))), None)
edit=next(n for n in nodes if n.get('class') == 'android.widget.EditText')
assert edit.get('text') == sys.argv[2], (edit.attrib, sys.argv[2])
for label,expected in [('安静发送',sys.argv[3]),('只是分享',sys.argv[4])]:
    node=next(n for n in nodes if n.get('content-desc') == label and n.get('checkable') == 'true')
    assert node.get('checked') == expected, (label,node.attrib)
def b(node): return [int(i) for i in re.findall(r'\d+', node.get('bounds'))]
assert b(found('确认发送'))[3] < b(edit)[1], (found('确认发送').attrib,edit.attrib)
assert len([n for n in nodes if n.get('text') == sys.argv[2]]) == 1
PYCHECK
  test -n "$(ime_frame menu-insets)"
}

assert_sent() {
  local body="$1" share="$2" quiet="$3"
  locate "$body" >/dev/null
  python3 - "$results/ui.xml" "$body" "$share" "$quiet" <<'PYCHECK'
import sys
from xml.etree.ElementTree import parse

tree=parse(sys.argv[1])
parent={c:n for n in tree.iter('node') for c in n}
nodes=[n for n in tree.iter('node') if n.get('text') == sys.argv[2] and n.get('class') != 'android.widget.EditText']
assert len(nodes) == 1, [n.attrib for n in nodes]
bubble=next((n for n in (nodes[0],parent[nodes[0]],parent[parent[nodes[0]]]) if n.get('long-clickable')=='true'),parent[nodes[0]])
labels={v for n in bubble.iter('node') for v in (n.get('text'),n.get('content-desc'))}
assert ('只是分享' in labels) == (sys.argv[3]=='true'), labels
assert ('安静送达' in labels) == (sys.argv[4]=='true'), labels
PYCHECK
}

touch "$results/launch.txt"
launch
tap '直接进入'
launch_chat
tap 'input:消息'
adb shell input text 'ordinary'
tap '发送'
assert_sent ordinary false false

tap 'input:消息'
adb shell input text 'quiet-only'
long_send
assert_menu quiet-only false false
tap '安静发送'
assert_menu quiet-only true false
capture quiet-highlight '确认发送'
tap '确认发送'
assert_sent quiet-only false true

tap 'input:消息'
adb shell input text 'sharing-only'
long_send
assert_menu sharing-only false false
tap '安静发送'
tap '只是分享'
tap '安静发送'
assert_menu sharing-only false true
capture sharing-highlight '确认发送'
tap '确认发送'
assert_sent sharing-only true false

tap 'input:消息'
adb shell input text 'both-modes'
long_send
tap '安静发送'
tap '只是分享'
assert_menu both-modes true true
capture both-with-ime '确认发送'
adb shell input tap 46 390
locate 'input:消息' >/dev/null
! grep -Fq 'content-desc="确认发送"' "$results/ui.xml"
long_send
assert_menu both-modes false false
tap '安静发送'
adb shell input keyevent 4
sleep 0.4
locate 'input:消息' >/dev/null
! grep -Fq 'content-desc="确认发送"' "$results/ui.xml"
tap 'input:消息'
long_send
assert_menu both-modes false false
tap '安静发送'
tap '只是分享'
tap '确认发送'
assert_sent both-modes true true

tap 'input:消息'
adb shell input text 'reset-ordinary'
long_send
assert_menu reset-ordinary false false
tap '确认发送'
assert_sent reset-ordinary false false
adb shell input keyevent 4
sleep 1
adb shell am force-stop "$package"
adb shell am start -W -n "$package/.MainActivity" >> "$results/launch.txt"
launch_chat
assert_sent both-modes true true
assert_sent sharing-only true false
capture restored 'both-modes'
if grep -Eq 'AndroidRuntime.*Process: app\.penlia\.mobile\.preview|Fatal signal.*>>> app\.penlia\.mobile\.preview' "$results/logcat.txt"; then fail; fi
echo 'PASS ordinary and all four confirmation modes, independent toggles, outside and Back, live keyboard/draft, restart history.' | tee -a "$results/checks.txt"
