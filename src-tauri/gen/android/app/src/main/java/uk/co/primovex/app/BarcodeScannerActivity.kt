package uk.co.primovex.app

import android.app.Activity
import android.content.Intent
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.os.Bundle
import android.util.Size
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.FocusMeteringAction
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.barcode.BarcodeScanner
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class BarcodeScannerActivity : AppCompatActivity() {
  companion object { const val EXTRA_BARCODE = "barcode" }

  private lateinit var previewView: PreviewView
  private lateinit var statusView: TextView
  private var camera: Camera? = null
  private val executor = Executors.newSingleThreadExecutor()
  private val processing = AtomicBoolean(false)
  private val completed = AtomicBoolean(false)
  private val scanner: BarcodeScanner by lazy { BarcodeScanning.getClient() }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    window.statusBarColor = Color.rgb(7, 26, 51)
    window.navigationBarColor = Color.BLACK
    setContentView(buildLayout())
    startCamera()
  }

  private fun buildLayout(): View {
    val root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
    previewView = PreviewView(this).apply {
      implementationMode = PreviewView.ImplementationMode.COMPATIBLE
      scaleType = PreviewView.ScaleType.FILL_CENTER
    }
    root.addView(previewView, FrameLayout.LayoutParams(-1, -1))
    root.addView(ScannerOverlay(this), FrameLayout.LayoutParams(-1, -1))

    val header = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(20), dp(14), dp(16), dp(14))
      setBackgroundColor(Color.rgb(7, 26, 51))
    }
    val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
    val title = TextView(this).apply {
      text = "Scan barcode"; textSize = 24f; setTextColor(Color.WHITE)
      setTypeface(typeface, android.graphics.Typeface.BOLD)
    }
    row.addView(title, LinearLayout.LayoutParams(0, -2, 1f))
    val close = Button(this).apply {
      text = "Close"; textSize = 17f; setTextColor(Color.WHITE); setBackgroundColor(Color.rgb(15, 48, 86))
      setOnClickListener { cancelAndFinish() }
    }
    row.addView(close, LinearLayout.LayoutParams(dp(110), dp(52)))
    header.addView(row)
    statusView = TextView(this).apply {
      text = "Starting camera..."; textSize = 15f; setTextColor(Color.rgb(210, 225, 242)); setPadding(0, dp(5), 0, 0)
    }
    header.addView(statusView)
    root.addView(header, FrameLayout.LayoutParams(-1, -2, Gravity.TOP))

    val hint = TextView(this).apply {
      text = "Centre one barcode inside the frame\nTap the barcode to refocus"
      textSize = 16f; gravity = Gravity.CENTER; setTextColor(Color.WHITE)
      setTypeface(typeface, android.graphics.Typeface.BOLD)
      setPadding(dp(14), dp(10), dp(14), dp(10)); setBackgroundColor(Color.argb(205, 7, 26, 51))
    }
    val hintParams = FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM).apply { setMargins(dp(22), 0, dp(22), dp(28)) }
    root.addView(hint, hintParams)
    previewView.setOnTouchListener { _, event ->
      if (event.action == MotionEvent.ACTION_UP) focusAt(event.x, event.y)
      true
    }
    return root
  }

  private fun startCamera() {
    val providerFuture = ProcessCameraProvider.getInstance(this)
    providerFuture.addListener({
      try {
        val provider = providerFuture.get()
        val preview = Preview.Builder().build().also { it.setSurfaceProvider(previewView.surfaceProvider) }
        val analysis = ImageAnalysis.Builder().setTargetResolution(Size(1280, 720))
          .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build()
        analysis.setAnalyzer(executor) { imageProxy ->
          if (!processing.compareAndSet(false, true) || completed.get()) { imageProxy.close(); return@setAnalyzer }
          val image = imageProxy.image
          if (image == null) { processing.set(false); imageProxy.close(); return@setAnalyzer }
          scanner.process(InputImage.fromMediaImage(image, imageProxy.imageInfo.rotationDegrees))
            .addOnSuccessListener { results ->
              val value = results.firstNotNullOfOrNull { it.rawValue?.trim()?.takeIf(String::isNotEmpty) }
              if (value != null && completed.compareAndSet(false, true)) {
                statusView.text = "Barcode captured"
                setResult(Activity.RESULT_OK, Intent().putExtra(EXTRA_BARCODE, value)); finish()
              }
            }
            .addOnFailureListener { error ->
              statusView.text = "Keep the full barcode visible and hold still"
              android.util.Log.w("PrimovexBarcode", "ML Kit analysis failed", error)
            }
            .addOnCompleteListener { processing.set(false); imageProxy.close() }
        }
        provider.unbindAll()
        camera = provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
        statusView.text = "Camera active. Centre the complete barcode and hold still."
        previewView.postDelayed({ focusAt(previewView.width / 2f, previewView.height / 2f) }, 450)
      } catch (error: Exception) {
        statusView.text = "Camera could not start. Close and try again."
        android.util.Log.e("PrimovexBarcode", "Camera startup failed", error)
      }
    }, ContextCompat.getMainExecutor(this))
  }

  private fun focusAt(x: Float, y: Float) {
    val point = previewView.meteringPointFactory.createPoint(x, y)
    val action = FocusMeteringAction.Builder(point, FocusMeteringAction.FLAG_AF or FocusMeteringAction.FLAG_AE)
      .setAutoCancelDuration(3, TimeUnit.SECONDS).build()
    camera?.cameraControl?.startFocusAndMetering(action)
    statusView.text = "Focusing... hold the barcode still."
  }

  private fun cancelAndFinish() { setResult(Activity.RESULT_CANCELED); finish() }
  @Deprecated("Deprecated in Java") override fun onBackPressed() = cancelAndFinish()
  override fun onDestroy() { scanner.close(); executor.shutdown(); super.onDestroy() }
  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

  private inner class ScannerOverlay(context: android.content.Context) : View(context) {
    private val shade = Paint().apply { color = Color.argb(112, 0, 0, 0) }
    private val border = Paint().apply {
      color = Color.rgb(0, 114, 206); style = Paint.Style.STROKE; strokeWidth = dp(4).toFloat(); isAntiAlias = true
    }
    override fun onDraw(canvas: Canvas) {
      super.onDraw(canvas)
      val frameWidth = width * 0.86f
      val frameHeight = minOf(height * 0.28f, dp(250).toFloat())
      val left = (width - frameWidth) / 2f; val top = (height - frameHeight) / 2f
      val frame = RectF(left, top, left + frameWidth, top + frameHeight)
      canvas.drawRect(0f, 0f, width.toFloat(), frame.top, shade)
      canvas.drawRect(0f, frame.bottom, width.toFloat(), height.toFloat(), shade)
      canvas.drawRect(0f, frame.top, frame.left, frame.bottom, shade)
      canvas.drawRect(frame.right, frame.top, width.toFloat(), frame.bottom, shade)
      canvas.drawRoundRect(frame, dp(22).toFloat(), dp(22).toFloat(), border)
    }
  }
}