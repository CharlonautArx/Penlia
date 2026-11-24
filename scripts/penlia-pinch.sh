set -euo pipefail
out="$1"
tmp=$(mktemp -d)
sdk=$(find "$ANDROID_HOME/platforms" -name uiautomator.jar | sort -V | tail -1)
d8=$(find "$ANDROID_HOME/build-tools" -name d8 | sort -V | tail -1)
test -f "$sdk"
android=$(dirname "$sdk")/android.jar
cat > "$tmp/CropTest.java" <<'JAVA'
package app.penlia.qa;
import android.graphics.Point;
import android.graphics.Rect;
import com.android.uiautomator.core.UiObject;
import com.android.uiautomator.core.UiSelector;
import com.android.uiautomator.testrunner.UiAutomatorTestCase;
public class CropTest extends UiAutomatorTestCase {
  public void testPinch() throws Exception {
    UiObject frame = new UiObject(new UiSelector().description("主页背景裁切框"));
    assertTrue(frame.exists());
    Rect r = frame.getBounds();
    int x = r.centerX(), y = r.centerY(), radius = r.width() / 3;
    assertTrue(frame.performTwoPointerGesture(new Point(x-22,y), new Point(x+22,y),
        new Point(x-radius,y-12), new Point(x+radius,y+12), 28));
  }
}
JAVA
javac -encoding UTF-8 -source 8 -target 8 -classpath "$sdk:$android:/usr/share/java/junit4.jar" -d "$tmp" "$tmp/CropTest.java"
"$d8" --lib "$android" --classpath "$sdk" --output "$tmp/penlia-crop.jar" "$tmp/app/penlia/qa/CropTest.class"
adb push "$tmp/penlia-crop.jar" /data/local/tmp/penlia-crop.jar >/dev/null
adb shell uiautomator runtest penlia-crop.jar -c app.penlia.qa.CropTest > "$out/pinch.txt"
grep -E 'OK \(1 test\)|OK.*1 test' "$out/pinch.txt"
echo 'Native two-pointer gesture injected' >> "$out/checks.txt"
