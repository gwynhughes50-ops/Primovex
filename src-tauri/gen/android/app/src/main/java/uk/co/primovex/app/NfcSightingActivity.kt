package uk.co.primovex.app

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.widget.Toast
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

// Invisible handler for Sense room-presence NFC taps received while Primovex
// is closed. Android's App Link system routes a tapped tag's URL to
// whichever activity claims it in the manifest; this one has a higher
// intent-filter priority than MainActivity, so it wins first, records the
// location via a direct Cloud Function call (using a cached bearer session,
// no client SDK / webview involved) and finishes without ever drawing a
// visible screen. Anything that isn't a plain room ("space") tap — assets,
// compliance tags, anything unrecognised — is handed straight to
// MainActivity unchanged, since those still need their real check-in UI.
class NfcSightingActivity : Activity() {
  companion object {
    private const val TAG = "PrimovexNfcSighting"
    private const val FUNCTIONS_BASE = "https://europe-west2-medtrak-b1cad.cloudfunctions.net"
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    val segments = intent?.data?.pathSegments.orEmpty()
    // Expected shape: /sense/open/{entityType}/{entityId}
    val entityType = segments.getOrNull(2)
    val entityId = segments.getOrNull(3)

    if (entityType != "space" || entityId.isNullOrBlank()) {
      forwardToMainActivity()
      return
    }

    val prefs = getSharedPreferences(MainActivity.SESSION_PREFS_NAME, Context.MODE_PRIVATE)
    val idToken = prefs.getString("idToken", null)
    val deviceId = prefs.getString("deviceId", null)
    val expiresAtMillis = prefs.getLong("expiresAtMillis", 0L)
    val displayName = prefs.getString("displayName", "") ?: ""

    if (idToken.isNullOrBlank() || deviceId.isNullOrBlank() || System.currentTimeMillis() >= expiresAtMillis) {
      Log.i(TAG, "no-valid-cached-session, falling back to full app")
      forwardToMainActivity()
      return
    }

    Thread { recordPresence(idToken, entityId, deviceId, displayName) }.start()
  }

  private fun forwardToMainActivity() {
    val forward = Intent(this, MainActivity::class.java).apply {
      action = Intent.ACTION_VIEW
      data = intent?.data
      flags = Intent.FLAG_ACTIVITY_NEW_TASK
    }
    startActivity(forward)
    finish()
  }

  private fun recordPresence(idToken: String, entityId: String, deviceId: String, displayName: String) {
    val handler = Handler(Looper.getMainLooper())
    try {
      val body = JSONObject().apply {
        put("data", JSONObject().apply {
          put("entityId", entityId)
          put("deviceId", deviceId)
          put("displayName", displayName)
        })
      }
      val connection = (URL("$FUNCTIONS_BASE/recordSensePresenceTap").openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = 8000
        readTimeout = 8000
        doOutput = true
        setRequestProperty("Content-Type", "application/json")
        setRequestProperty("Authorization", "Bearer $idToken")
      }
      OutputStreamWriter(connection.outputStream).use { it.write(body.toString()) }
      val status = connection.responseCode
      if (status in 200..299) {
        val responseText = connection.inputStream.bufferedReader().use { it.readText() }
        val spaceName = JSONObject(responseText).optJSONObject("result")?.optString("spaceName")
        Log.i(TAG, "presence-recorded space=$spaceName")
        val message = if (spaceName.isNullOrBlank()) "Location recorded" else "📍 $spaceName — location recorded"
        handler.post { showToast(message) }
      } else {
        val errorText = try { connection.errorStream?.bufferedReader()?.use { it.readText() } } catch (error: Exception) { null }
        Log.w(TAG, "presence-record-failed status=$status body=$errorText")
        handler.post { showToast("Could not record location.") }
      }
    } catch (error: Exception) {
      Log.w(TAG, "presence-record-error", error)
      handler.post { showToast("Could not record location — check your connection.") }
    } finally {
      handler.post { finish() }
    }
  }

  private fun showToast(message: String) {
    Toast.makeText(applicationContext, message, Toast.LENGTH_SHORT).show()
  }
}
