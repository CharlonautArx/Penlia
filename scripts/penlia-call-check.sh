#!/usr/bin/env bash
# Usage: bash call-check.sh RESULTS_DIR (already signed in, on the chat tab).
set -Eeuo pipefail
results=${1:-${results:?results directory required}}
mkdir -p "$results"
package=app.penlia.mobile.preview
tree=$results/call-ui.xml
failure() {
  adb exec-out screencap -p >"$results/call-failure.png" || true
  adb shell dumpsys activity activities >"$results/call-failure-activities.txt" || true
  echo "Call smoke failed at line $1" >&2
}
trap 'failure "$LINENO"' ERR

locate() {
  local key=$1 xy
  for i in $(seq 1 8); do
    if adb shell uiautomator dump /sdcard/penlia-call-ui.xml >/dev/null 2>&1 &&
       adb exec-out cat /sdcard/penlia-call-ui.xml >"$tree"; then
      xy=$(python3 - "$tree" "$key" <<'PY'
import re,sys,xml.etree.ElementTree as ET
k=sys.argv[2]
try: nodes=ET.parse(sys.argv[1]).iter('node')
except ET.ParseError: sys.exit()
for n in nodes:
    values=[n.get('text','').strip(),n.get('content-desc','').strip()]
    if k.startswith('prefix:'): match=any(v.startswith(k[7:]) for v in values)
    elif k=='picker-thumbnail':
        match = n.get('resource-id','').split('/')[-1] in {'icon_thumbnail','image_thumbnail','photo_thumbnail'} or any(
            v.startswith(('Photo taken','Photo from','照片拍摄于')) for v in values)
    elif k.startswith('resource:'): match=n.get('resource-id','').endswith('/'+k[9:])
    else: match=k in values
    if not match: continue
    b=list(map(int,re.findall(r'-?\d+',n.get('bounds',''))))
    if len(b)==4 and b[2]>b[0] and b[3]>b[1]:
        print((b[0]+b[2])//2,(b[1]+b[3])//2)
        break
PY
)
      if [[ -n $xy ]]; then echo "$xy"; return 0; fi
    fi
    sleep 0.5
  done
  echo "Missing $key" >&2
  return 1
}
tap() { local xy; xy=$(locate "$1") || return 1; adb shell input tap $xy; }
capture() {
  locate "$2" >/dev/null
  adb exec-out screencap -p >"$results/call-$1.png"
  echo "call-$1: $2" >>"$results/checks.txt"
}
open_call() { tap 添加; tap "$1"; locate '模拟对方接听' >/dev/null; }

# Keep the system photo picker scenario optional for runners without seeded media.
if [[ ${CALL_CHECK_WALLPAPER:-1} == 1 ]]; then
  asset=${CALL_CHECK_PHOTO:-assets/play/cinema.jpg}
  test -s "$asset"
  adb shell mkdir -p /sdcard/Pictures
  adb push "$asset" /sdcard/Pictures/penlia-call-wallpaper.jpg >/dev/null
  adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE \
    -d file:///sdcard/Pictures/penlia-call-wallpaper.jpg >/dev/null
  # The parent test starts from a clean, signed-in demo account.
  adb shell am start -W -a android.intent.action.VIEW -d penlia-preview://chat-background "$package" >/dev/null
  tap 从手机相册选择
  tap picker-thumbnail
  tap 应用到所有聊天
  locate '已更新全局聊天背景，单独设置优先。' >/dev/null
  adb shell input swipe 270 990 270 430 450
  tap 语音通话背景
  capture wallpaper-default 恢复纯黑背景
  tap 从手机相册选择
  tap picker-thumbnail
  tap 应用到语音通话
  capture wallpaper-saved '已应用到语音通话。'
  adb shell am force-stop "$package"
  adb shell am start -W -a android.intent.action.VIEW -d 'penlia-preview://peer-call?peer=demo-xiaoman\&kind=voice' "$package" >/dev/null
  capture wallpaper-after-restart 等待对方接听
  tap 挂断
  adb shell am start -W -a android.intent.action.VIEW -d 'penlia-preview://chat-background?mode=voice' "$package" >/dev/null
  tap 恢复纯黑背景
  capture wallpaper-restored '已恢复默认背景。'
  adb shell am start -W -a android.intent.action.VIEW -d penlia-preview://chat-background "$package" >/dev/null
  capture chat-wallpaper-retained 恢复默认背景
  tap 恢复默认背景
  adb shell am start -W -a android.intent.action.VIEW -d penlia-preview:/// "$package" >/dev/null
  adb shell am force-stop "$package"
  adb shell am start -W -n "$package/.MainActivity"
  locate 搜索会话 >/dev/null
  echo "PASS: independent offline call wallpaper and chat wallpaper" >>"$results/checks.txt"
fi
