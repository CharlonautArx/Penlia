package app.penlia.pilot.probe;

import android.accessibilityservice.AccessibilityServiceInfo;
import android.app.Activity;
import android.app.Instrumentation;
import android.app.UiAutomation;
import android.graphics.Rect;
import android.os.Bundle;
import android.util.Xml;
import android.view.accessibility.AccessibilityNodeInfo;
import org.xmlpull.v1.XmlSerializer;
import java.io.FileOutputStream;

/** Read one visible test window without waiting for an animated view to become idle. */
public final class WindowProbe extends Instrumentation {
    private static final String TARGET = "app.penlia.mobile.designpilot";

    @Override public void onCreate(Bundle arguments) { start(); }

    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            UiAutomation automation = getUiAutomation(UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES);
            AccessibilityServiceInfo info = automation.getServiceInfo();
            info.flags |= AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS | AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS;
            automation.setServiceInfo(info);
            AccessibilityNodeInfo root = automation.getRootInActiveWindow();
            if (root == null || !TARGET.contentEquals(root.getPackageName())) {
                throw new IllegalStateException("Pilot window is not active");
            }
            try (FileOutputStream stream = getContext().openFileOutput("window.xml", 0)) {
                XmlSerializer xml = Xml.newSerializer();
                xml.setOutput(stream, "UTF-8");
                xml.startDocument("UTF-8", true);
                xml.startTag(null, "hierarchy");
                writeNode(xml, root, 0);
                xml.endTag(null, "hierarchy");
                xml.endDocument();
            } finally {
                root.recycle();
            }
            result.putString("probe", "ready");
            finish(Activity.RESULT_OK, result);
        } catch (Exception failure) {
            result.putString("probe", failure.getClass().getSimpleName());
            finish(Activity.RESULT_CANCELED, result);
        }
    }

    private static String string(CharSequence value) { return value == null ? "" : value.toString(); }

    private static void writeNode(XmlSerializer xml, AccessibilityNodeInfo node, int depth) throws Exception {
        if (depth > 96 || !TARGET.contentEquals(node.getPackageName())) return;
        Rect bounds = new Rect();
        node.getBoundsInScreen(bounds);
        if (!node.isVisibleToUser()) bounds.setEmpty();
        xml.startTag(null, "node");
        xml.attribute(null, "resource-id", string(node.getViewIdResourceName()));
        xml.attribute(null, "class", string(node.getClassName()));
        xml.attribute(null, "text", string(node.getText()));
        xml.attribute(null, "content-desc", string(node.getContentDescription()));
        xml.attribute(null, "clickable", String.valueOf(node.isClickable()));
        xml.attribute(null, "checked", String.valueOf(node.isChecked()));
        xml.attribute(null, "bounds", bounds.toShortString());
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child == null) continue;
            try { writeNode(xml, child, depth + 1); } finally { child.recycle(); }
        }
        xml.endTag(null, "node");
    }
}
