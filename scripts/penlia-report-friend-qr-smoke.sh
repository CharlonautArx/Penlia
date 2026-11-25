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

field() {
  tap "input:$1"
  adb shell input keyevent KEYCODE_MOVE_END
  adb shell input keyevent KEYCODE_DEL
  adb shell input text "$2"
  back
}

launch
tap "直接进入"
capture 00-cold-start "tab:好友"

case "${3:-report}" in
  report)
    seed assets/demo/person-1.jpg penlia-report-proof.jpg
    route 'chat/demo-azhu'
    tap "聊天设置"
    capture 01-chat-settings "举报"
    tap "举报"
    capture 02-empty-report-selection "prefix:举报 · 已选"
    tap "选择消息"
    tap "下一步"
    capture 03-report-reasons "生活边界保护计划"
    for reason in 色情低俗 政治谣言 广告引流 欺诈骗钱 暴力恐怖 违法违规 自杀自残 营销水军; do
      locate "$reason" >/dev/null
    done
    tap "生活边界保护计划"
    tap "input:补充说明（选填）"
    adb shell input text 'Android-proof'
    back
    tap "从相册添加"
    tap_picker thumbnail
    capture 04-report-photo "预览举报配图"
    adb shell input swipe 275 1050 275 415 430
    sleep .6
    tap "预览提交内容"
    capture 05-report-review "Android-proof"
    adb shell input swipe 275 1050 275 485 350
    sleep .5
    tap "提交举报"
    capture 06-report-complete "举报完成"
    tap "完成"
    route 'boundary'
    tap "生活边界保护计划"
    capture 07-report-detail "Android-proof"
    back
    tap "删除举报记录"
    tap "确认删除记录"
    locate "暂无举报记录。" >/dev/null
    launch
    route 'boundary'
    capture 08-persistent-history-deletion "暂无举报记录。"
    route 'group/preview-weekend'
    tap "聊天设置"
    capture 09-group-settings "群资料和邀请"
    tap "举报"
    capture 10-group-report-selection "prefix:举报 · 已选"
    tap "选择消息"
    tap "下一步"
    tap "广告引流"
    tap "预览提交内容"
    tap "提交举报"
    tap "完成"
    route 'boundary'
    capture 11-other-categories-excluded "暂无举报记录。"
    ;;
  friends)
    tap "tab:好友"
    tap "好友申请"
    capture 01-request-tabs "收到的申请"
    tap "桃子"
    capture 02-public-profile "好友申请验证消息"
    if grep -Fq '朋聊号' "$results/ui.xml"; then echo 'restricted handle was displayed'; exit 1; fi
    tap "接受"
    capture 03-authorized-profile "发消息"
    route 'my-qr'
    field "有效期（1–30 天）" 30
    tap "生成二维码"
    capture 04-active-qr "prefix:有效至"
    tap "保存至相册"
    capture 05-saved-qr "二维码已保存到相册。"
    adb shell content query --uri content://media/external/images/media --projection _display_name > "$results/gallery.txt"
    grep -F 'Penlia-QR-' "$results/gallery.txt"
    tap "分享二维码"
    sleep 3
    adb shell dumpsys activity activities > "$results/sharesheet.txt"
    grep -Ei "mResumedActivity.*(Chooser|Resolver)|topResumedActivity.*(Chooser|Resolver)" "$results/sharesheet.txt"
    adb exec-out screencap -p > "$results/06-system-image-share.png"
    back
    launch
    route 'my-qr'
    capture 07-persisted-qr "prefix:有效至"
    tap "重新生成二维码"
    locate "prefix:有效至" >/dev/null
    tap "使当前二维码失效"
    tap "确认失效"
    capture 08-revoked "暂无有效的好友二维码。"
    adb shell pm grant "$package" android.permission.CAMERA
    route 'friends'
    tap "添加好友"
    tap "扫码添加"
    capture 09-open-scanner "输入识别码"
    tap "input:输入识别码"
    adb shell input text 'penlia:add:ba43afd7c9ee723da034ef7340ab1c98'
    tap "查找识别码"
    capture 10-scanned-public-profile "周周"
    tap "input:验证消息（选填）"
    adb shell input text 'Android-QR-request'
    back
    tap "发送好友申请"
    locate "已提交好友申请，等待对方处理。" >/dev/null
    route 'friend-requests'
    tap "发出的申请"
    capture 11-outgoing-request "周周"
    ;;
  features)
    tap "tab:玩乐"
    adb shell input swipe 260 1025 260 430 420
    capture 01-compact-places "查看白釉制物室"
    route 'world?kind=world'
    capture 02-world-only "创建共同世界"
    if grep -Fq '瞬间共鸣' "$results/ui.xml"; then echo 'duplicate feature switch'; exit 1; fi
    route 'world?kind=relay'
    capture 03-relay-entry "发起接力"
    route 'social?section=collections'
    capture 04-collected-records "新建共同日记"
    if grep -Fq '心愿共振' "$results/ui.xml"; then echo 'duplicate feature switch'; exit 1; fi
    route 'social?section=events'
    capture 05-events-entry "邀请与消息"
    ;;
  *) exit 2 ;;
esac
assert_pid
if grep -E 'FATAL EXCEPTION|ReactNativeJS.*(TypeError|ReferenceError)' "$results/logcat.txt" | grep -vE 'com\.android|com\.google'; then
  fail
fi
