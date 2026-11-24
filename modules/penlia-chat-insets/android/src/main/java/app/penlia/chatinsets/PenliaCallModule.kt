package app.penlia.chatinsets

import android.app.PictureInPictureParams
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.util.Rational
import androidx.activity.ComponentActivity
import androidx.core.app.PictureInPictureModeChangedInfo
import androidx.core.util.Consumer
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PenliaCallModule : Module() {
  private var host: ComponentActivity? = null
  private val changed = Consumer<PictureInPictureModeChangedInfo> {
    sendEvent("onPipChanged", mapOf("active" to it.isInPictureInPictureMode))
  }
  private val leaving = Runnable {
    if (Build.VERSION.SDK_INT in 26..30) {
      try { host?.enterPictureInPictureMode(parameters(true)) } catch (_: IllegalStateException) {}
    }
  }

  private fun parameters(enabled: Boolean): PictureInPictureParams {
    val builder = PictureInPictureParams.Builder().setAspectRatio(Rational(3, 4))
    if (Build.VERSION.SDK_INT >= 31) builder.setAutoEnterEnabled(enabled)
    return builder.build()
  }

  private fun stopPip() {
    host?.let { activity ->
      activity.removeOnPictureInPictureModeChangedListener(changed)
      activity.removeOnUserLeaveHintListener(leaving)
      if (Build.VERSION.SDK_INT >= 31 && !activity.isDestroyed) {
        activity.setPictureInPictureParams(parameters(false))
      }
    }
    host = null
  }

  private var audio: AudioManager? = null
  private var oldMode = AudioManager.MODE_NORMAL
  private var oldSpeaker = false
  private var oldDevice: AudioDeviceInfo? = null

  @Suppress("DEPRECATION")
  private fun restoreAudio() {
    audio?.let { manager ->
      if (Build.VERSION.SDK_INT >= 31) {
        val previous = oldDevice
        if (oldMode == AudioManager.MODE_NORMAL || previous == null ||
          manager.availableCommunicationDevices.none { it.id == previous.id } ||
          !manager.setCommunicationDevice(previous)) manager.clearCommunicationDevice()
      } else manager.isSpeakerphoneOn = oldSpeaker
      manager.mode = oldMode
    }
    audio = null
    oldDevice = null
  }

  override fun definition() = ModuleDefinition {
    Name("PenliaCall")
    Events("onPipChanged")
    AsyncFunction("configurePip") { enabled: Boolean ->
      stopPip()
      val activity = appContext.currentActivity as? ComponentActivity
      if (!enabled || activity == null || Build.VERSION.SDK_INT < 26 ||
        !activity.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)) return@AsyncFunction false
      activity.setPictureInPictureParams(parameters(true))
      activity.addOnPictureInPictureModeChangedListener(changed)
      activity.addOnUserLeaveHintListener(leaving)
      host = activity
      true
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("routeSpeaker") { speaker: Boolean ->
      val manager = appContext.reactContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        ?: return@AsyncFunction false
      if (audio == null) {
        oldMode = manager.mode
        @Suppress("DEPRECATION")
        oldSpeaker = manager.isSpeakerphoneOn
        if (Build.VERSION.SDK_INT >= 31) oldDevice = manager.communicationDevice
        audio = manager
      }
      manager.mode = AudioManager.MODE_IN_COMMUNICATION
      if (Build.VERSION.SDK_INT >= 31) {
        val type = if (speaker) AudioDeviceInfo.TYPE_BUILTIN_SPEAKER else AudioDeviceInfo.TYPE_BUILTIN_EARPIECE
        val device = manager.availableCommunicationDevices.firstOrNull { it.type == type }
        device != null && manager.setCommunicationDevice(device)
      } else {
        @Suppress("DEPRECATION")
        manager.isSpeakerphoneOn = speaker
        true
      }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("releaseAudio") { restoreAudio() }.runOnQueue(Queues.MAIN)
    OnActivityDestroys { stopPip(); restoreAudio() }
    OnDestroy {
      val activity = host ?: appContext.currentActivity
      activity?.runOnUiThread { stopPip(); restoreAudio() } ?: restoreAudio()
    }
  }
}
