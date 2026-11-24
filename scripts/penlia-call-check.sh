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

tap 'prefix:小满，'
open_call 语音通话
capture voice-ringing 等待对方接听
tap 模拟对方接听
capture voice-active 模拟通话中
tap 静音
locate 取消静音 >/dev/null
tap 切到扬声器
locate 切回听筒 >/dev/null
adb shell dumpsys audio >"$results/call-speaker-audio.txt"
tap 挂断
locate 添加 >/dev/null
adb shell dumpsys audio >"$results/call-ended-audio.txt"
open_call 视频通话
capture video-ringing 等待对方接听
tap 模拟对方接听
capture video-connected '模拟通话中 · 暂无远端画面'
if ! adb shell dumpsys package "$package" | grep 'android.permission.CAMERA: granted=true' >/dev/null; then
  tap 开启本机预览
  tap resource:permission_deny_button
  capture camera-denied '摄像头权限未开启，可在设备设置中允许。'
fi
adb shell pm grant "$package" android.permission.CAMERA
tap 开启本机预览
capture video-camera 本机预览
read -r sx sy <<<"$(locate 本机预览)"
adb shell input swipe "$sx" "$sy" "$((sx / 2))" "$((sy + 70))" 550
read -r ex ey <<<"$(locate 本机预览)"
if (( ex == sx && ey == sy )); then echo "Camera preview did not move" >&2; exit 1; fi
capture video-drag 本机预览
tap 切换前后摄像头
tap 模拟选项
tap 模拟网络切换
capture video-network '网络变化，正在重新连接'
tap 模拟选项
tap 模拟网络恢复
locate '模拟通话中 · 暂无远端画面' >/dev/null
adb shell input keyevent KEYCODE_HOME
sleep 2
adb shell dumpsys activity activities >"$results/call-pip-activity.txt"
python3 - "$results/call-pip-activity.txt" "$package" <<'PY'
import sys
lines=open(sys.argv[1]).read().splitlines()
for i,line in enumerate(lines):
    if 'mode=pinned' in line.lower() or 'windowingmode=pinned' in line.lower():
        block='\n'.join(lines[i:i+18])
        if sys.argv[2] in block: print(line.strip()); break
else: raise SystemExit('Android did not report a pinned activity for the call')
PY
adb exec-out screencap -p >"$results/call-system-pip.png"
echo "call-pip: pinned task verified with dumpsys" >>"$results/checks.txt"
adb shell am start -W -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -n "$package/.MainActivity" >"$results/call-expand.txt"
capture expanded 挂断
tap 关闭摄像头
locate 开启本机预览 >/dev/null
tap 挂断
locate 添加 >/dev/null
adb shell input keyevent KEYCODE_BACK
locate 搜索会话 >/dev/null
echo "PASS: call controls, network simulation, camera drag, PiP and hang-up" >>"$results/checks.txt"

# Keep the system photo picker scenario optional for runners without seeded media.
if [[ ${CALL_CHECK_WALLPAPER:-0} == 1 ]]; then
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
  locate 搜索会话 >/dev/null
  echo "PASS: independent offline call wallpaper and chat wallpaper" >>"$results/checks.txt"
fi
