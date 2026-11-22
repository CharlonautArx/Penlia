package __APP_PACKAGE__

import android.app.Activity
import android.graphics.BitmapFactory
import android.os.Build
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.widget.FrameLayout
import android.widget.ImageView
import com.facebook.react.bridge.ReactMarker
import com.facebook.react.bridge.ReactMarkerConstants

internal class PenliaLaunchScreen(private val activity: Activity) {
  private companion object {
    var shownInProcess = false
  }

  private var image: ImageView? = null
  private var reactReady = false
  private var disposed = false
  private var drawListener: ViewTreeObserver.OnPreDrawListener? = null
  private val onReactContent = ReactMarker.MarkerListener { marker, _, _ ->
    if (marker == ReactMarkerConstants.CONTENT_APPEARED) {
      activity.runOnUiThread {
        reactReady = true
        fadeAfterDraw()
      }
    }
  }

  fun prepare() {
    // The splash window uses the launch theme from the manifest. Keep the regular AppTheme
    // on the activity itself, just as the Expo splash integration does.
    activity.setTheme(R.style.AppTheme)
    ReactMarker.addListener(onReactContent)
  }

  fun show() {
    if (shownInProcess) {
      dispose()
      return
    }
    shownInProcess = true

    val decor = activity.window.decorView as FrameLayout
    val cover = ImageView(activity).apply {
      setBackgroundColor(context.getColor(R.color.splashscreen_background))
      val bitmap = resources.openRawResource(R.raw.penlia_launch_art).use { BitmapFactory.decodeStream(it) }
      setImageBitmap(bitmap)
      scaleType = ImageView.ScaleType.FIT_CENTER
      importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    }
    image = cover
    decor.addView(cover, FrameLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT, Gravity.CENTER,
    ))
    // Called on the first Activity frame, when the locally backed image is in the decor.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      activity.splashScreen.setOnExitAnimationListener { view -> view.remove() }
    }
    fadeAfterDraw()
  }

  private fun fadeAfterDraw() {
    val cover = image ?: return
    if (!reactReady || disposed || drawListener != null) return

    ReactMarker.removeListener(onReactContent)
    val listener = object : ViewTreeObserver.OnPreDrawListener {
      override fun onPreDraw(): Boolean {
        cover.viewTreeObserver.removeOnPreDrawListener(this)
        cover.post {
          if (!disposed) {
            cover.animate().alpha(0f).setDuration(120).withEndAction { dispose() }.start()
          }
        }
        return true
      }
    }
    drawListener = listener
    cover.viewTreeObserver.addOnPreDrawListener(listener)
    cover.invalidate()
  }

  fun dispose() {
    if (disposed) return
    disposed = true
    ReactMarker.removeListener(onReactContent)
    image?.let { cover ->
      drawListener?.let {
        if (cover.viewTreeObserver.isAlive) cover.viewTreeObserver.removeOnPreDrawListener(it)
      }
      cover.animate().cancel()
      (cover.parent as? ViewGroup)?.removeView(cover)
    }
    drawListener = null
    image = null
  }
}
