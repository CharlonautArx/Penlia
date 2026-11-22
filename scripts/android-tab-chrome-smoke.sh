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



assert_top() {
  python3 - "$results/ui.xml" "$1" "$2" <<'PY'
import re,sys
from xml.etree.ElementTree import parse
nodes=list(parse(sys.argv[1]).iter('node'))
def bounds(n): return list(map(int,re.findall(r'\d+',n.get('bounds',''))))
assert not any(n.get('text') in {sys.argv[2],'演示'} and bounds(n)[1]<240 for n in nodes),sys.argv[2]
main=next(n for n in nodes if sys.argv[3] in (n.get('text'),n.get('content-desc')))
box=bounds(main)
assert 36<=box[1]<=116, (sys.argv[2],box)
print(sys.argv[2]+': first content '+sys.argv[3]+' at '+str(box))
PY
}
assert_play_alignment() {
  python3 - "$results/ui.xml" <<'PY'
import re,sys
from xml.etree.ElementTree import parse
nodes=list(parse(sys.argv[1]).iter('node'))
def bounds(n): return list(map(int,re.findall(r'\d+',n.get('bounds',''))))
t=next(n for n in nodes if n.get('text')=='线下去处')
b=next(n for n in nodes if n.get('content-desc')=='想去的地方')
c=next(n for n in nodes if (n.get('content-desc') or '').startswith('选择城市，当前'))
tb,bb,cb=map(bounds,(t,b,c))
assert 0<=bb[0]-tb[2]<=10 and bb[2]<cb[0],(tb,bb,cb)
assert bb[1]<=tb[1]<tb[3]<=bb[3] and abs(bb[1]-cb[1])<=2,(tb,bb,cb)
print('Place heading, bookmark and city:',tb,bb,cb)
PY
}

touch "$results/launch.txt"
launch
tap '直接进入演示'
locate 'input:搜索会话' >/dev/null
if [ "$3" = friends ]; then
  tap '好友'
  capture friends 'input:搜索好友'
  assert_top 好友 搜索好友
  python3 - "$results/ui.xml" <<'PY'
import re,sys
from xml.etree.ElementTree import parse
nodes=list(parse(sys.argv[1]).iter('node'))
labels=['添加好友','搜索好友','新的朋友','群聊','我的好友']
bounds=[]
for l in labels:
 n=next(n for n in nodes if l in (n.get('text'),n.get('content-desc')))
 bounds.append(list(map(int,re.findall(r'\d+',n.get('bounds','')))))
a,b,c,d,e=bounds
assert a[2]<b[0] and abs((a[1]+a[3])-(b[1]+b[3]))<=3 and a[2]-a[0]>=94,(a,b)
assert b[3]<=c[1]<d[1]<e[1],bounds
print('Friend header and management rows:',bounds)
PY
  tap 'input:搜索好友'
  adb shell input text azhu
  locate '阿竹' >/dev/null
  ! grep -Fq 'content-desc="和小满聊天"' "$results/ui.xml" || fail
  tap '清空搜索'
  locate '和小满聊天' >/dev/null
  adb shell input keyevent 4
  tap 'button:添加好友'
  capture add-friend 'input:好友账号'
  tap 'input:好友账号'
  adb shell input text zhouzhou
  adb shell input keyevent 4
  tap '查找'
  tap '发送申请'
  locate '已有好友申请' >/dev/null
  tap '关闭'
  tap '新的朋友'
  locate '等待接受' >/dev/null
  tap '关闭'
  tap '群聊'
  locate '我加入的群聊' >/dev/null
  adb shell input keyevent 4
  tap '和小满聊天'
  locate 'input:消息' >/dev/null
  adb shell input keyevent 4
  tap '聊天'
  locate 'input:搜索会话' >/dev/null
  echo 'Passed Friends header, independent plus, local search, clear, lookup and request, groups and direct chat.' | tee -a "$results/checks.txt"
else
  tap '玩乐'
  capture play '一起'
  assert_top 玩乐 一起
  assert_play_alignment
  tap '想去的地方'
  capture saved 'prefix:在去处详情点收藏'
  adb shell input keyevent 4
  tap '一起'
  locate '约朋友一起玩' >/dev/null
  adb shell input keyevent 4
  tap '选择城市，当前上海'
  tap '杭州'
  locate '选择城市，当前杭州' >/dev/null
  tap '咖啡'
  locate '精选好去处' >/dev/null
  tap '我的'
  capture me '查看个人资料'
  assert_top 我的 查看个人资料
  tap '查看个人资料'
  locate '个人资料' >/dev/null
  adb shell input keyevent 4
  tap '编辑资料'
  locate 'input:昵称' >/dev/null
  tap '关闭'
  adb shell input swipe 430 1210 430 420 420
  adb shell input swipe 430 1180 430 480 420
  tap '通用设置'
  capture settings '朋聊' || fail
  tap '关闭'
  tap '动态'
  locate '好友动态' >/dev/null
  tap '聊天'
  locate 'input:搜索会话' >/dev/null
  echo 'Passed Play header, bookmark, city, filter and Together; Me profile, edit and General Settings; all tab destinations.' | tee -a "$results/checks.txt"
fi
if grep -Eq 'AndroidRuntime.*Process: app\.penlia\.mobile\.preview|Fatal signal.*>>> app\.penlia\.mobile\.preview' "$results/logcat.txt"; then fail; fi
