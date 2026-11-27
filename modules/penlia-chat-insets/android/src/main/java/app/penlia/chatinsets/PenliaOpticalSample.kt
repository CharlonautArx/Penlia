package app.penlia.chatinsets

import android.content.Context
import android.graphics.RenderEffect
import android.graphics.RuntimeShader
import android.os.Build
import android.util.Log
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.views.ExpoView

class PenliaOpticalSample : Module() {
  override fun definition() = ModuleDefinition {
    Name("PenliaOpticalSample")
    View(OpticalSampleView::class) {
      Prop("enabled") { view: OpticalSampleView, value: Boolean -> view.enable(value) }
    }
  }
}

class OpticalSampleView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private var active = false
  private var effectRejected = false

  fun enable(enabled: Boolean) {
    if (active == enabled) return
    active = enabled
    configureEffect()
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    configureEffect()
  }

  private fun configureEffect() {
    if (Build.VERSION.SDK_INT < 33 || effectRejected) return
    if (!active || width == 0 || height == 0) {
      setRenderEffect(null)
      return
    }
    try {
      val shader = RuntimeShader(OPTICS)
      shader.setFloatUniform("size", width.toFloat(), height.toFloat())
      shader.setFloatUniform("density", resources.displayMetrics.density)
      setRenderEffect(RenderEffect.createRuntimeShaderEffect(shader, "backdrop"))
      Log.i("PenliaGlass", "Dock AGSL active")
    } catch (unsupported: RuntimeException) {
      effectRejected = true
      setRenderEffect(null)
      Log.w("PenliaGlass", "Dock shader unavailable. Using captured blur", unsupported)
    }
  }

  // Draw only the captured backdrop inside a capsule. Text and icons are siblings above this layer.
  private companion object {
    const val OPTICS = """
      uniform shader backdrop;
      uniform float2 size;
      uniform float density;

      half4 main(float2 position) {
        float radius = size.y * 0.5;
        float reach = max(0.0, size.x * 0.5 - radius);
        float2 centered = position - size * 0.5;
        float2 curve = centered - float2(clamp(centered.x, -reach, reach), 0.0);
        float magnitude = max(length(curve), 0.001);
        float2 normal = curve / magnitude;
        float depth = max(0.0, (radius - magnitude) / density);
        float fold = exp(-depth * 0.135) * smoothstep(0.0, 3.5, depth);
        float2 samplePoint = position - normal * (4.2 * density * fold);
        float separation = 0.56 * density * fold;
        half4 center = backdrop.eval(samplePoint);
        half red = backdrop.eval(samplePoint + normal * separation).r;
        half blue = backdrop.eval(samplePoint - normal * separation).b;
        return half4(red, center.g, blue, center.a);
      }
    """
  }
}
