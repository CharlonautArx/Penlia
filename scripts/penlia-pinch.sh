set -euo pipefail
out="$1"
tmp=$(mktemp -d)
sdk=$(find "$ANDROID_HOME/platforms" -name android.jar | sort -V | tail -1)
d8=$(find "$ANDROID_HOME/build-tools" -name d8 | sort -V | tail -1)
cat >"$tmp/Pinch.java" <<'JAVA'
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.InputEvent;
import android.view.MotionEvent;
import java.lang.reflect.Method;
public class Pinch {
  static Method inject;
  static Object device;
  static long start;
  static float cx,cy;
  static void event(int action,int count,float reach) throws Exception {
    MotionEvent.PointerProperties[] pp=new MotionEvent.PointerProperties[count];
    MotionEvent.PointerCoords[] coords=new MotionEvent.PointerCoords[count];
    for(int i=0;i<count;i++){
      pp[i]=new MotionEvent.PointerProperties(); pp[i].id=i; pp[i].toolType=MotionEvent.TOOL_TYPE_FINGER;
      coords[i]=new MotionEvent.PointerCoords(); coords[i].x=cx+(i==0?-reach:reach);coords[i].y=cy;
      coords[i].pressure=1.0f;coords[i].size=0.03f;
    }
    MotionEvent e=MotionEvent.obtain(start,SystemClock.uptimeMillis(),action,count,pp,coords,0,0,1f,1f,0,0,InputDevice.SOURCE_TOUCHSCREEN,0);
    if(!Boolean.TRUE.equals(inject.invoke(device,e,2)))throw new IllegalStateException("Event injection failed");
    e.recycle();
  }
  public static void main(String[] args) throws Exception {
    cx=Float.parseFloat(args[0]);cy=Float.parseFloat(args[1]);
    Class<?> clazz=Class.forName("android.hardware.input.InputManagerGlobal");
    device=clazz.getMethod("getInstance").invoke(null);
    inject=clazz.getMethod("injectInputEvent",InputEvent.class,int.class);
    start=SystemClock.uptimeMillis();event(0,1,23); SystemClock.sleep(50);
    event(5|(1<<8),2,23);
    for(int i=1;i<=30;i++){SystemClock.sleep(25);event(2,2,23+i*3.2f);}
    event(6|(1<<8),2,119);event(1,1,119);
    System.out.println("Two-finger gesture delivered");
  }
}
JAVA
javac -encoding UTF-8 -source 8 -target 8 -classpath "$sdk" -d "$tmp" "$tmp/Pinch.java"
"$d8" --lib "$sdk" --output "$tmp/pinch.jar" "$tmp/Pinch.class"
adb push "$tmp/pinch.jar" /data/local/tmp/pinch.jar >/dev/null
adb shell chmod 444 /data/local/tmp/pinch.jar
adb shell "CLASSPATH=/data/local/tmp/pinch.jar app_process /system/bin Pinch $2 $3" > "$out/pinch.txt"
grep -q 'Two-finger gesture delivered' "$out/pinch.txt"
sleep 1
adb exec-out screencap -p > "$out/13-zoom.png"
python3 - "$out" "$2" "$3" <<'PY'
from pathlib import Path
from PIL import Image,ImageChops,ImageStat
import sys
p=Path(sys.argv[1]);x,y=map(int,sys.argv[2:])
before,after=[Image.open(p/n).convert('RGB').crop((x-110,y-48,x+110,y+48)) for n in ['13-crop.png','13-zoom.png']]
d=ImageStat.Stat(ImageChops.difference(before,after)).mean
print('Average color difference after zoom',d)
assert sum(d)>18,'Image failed to change with a two-finger gesture'
PY
echo 'Native two-pointer pinch and visible change verified before dragging' >> "$out/checks.txt"
