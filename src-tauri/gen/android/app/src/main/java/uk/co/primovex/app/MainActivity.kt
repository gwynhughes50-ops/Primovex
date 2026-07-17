package uk.co.primovex.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.util.Locale

class MainActivity : TauriActivity() {
  companion object {
    private const val TAG = "PrimovexVoice"
  }

  private var webView: WebView? = null
  private var speechRecognizer: SpeechRecognizer? = null
  private var pendingStart = false
  private var recognitionSession = 0
  private val permissionRequestCode = 452
  private val mainHandler = Handler(Looper.getMainLooper())

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    Log.i(TAG, "activity-created sdk=${Build.VERSION.SDK_INT}")
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    this.webView = webView
    webView.addJavascriptInterface(OrbVoiceBridge(), "PrimovexOrbVoice")
    Log.i(TAG, "javascript-bridge-installed")
    dispatchVoiceEvent("native-ready", diagnosticsJson())
  }

  inner class OrbVoiceBridge {
    @JavascriptInterface
    fun isAvailable(): Boolean {
      val available = SpeechRecognizer.isRecognitionAvailable(this@MainActivity)
      Log.i(TAG, "isAvailable=$available")
      return available
    }

    @JavascriptInterface
    fun hasPermission(): Boolean {
      val granted = ContextCompat.checkSelfPermission(
        this@MainActivity,
        Manifest.permission.RECORD_AUDIO
      ) == PackageManager.PERMISSION_GRANTED
      Log.i(TAG, "hasPermission=$granted")
      return granted
    }

    @JavascriptInterface
    fun diagnostics(): String = diagnosticsJson()

    @JavascriptInterface
    fun requestPermission() {
      Log.i(TAG, "requestPermission-called")
      mainHandler.post { requestMicrophonePermission() }
    }

    @JavascriptInterface
    fun startListening() {
      Log.i(TAG, "startListening-called")
      mainHandler.post {
        dispatchVoiceEvent("starting", diagnosticsJson())
        if (!hasPermission()) {
          pendingStart = true
          requestMicrophonePermission()
        } else {
          startNativeRecognition()
        }
      }
    }

    @JavascriptInterface
    fun stopListening() {
      Log.i(TAG, "stopListening-called")
      mainHandler.post { stopNativeRecognition(false, "web-stop") }
    }

    @JavascriptInterface
    fun cancelListening() {
      Log.i(TAG, "cancelListening-called")
      mainHandler.post { stopNativeRecognition(true, "web-cancel") }
    }
  }

  private fun diagnosticsJson(): String = JSONObject().apply {
    put("available", SpeechRecognizer.isRecognitionAvailable(this@MainActivity))
    put("permission", ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED)
    put("sdk", Build.VERSION.SDK_INT)
    put("session", recognitionSession)
  }.toString()

  private fun requestMicrophonePermission() {
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
      Log.i(TAG, "permission-already-granted")
      dispatchVoiceEvent("permission", "granted")
      if (pendingStart) {
        pendingStart = false
        startNativeRecognition()
      }
      return
    }
    Log.i(TAG, "permission-dialog-requested")
    dispatchVoiceEvent("permission-requested", "")
    ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.RECORD_AUDIO), permissionRequestCode)
  }

  override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode != permissionRequestCode) return
    val granted = grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED
    Log.i(TAG, "permission-result granted=$granted")
    dispatchVoiceEvent("permission", if (granted) "granted" else "denied")
    if (granted && pendingStart) {
      pendingStart = false
      startNativeRecognition()
    } else {
      pendingStart = false
    }
  }

  private fun startNativeRecognition() {
    val available = SpeechRecognizer.isRecognitionAvailable(this)
    Log.i(TAG, "startNativeRecognition available=$available permission=${ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED}")
    if (!available) {
      dispatchVoiceEvent("error", "No Android speech recognition provider is available.")
      return
    }

    stopNativeRecognition(true, "restart", emitStopped = false)
    recognitionSession += 1
    val session = recognitionSession

    try {
      speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this).also { recognizer ->
        Log.i(TAG, "recognizer-created session=$session")
        dispatchVoiceEvent("recognizer-created", session.toString())
        recognizer.setRecognitionListener(object : RecognitionListener {
          override fun onReadyForSpeech(params: Bundle?) {
            Log.i(TAG, "onReadyForSpeech session=$session")
            dispatchVoiceEvent("started", "")
          }

          override fun onBeginningOfSpeech() {
            Log.i(TAG, "onBeginningOfSpeech session=$session")
            dispatchVoiceEvent("speech-begin", "")
          }

          override fun onRmsChanged(rmsdB: Float) {
            dispatchVoiceEvent("level", rmsdB.toString())
          }

          override fun onBufferReceived(buffer: ByteArray?) = Unit

          override fun onEndOfSpeech() {
            Log.i(TAG, "onEndOfSpeech session=$session")
            dispatchVoiceEvent("speech-end", "")
          }

          override fun onError(error: Int) {
            val message = speechErrorMessage(error)
            Log.e(TAG, "onError session=$session code=$error message=$message")
            dispatchVoiceEvent("error-code", error.toString())
            dispatchVoiceEvent("error", message)
            stopNativeRecognition(true, "recognizer-error-$error")
          }

          override fun onResults(results: Bundle?) {
            val options = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION).orEmpty()
            val text = options.firstOrNull().orEmpty()
            Log.i(TAG, "onResults session=$session count=${options.size} textLength=${text.length}")
            dispatchVoiceEvent("final", text)
            stopNativeRecognition(true, "final-result")
          }

          override fun onPartialResults(partialResults: Bundle?) {
            val text = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
            if (text.isNotBlank()) {
              Log.d(TAG, "onPartialResults session=$session textLength=${text.length}")
              dispatchVoiceEvent("partial", text)
            }
          }

          override fun onEvent(eventType: Int, params: Bundle?) {
            Log.d(TAG, "onEvent session=$session type=$eventType")
          }
        })
      }

      val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.UK.toLanguageTag())
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, Locale.UK.toLanguageTag())
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
        putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, packageName)
        putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1300L)
        putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 800L)
        putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 500L)
      }
      Log.i(TAG, "startListening-dispatched session=$session")
      speechRecognizer?.startListening(intent)
    } catch (error: Throwable) {
      Log.e(TAG, "recognizer-start-failed session=$session", error)
      dispatchVoiceEvent("error", "Android could not start speech recognition: ${error.javaClass.simpleName}.")
      stopNativeRecognition(true, "start-exception")
    }
  }

  private fun speechErrorMessage(error: Int): String = when (error) {
    SpeechRecognizer.ERROR_AUDIO -> "Microphone audio error (3)."
    SpeechRecognizer.ERROR_CLIENT -> "Voice recognition was cancelled (5)."
    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Microphone permission is required (9)."
    SpeechRecognizer.ERROR_NETWORK -> "Voice recognition network error (2)."
    SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Voice recognition network timeout (1)."
    SpeechRecognizer.ERROR_NO_MATCH -> "I did not catch that (7)."
    SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Voice recognition is busy (8). Tap Orb and try again."
    SpeechRecognizer.ERROR_SERVER -> "Voice recognition service error (4)."
    SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "No speech was heard (6)."
    else -> "Voice recognition failed with Android error $error."
  }

  private fun stopNativeRecognition(cancel: Boolean, reason: String, emitStopped: Boolean = true) {
    Log.i(TAG, "stopNativeRecognition cancel=$cancel reason=$reason active=${speechRecognizer != null}")
    try {
      if (cancel) speechRecognizer?.cancel() else speechRecognizer?.stopListening()
    } catch (error: Exception) {
      Log.w(TAG, "stop/cancel failed", error)
    }
    try {
      speechRecognizer?.destroy()
    } catch (error: Exception) {
      Log.w(TAG, "destroy failed", error)
    }
    speechRecognizer = null
    if (emitStopped) dispatchVoiceEvent("stopped", reason)
  }

  private fun dispatchVoiceEvent(type: String, value: String) {
    val safeType = JSONObject.quote(type)
    val safeValue = JSONObject.quote(value)
    Log.d(TAG, "dispatch type=$type valueLength=${value.length}")
    mainHandler.post {
      webView?.evaluateJavascript(
        "window.dispatchEvent(new CustomEvent('primovex-orb-voice',{detail:{type:$safeType,value:$safeValue}}));",
        null
      ) ?: Log.w(TAG, "dispatch skipped: webView unavailable type=$type")
    }
  }

  override fun onPause() {
    Log.i(TAG, "activity-onPause")
    stopNativeRecognition(true, "activity-paused")
    super.onPause()
  }

  override fun onDestroy() {
    Log.i(TAG, "activity-onDestroy")
    stopNativeRecognition(true, "activity-destroyed")
    webView = null
    super.onDestroy()
  }
}
