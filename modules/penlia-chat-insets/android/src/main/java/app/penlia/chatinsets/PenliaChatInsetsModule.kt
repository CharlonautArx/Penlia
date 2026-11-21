package app.penlia.chatinsets

import android.content.Context
import android.graphics.Rect
import android.os.Build
import android.view.ViewTreeObserver
import android.view.WindowInsets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsAnimationCompat
import androidx.core.view.WindowInsetsCompat
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

class PenliaChatInsetsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PenliaChatInsets")
    View(ImeProbe::class) {
      Events("onOverlap")
    }
  }
}

/** The probe and the IME are compared in the same physical screen coordinates. */
class ImeProbe(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onOverlap by EventDispatcher<Map<String, Any>>()
  private val location = IntArray(2)
  private val visibleFrame = Rect()
  private val density = resources.displayMetrics.density
  private var previousOverlap = -1
  private var previousVisible = false
  private var legacyDecorWidth = 0
  private var legacyWindowBottom = 0
  private var animatedInsets: WindowInsetsCompat? = null
  private val onGlobalLayout = ViewTreeObserver.OnGlobalLayoutListener { publishCurrent() }

  init {
    val ime = WindowInsetsCompat.Type.ime()
    ViewCompat.setWindowInsetsAnimationCallback(this, object : WindowInsetsAnimationCompat.Callback(DISPATCH_MODE_CONTINUE_ON_SUBTREE) {
      override fun onProgress(
        insets: WindowInsetsCompat,
        runningAnimations: MutableList<WindowInsetsAnimationCompat>,
      ): WindowInsetsCompat {
        if (runningAnimations.any { (it.typeMask and ime) != 0 }) {
          animatedInsets = insets
          publish(insets)
        }
        return insets
      }

      override fun onEnd(animation: WindowInsetsAnimationCompat) {
        if ((animation.typeMask and ime) != 0) {
          animatedInsets = null
          publishCurrent()
        }
      }
    })
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    viewTreeObserver.addOnGlobalLayoutListener(onGlobalLayout)
    ViewCompat.requestApplyInsets(this)
    publishCurrent()
  }

  override fun onDetachedFromWindow() {
    viewTreeObserver.removeOnGlobalLayoutListener(onGlobalLayout)
    animatedInsets = null
    previousOverlap = -1
    super.onDetachedFromWindow()
  }

  override fun onApplyWindowInsets(insets: WindowInsets): WindowInsets {
    publish(animatedInsets ?: ViewCompat.getRootWindowInsets(this) ?: WindowInsetsCompat.toWindowInsetsCompat(insets, this))
    return super.onApplyWindowInsets(insets)
  }

  private fun publishCurrent() {
    publish(animatedInsets ?: ViewCompat.getRootWindowInsets(this))
  }

  private fun publish(insets: WindowInsetsCompat?) {
    if (height <= 0 || insets == null) return
    val activity = appContext.currentActivity ?: return
    val imeBottom = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
    val navigationBottom = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom
    val windowBottom = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      activity.windowManager.currentWindowMetrics.bounds.bottom
    } else {
      val decor = activity.window.decorView
      decor.getLocationOnScreen(location)
      val decoratedBottom = location[1] + decor.height
      if (legacyDecorWidth != decor.width) {
        legacyWindowBottom = 0
        legacyDecorWidth = decor.width
      }
      legacyWindowBottom = maxOf(legacyWindowBottom, decoratedBottom)
      legacyWindowBottom
    }

    getLocationOnScreen(location)
    val viewportBottom = location[1] + height
    // A docked IME occupies more than the navigation bar. A floating keyboard does not resize the composer.
    var keyboardTop = if (imeBottom > navigationBottom) windowBottom - imeBottom else null
    if (keyboardTop == null && Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
      getWindowVisibleDisplayFrame(visibleFrame)
      if (windowBottom - visibleFrame.bottom - navigationBottom > 48 * density) {
        keyboardTop = visibleFrame.bottom
      }
    }
    val overlap = keyboardTop?.let { (viewportBottom - it).coerceIn(0, height) } ?: 0
    val visible = keyboardTop != null
    if (previousOverlap == overlap && previousVisible == visible) return
    previousOverlap = overlap
    previousVisible = visible
    onOverlap(mapOf("height" to overlap / density, "visible" to visible))
  }
}
