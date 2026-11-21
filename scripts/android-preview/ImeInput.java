package app.penlia.preview.tests;

import android.app.Activity;
import android.app.Instrumentation;
import android.os.Bundle;
import android.view.accessibility.AccessibilityNodeInfo;

/** Inserts Unicode using Android's accessibility action with the system keyboard up. */
public final class ImeInput extends Instrumentation {
    @Override public void onCreate(Bundle arguments) {
        start();
    }

    @Override public void onStart() {
        var response = new Bundle();
        try {
            var root = getUiAutomation().getRootInActiveWindow();
            var field = root == null ? null : root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
            if (field == null || !"android.widget.EditText".contentEquals(field.getClassName())) {
                throw new IllegalStateException("The chat editor does not have input focus");
            }
            var params = new Bundle();
            params.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, "你好 Penlia 😊");
            if (!field.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, params)) {
                throw new IllegalStateException("The editor rejected ACTION_SET_TEXT");
            }
            response.putString("result", "unicode entered in the focused Android editor");
            finish(Activity.RESULT_OK, response);
        } catch (Exception failure) {
            response.putString("result", failure.getMessage());
            finish(Activity.RESULT_CANCELED, response);
        }
    }
}
