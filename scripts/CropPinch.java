import android.os.SystemClock;
import android.view.InputDevice;
import android.view.InputEvent;
import android.view.MotionEvent;
import java.lang.reflect.Method;

public final class CropPinch {
    private final Object manager;
    private final Method inject;
    private final long down = SystemClock.uptimeMillis();
    private final MotionEvent.PointerProperties[] points = new MotionEvent.PointerProperties[2];
    private final MotionEvent.PointerCoords[] coords = new MotionEvent.PointerCoords[2];

    private CropPinch() throws Exception {
        Class<?> type = Class.forName("android.hardware.input.InputManagerGlobal");
        manager = type.getMethod("getInstance").invoke(null);
        inject = type.getMethod("injectInputEvent", InputEvent.class, int.class);
        for (int i = 0; i < 2; i++) {
            points[i] = new MotionEvent.PointerProperties();
            points[i].id = i;
            points[i].toolType = MotionEvent.TOOL_TYPE_FINGER;
            coords[i] = new MotionEvent.PointerCoords();
            coords[i].pressure = 1;
            coords[i].size = .15f;
        }
    }

    private void send(int action, int count, float x, float y, float radius) throws Exception {
        coords[0].x = x - radius;
        coords[1].x = x + radius;
        coords[0].y = coords[1].y = y;
        MotionEvent event = MotionEvent.obtain(down, SystemClock.uptimeMillis(), action, count, points, coords,
            0, 0, 1, 1, 0, 0, InputDevice.SOURCE_TOUCHSCREEN, 0);
        try {
            if (!Boolean.TRUE.equals(inject.invoke(manager, event, 1))) throw new IllegalStateException("Test pinch rejected");
        } finally {
            event.recycle();
        }
    }

    public static void main(String[] args) throws Exception {
        float x = Float.parseFloat(args[0]), y = Float.parseFloat(args[1]);
        CropPinch input = new CropPinch();
        input.send(MotionEvent.ACTION_DOWN, 1, x, y, 58);
        SystemClock.sleep(75);
        input.send(MotionEvent.ACTION_POINTER_DOWN | (1 << MotionEvent.ACTION_POINTER_INDEX_SHIFT), 2, x, y, 58);
        for (int i = 1; i <= 30; i++) {
            input.send(MotionEvent.ACTION_MOVE, 2, x + i * .7f, y + i * .1f, 58 + i * 3.2f);
            SystemClock.sleep(17);
        }
        input.send(MotionEvent.ACTION_POINTER_UP | (1 << MotionEvent.ACTION_POINTER_INDEX_SHIFT), 2, x + 21, y + 3, 154);
        input.send(MotionEvent.ACTION_UP, 1, x + 21, y + 3, 154);
    }
}
