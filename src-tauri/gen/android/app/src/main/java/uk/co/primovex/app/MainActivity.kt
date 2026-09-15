package uk.co.primovex.app

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.nfc.FormatException
import android.nfc.NdefMessage
import android.nfc.NdefRecord
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.TagLostException
import android.nfc.tech.MifareUltralight
import android.nfc.tech.Ndef
import android.nfc.tech.NdefFormatable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
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
    private const val BARCODE_REQUEST_CODE = 453
    private const val CAMERA_PERMISSION_REQUEST_CODE = 454
    private const val BLE_PERMISSION_REQUEST_CODE = 455
    private val EDDYSTONE_URL_PREFIXES = arrayOf("http://www.", "https://www.", "http://", "https://")
    private val EDDYSTONE_URL_EXPANSIONS = arrayOf(
      ".com/", ".org/", ".edu/", ".net/", ".info/", ".biz/", ".gov/",
      ".com", ".org", ".edu", ".net", ".info", ".biz", ".gov"
    )
    private val EDDYSTONE_SERVICE_UUID: ParcelUuid = ParcelUuid.fromString("0000feaa-0000-1000-8000-00805f9b34fb")
    const val SESSION_PREFS_NAME = "primovex_session"
  }

  private var webView: WebView? = null
  private var speechRecognizer: SpeechRecognizer? = null
  private var pendingStart = false
  private var recognitionSession = 0
  private val permissionRequestCode = 452
  private var pendingBarcodeStart = false
  private var nfcAdapter: NfcAdapter? = null
  private var pendingWriteUrl: String? = null
  private var bluetoothAdapter: BluetoothAdapter? = null
  private var bluetoothLeScanner: BluetoothLeScanner? = null
  private var bleScanCallback: ScanCallback? = null
  private var bleScanning = false
  private var pendingBleStart = false
  private val bleLastDispatchedAt = mutableMapOf<String, Long>()

  private val mainHandler = Handler(Looper.getMainLooper())

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    nfcAdapter = NfcAdapter.getDefaultAdapter(this)
    val bluetoothManager = getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    bluetoothAdapter = bluetoothManager?.adapter
    Log.i(TAG, "activity-created sdk=${Build.VERSION.SDK_INT} nfcAvailable=${nfcAdapter != null} bleAvailable=${bluetoothAdapter != null}")
  }

  override fun onResume() {
    super.onResume()
    // Reader mode only listens while this activity is in the foreground, so a
    // closed/backgrounded app still gets the normal Android App Links tap-to-open
    // behaviour untouched (this never registers a manifest intent-filter).
    nfcAdapter?.let { adapter ->
      val flags = NfcAdapter.FLAG_READER_NFC_A or
        NfcAdapter.FLAG_READER_NFC_B or
        NfcAdapter.FLAG_READER_NFC_F or
        NfcAdapter.FLAG_READER_NFC_V or
        NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK
      adapter.enableReaderMode(this, { tag -> onNfcTagDiscovered(tag) }, flags, null)
      Log.i(TAG, "nfc-reader-mode-enabled")
    }

    // Equipment tags (fast-moving kit like ECG/ultrasound machines) need to be
    // found passively as staff carry the app around, not just when a scan
    // sheet is deliberately open. Auto-start whenever permission is already
    // granted; onPause stops it, so this only ever runs while the app is
    // foregrounded, matching the NFC reader-mode lifecycle above. If
    // permission hasn't been granted yet, this silently does nothing until
    // the JS side requests it from a Sense/Equipment screen.
    if (hasBlePermission()) startBleScanInternal()
  }

  override fun onPause() {
    Log.i(TAG, "activity-onPause")
    nfcAdapter?.disableReaderMode(this)
    stopBleScanInternal()
    stopNativeRecognition(true, "activity-paused")
    super.onPause()
  }

  // Runs on a background thread supplied by NfcAdapter, never the main thread.
  private fun onNfcTagDiscovered(tag: Tag) {
    val writeUrl = pendingWriteUrl
    if (writeUrl != null) {
      pendingWriteUrl = null
      val error = writeNdefUrl(tag, writeUrl)
      if (error == null) {
        Log.i(TAG, "nfc-write-success")
        dispatchNfcEvent("write-success", writeUrl)
      } else {
        Log.w(TAG, "nfc-write-failed reason=$error")
        dispatchNfcEvent("write-error", error)
      }
      return
    }

    val url = readNdefUrl(tag)
    if (url == null) {
      Log.w(TAG, "nfc-tag-discovered no-ndef-url")
      dispatchNfcEvent("unreadable", "")
      return
    }
    Log.i(TAG, "nfc-tag-discovered")
    dispatchNfcEvent("scanned", url)
  }

  private fun readNdefUrl(tag: Tag): String? {
    val ndef = Ndef.get(tag)
    if (ndef != null) {
      return try {
        ndef.connect()
        val message: NdefMessage? = ndef.ndefMessage ?: ndef.cachedNdefMessage
        message?.records?.firstNotNullOfOrNull { record -> record.toUri()?.toString() }
      } catch (error: Exception) {
        Log.w(TAG, "nfc-read-failed", error)
        null
      } finally {
        try { ndef.close() } catch (error: Exception) { /* already closed/disconnected */ }
      }
    }

    // Mirror of the write-side fallback: this phone's NFC stack doesn't expose
    // Ndef for this tag's tech profile, so read the Type 2 Tag NDEF TLV back
    // via raw MifareUltralight page reads instead.
    val ultralight = MifareUltralight.get(tag) ?: return null
    return readType2TagNdef(ultralight)
  }

  private fun readType2TagNdef(ultralight: MifareUltralight): String? {
    return try {
      ultralight.connect()
      val bytes = mutableListOf<Byte>()
      var page = 4
      while (page < 4 + 132) {
        val chunk = try { ultralight.readPages(page) } catch (error: Exception) { break }
        bytes.addAll(chunk.toList())
        page += 4
      }
      val all = bytes.toByteArray()
      val tlvStart = all.indexOfFirst { it == 0x03.toByte() }
      if (tlvStart < 0 || tlvStart + 1 >= all.size) return null
      val length = all[tlvStart + 1].toInt() and 0xFF
      val payloadStart = tlvStart + 2
      if (payloadStart + length > all.size) return null
      val message = NdefMessage(all.copyOfRange(payloadStart, payloadStart + length))
      message.records.firstNotNullOfOrNull { record -> record.toUri()?.toString() }
    } catch (error: Exception) {
      Log.w(TAG, "nfc-type2-read-failed", error)
      null
    } finally {
      try { ultralight.close() } catch (error: Exception) { /* already closed/disconnected */ }
    }
  }

  // Returns null on success, or a short user-facing error message on failure.
  // Handles both already-NDEF tags (rewrite) and factory-blank tags (format+write).
  private fun writeNdefUrl(tag: Tag, url: String): String? {
    val message = NdefMessage(arrayOf(NdefRecord.createUri(url)))
    val ndef = Ndef.get(tag)
    if (ndef != null) {
      return try {
        ndef.connect()
        if (!ndef.isWritable) return "This tag is read-only and cannot be reprogrammed."
        if (ndef.maxSize < message.toByteArray().size) return "This tag is too small to hold the Primovex link."
        ndef.writeNdefMessage(message)
        null
      } catch (error: TagLostException) {
        "The tag moved away before writing finished. Hold it still and try again."
      } catch (error: FormatException) {
        "This tag's format is not supported."
      } catch (error: Exception) {
        Log.w(TAG, "nfc-write-ndef-failed", error)
        "Could not write to this tag: ${error.javaClass.simpleName}."
      } finally {
        try { ndef.close() } catch (error: Exception) { /* already closed/disconnected */ }
      }
    }

    val formatable = NdefFormatable.get(tag)
    if (formatable != null) {
      return try {
        formatable.connect()
        formatable.format(message)
        null
      } catch (error: TagLostException) {
        "The tag moved away before writing finished. Hold it still and try again."
      } catch (error: FormatException) {
        "This blank tag could not be formatted."
      } catch (error: Exception) {
        Log.w(TAG, "nfc-format-failed", error)
        "Could not format this tag: ${error.javaClass.simpleName}."
      } finally {
        try { formatable.close() } catch (error: Exception) { /* already closed/disconnected */ }
      }
    }

    // Some Android NFC stacks don't expose Ndef/NdefFormatable for NTAG21x
    // (MIFARE Ultralight family) tags even though the chip fully supports
    // NDEF at the raw Type 2 Tag level. Fall back to writing the NDEF TLV
    // directly via page writes, same technique most third-party NFC writer
    // apps use for this exact compatibility gap.
    val ultralight = MifareUltralight.get(tag)
    if (ultralight != null) return writeType2TagNdef(ultralight, message)

    val techNames = tag.techList.joinToString { it.substringAfterLast('.') }
    Log.w(TAG, "nfc-write-no-ndef-support techList=$techNames")
    return "This tag does not support NDEF and cannot be programmed (detected: $techNames). Try a plain NTAG213/215/216 sticker instead."
  }

  private fun writeType2TagNdef(ultralight: MifareUltralight, message: NdefMessage): String? {
    return try {
      ultralight.connect()
      val payload = message.toByteArray()
      if (payload.size > 250) return "This link is too long to fit on this tag."

      // Page 3 holds the Capability Container. Genuine NTAG21x stickers ship
      // with a valid one from the factory; only (re)write it if it looks
      // uninitialised, so we never clobber a tag's real memory size byte.
      val cc = ultralight.readPages(0).copyOfRange(12, 16)
      if (cc[0] == 0.toByte()) {
        ultralight.writePage(3, byteArrayOf(0xE1.toByte(), 0x10, 0x3F, 0x00))
      }

      val tlv = ByteArray(payload.size + 3).apply {
        this[0] = 0x03
        this[1] = payload.size.toByte()
        payload.copyInto(this, 2)
        this[payload.size + 2] = 0xFE.toByte()
      }

      var page = 4
      var offset = 0
      while (offset < tlv.size) {
        val chunk = ByteArray(4)
        val remaining = tlv.size - offset
        System.arraycopy(tlv, offset, chunk, 0, minOf(4, remaining))
        ultralight.writePage(page, chunk)
        page += 1
        offset += 4
      }
      null
    } catch (error: TagLostException) {
      "The tag moved away before writing finished. Hold it still and try again."
    } catch (error: Exception) {
      Log.w(TAG, "nfc-type2-write-failed", error)
      "Could not write to this tag: ${error.javaClass.simpleName}."
    } finally {
      try { ultralight.close() } catch (error: Exception) { /* already closed/disconnected */ }
    }
  }

  private fun dispatchNfcEvent(type: String, value: String) {
    val safeType = JSONObject.quote(type)
    val safeValue = JSONObject.quote(value)
    mainHandler.post {
      webView?.evaluateJavascript(
        "window.dispatchEvent(new CustomEvent('primovex-native-nfc',{detail:{type:$safeType,value:$safeValue}}));",
        null
      ) ?: Log.w(TAG, "nfc-dispatch skipped: webView unavailable type=$type")
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    this.webView = webView
    webView.addJavascriptInterface(OrbVoiceBridge(), "PrimovexOrbVoice")
    webView.addJavascriptInterface(BarcodeBridge(), "PrimovexBarcode")
    webView.addJavascriptInterface(NfcBridge(), "PrimovexNfc")
    webView.addJavascriptInterface(BleBridge(), "PrimovexBle")
    webView.addJavascriptInterface(AuthBridge(), "PrimovexAuth")

    Log.i(TAG, "javascript-bridge-installed")
    dispatchVoiceEvent("native-ready", diagnosticsJson())
  }

  inner class NfcBridge {
    @JavascriptInterface
    fun isAvailable(): Boolean = nfcAdapter != null

    // The next tag discovered by reader mode will be written with this URL
    // instead of read, then the pending write clears itself either way.
    @JavascriptInterface
    fun beginWrite(url: String) {
      mainHandler.post {
        Log.i(TAG, "nfc-write-armed")
        pendingWriteUrl = url
      }
    }

    @JavascriptInterface
    fun cancelWrite() {
      mainHandler.post { pendingWriteUrl = null }
    }
  }

  // Caches the signed-in user's bearer session so NfcSightingActivity can
  // record a room-presence NFC tap while this webview isn't even running
  // (app closed/killed). AuthContext.jsx pushes a fresh token here on every
  // sign-in and automatic Firebase token refresh; signing out clears it.
  // Never touched by anything else in this app — read-only from the
  // headless activity's point of view.
  inner class AuthBridge {
    @JavascriptInterface
    fun cacheSession(uid: String, idToken: String, expiresAtMillis: Long, deviceId: String, displayName: String) {
      getSharedPreferences(SESSION_PREFS_NAME, Context.MODE_PRIVATE).edit()
        .putString("uid", uid)
        .putString("idToken", idToken)
        .putLong("expiresAtMillis", expiresAtMillis)
        .putString("deviceId", deviceId)
        .putString("displayName", displayName)
        .apply()
    }

    @JavascriptInterface
    fun clearSession() {
      getSharedPreferences(SESSION_PREFS_NAME, Context.MODE_PRIVATE).edit().clear().apply()
    }
  }

  // BLE tags (e.g. the DX-CP35 asset tags) can broadcast several advertisement
  // frame types simultaneously (iBeacon, Eddystone-UID, Eddystone-URL). We
  // decode all three: an Eddystone-URL pointing at a recognised Primovex Sense
  // link is treated exactly like a scanned NFC tag (dispatched as "scanned" so
  // MobileLayout's existing handleSpaceCodeScan picks it up unchanged); iBeacon
  // and Eddystone-UID frames are surfaced as raw diagnostics since a factory-
  // default tag may not be broadcasting a URL frame until configured.
  inner class BleBridge {
    @JavascriptInterface
    fun isAvailable(): Boolean = bluetoothAdapter?.isEnabled == true

    @JavascriptInterface
    fun hasPermission(): Boolean = hasBlePermission()

    @JavascriptInterface
    fun requestPermission() {
      // Setting pendingBleStart here (not just in startScan()) means ANY
      // permission request — regardless of which JS entry point triggered it —
      // results in scanning actually starting the moment it's granted, rather
      // than waiting for the next onResume (e.g. backgrounding and
      // foregrounding the app again).
      mainHandler.post {
        pendingBleStart = true
        requestBlePermission()
      }
    }

    @JavascriptInterface
    fun startScan() {
      mainHandler.post {
        if (!hasBlePermission()) {
          pendingBleStart = true
          requestBlePermission()
          return@post
        }
        startBleScanInternal()
      }
    }

    @JavascriptInterface
    fun stopScan() {
      mainHandler.post { stopBleScanInternal() }
    }
  }

  private fun hasBlePermission(): Boolean {
    val permission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) Manifest.permission.BLUETOOTH_SCAN else Manifest.permission.ACCESS_FINE_LOCATION
    return ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED
  }

  private fun requestBlePermission() {
    val permission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) Manifest.permission.BLUETOOTH_SCAN else Manifest.permission.ACCESS_FINE_LOCATION
    Log.i(TAG, "ble-permission-dialog-requested")
    ActivityCompat.requestPermissions(this, arrayOf(permission), BLE_PERMISSION_REQUEST_CODE)
  }

  private fun startBleScanInternal() {
    if (bleScanning) return
    val adapter = bluetoothAdapter
    if (adapter == null || !adapter.isEnabled) {
      dispatchBleEvent("error", "Turn on Bluetooth to scan for tags.")
      return
    }
    val scanner = adapter.bluetoothLeScanner
    if (scanner == null) {
      dispatchBleEvent("error", "BLE scanning is not available on this device.")
      return
    }
    bluetoothLeScanner = scanner
    bleLastDispatchedAt.clear()
    val callback = object : ScanCallback() {
      override fun onScanResult(callbackType: Int, result: ScanResult) {
        handleBleScanResult(result)
      }
      override fun onScanFailed(errorCode: Int) {
        Log.w(TAG, "ble-scan-failed code=$errorCode")
        dispatchBleEvent("error", "BLE scan failed (code $errorCode).")
        bleScanning = false
      }
    }
    bleScanCallback = callback
    // BALANCED trades a few seconds of extra detection latency for meaningfully
    // lower power draw than LOW_LATENCY. Fine for passive "last seen" logging,
    // which was never going to be millisecond-sensitive anyway.
    val settings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_BALANCED).build()
    try {
      scanner.startScan(null, settings, callback)
      bleScanning = true
      Log.i(TAG, "ble-scan-started")
      dispatchBleEvent("scanning", "")
    } catch (error: SecurityException) {
      Log.w(TAG, "ble-scan-permission-denied", error)
      dispatchBleEvent("error", "Bluetooth permission was denied.")
    }
  }

  private fun stopBleScanInternal() {
    if (!bleScanning) return
    try {
      bluetoothLeScanner?.stopScan(bleScanCallback)
    } catch (error: SecurityException) {
      Log.w(TAG, "ble-stop-scan-permission-denied", error)
    }
    bleScanning = false
    bleScanCallback = null
    Log.i(TAG, "ble-scan-stopped")
  }

  // Rate-limits repeat dispatches of the same tag/frame so a beacon
  // re-advertising every ~100ms-1s doesn't spam the JS side.
  private fun shouldDispatchBle(key: String): Boolean {
    val now = System.currentTimeMillis()
    val last = bleLastDispatchedAt[key] ?: 0L
    if (now - last < 4000) return false
    bleLastDispatchedAt[key] = now
    return true
  }

  private fun handleBleScanResult(result: ScanResult) {
    val record = result.scanRecord ?: return
    val address = result.device?.address ?: "unknown"

    // Temporary raw-visibility logging (not rate-limited) while diagnosing
    // the DX-CP35 tag's actual default broadcast — every recognised or
    // unrecognised advertisement logs a one-line summary, so "nothing in the
    // scan sheet" can be told apart from "scan genuinely sees nothing".
    val manufacturerSummary = (0 until record.manufacturerSpecificData.size())
      .joinToString(",") { i -> "0x" + record.manufacturerSpecificData.keyAt(i).toString(16) }
    val serviceUuidsSummary = record.serviceUuids?.joinToString(",") { it.toString() } ?: "none"
    Log.d(TAG, "ble-raw addr=$address rssi=${result.rssi} name=${record.deviceName} manufacturerIds=[$manufacturerSummary] serviceUuids=[$serviceUuidsSummary]")

    val eddystoneData = record.getServiceData(EDDYSTONE_SERVICE_UUID)
    if (eddystoneData != null && eddystoneData.isNotEmpty()) {
      when (eddystoneData[0].toInt() and 0xFF) {
        0x10 -> {
          val url = decodeEddystoneUrl(eddystoneData)
          if (url != null && shouldDispatchBle("url:$url")) {
            Log.i(TAG, "ble-eddystone-url-decoded")
            dispatchBleEvent("scanned", url)
          }
        }
        0x00 -> if (eddystoneData.size >= 18) {
          val namespace = eddystoneData.copyOfRange(2, 12).joinToString("") { "%02x".format(it) }
          val instance = eddystoneData.copyOfRange(12, 18).joinToString("") { "%02x".format(it) }
          val key = "uid:$namespace:$instance"
          if (shouldDispatchBle(key)) dispatchBleEvent("eddystone-uid", "namespace=$namespace instance=$instance rssi=${result.rssi} addr=$address")
        }
      }
    }

    // Real Apple iBeacons file this under company ID 0x004C, but several
    // cheaper beacon vendors (e.g. this DX-CP35 tag, seen filing it under
    // 0x4458 - "DX" in ASCII) reuse the same 0x02,0x15,UUID,Major,Minor,TxPower
    // payload shape under their OWN company ID instead. Check the payload
    // structure across every manufacturer-data entry present, not just
    // Apple's, so any of these "iBeacon-format" tags are recognised.
    val manufacturerData = record.manufacturerSpecificData
    for (i in 0 until manufacturerData.size()) {
      val appleData = manufacturerData.valueAt(i)
      if (appleData != null && appleData.size >= 23 && (appleData[0].toInt() and 0xFF) == 0x02 && (appleData[1].toInt() and 0xFF) == 0x15) {
        val uuid = formatUuid(appleData.copyOfRange(2, 18))
        val major = ((appleData[18].toInt() and 0xFF) shl 8) or (appleData[19].toInt() and 0xFF)
        val minor = ((appleData[20].toInt() and 0xFF) shl 8) or (appleData[21].toInt() and 0xFF)
        val key = "ibeacon:$uuid:$major:$minor"
        if (shouldDispatchBle(key)) dispatchBleEvent("ibeacon", "uuid=$uuid major=$major minor=$minor rssi=${result.rssi} addr=$address")
      }
    }
  }

  private fun formatUuid(bytes: ByteArray): String {
    val hex = bytes.joinToString("") { "%02x".format(it) }
    return "${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20, 32)}"
  }

  // Eddystone-URL byte-compression scheme: byte[2] selects a scheme prefix,
  // then each following byte is either a common-suffix expansion code
  // (0x00-0x0D) or a literal ASCII character (0x0E+). See the Eddystone spec.
  private fun decodeEddystoneUrl(data: ByteArray): String? {
    if (data.size < 3) return null
    val schemeIndex = data[2].toInt() and 0xFF
    if (schemeIndex >= EDDYSTONE_URL_PREFIXES.size) return null
    val builder = StringBuilder(EDDYSTONE_URL_PREFIXES[schemeIndex])
    for (i in 3 until data.size) {
      val byteValue = data[i].toInt() and 0xFF
      if (byteValue < EDDYSTONE_URL_EXPANSIONS.size) builder.append(EDDYSTONE_URL_EXPANSIONS[byteValue])
      else builder.append(byteValue.toChar())
    }
    return builder.toString()
  }

  private fun dispatchBleEvent(type: String, value: String) {
    val safeType = JSONObject.quote(type)
    val safeValue = JSONObject.quote(value)
    mainHandler.post {
      webView?.evaluateJavascript(
        "window.dispatchEvent(new CustomEvent('primovex-native-ble',{detail:{type:$safeType,value:$safeValue}}));",
        null
      ) ?: Log.w(TAG, "ble-dispatch skipped: webView unavailable type=$type")
    }
  }

  inner class BarcodeBridge {
    @JavascriptInterface
    fun startScan() {
      mainHandler.post { startBarcodeScannerWithPermission() }
    }
  }

  private fun startBarcodeScannerWithPermission() {
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
      startActivityForResult(Intent(this, BarcodeScannerActivity::class.java), BARCODE_REQUEST_CODE)
      return
    }
    pendingBarcodeStart = true
    ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA), CAMERA_PERMISSION_REQUEST_CODE)
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
    if (requestCode == BLE_PERMISSION_REQUEST_CODE) {
      val granted = grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED
      Log.i(TAG, "ble-permission-result granted=$granted")
      dispatchBleEvent(if (granted) "permission-granted" else "permission-denied", "")
      if (granted && pendingBleStart) {
        pendingBleStart = false
        startBleScanInternal()
      } else {
        pendingBleStart = false
      }
      return
    }
    if (requestCode == CAMERA_PERMISSION_REQUEST_CODE) {
      val granted = grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED
      if (granted && pendingBarcodeStart) {
        pendingBarcodeStart = false
        startActivityForResult(Intent(this, BarcodeScannerActivity::class.java), BARCODE_REQUEST_CODE)
      } else {
        pendingBarcodeStart = false
        dispatchBarcodeEvent("error", "Camera permission is required to scan a barcode.")
      }
      return
    }
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

  @Deprecated("Deprecated in Java")
  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)
    if (requestCode != BARCODE_REQUEST_CODE) return
    if (resultCode == RESULT_OK) {
      dispatchBarcodeEvent("result", data?.getStringExtra(BarcodeScannerActivity.EXTRA_BARCODE).orEmpty())
    } else {
      dispatchBarcodeEvent("cancelled", "")
    }
  }

  private fun dispatchBarcodeEvent(type: String, value: String) {
    val safeType = JSONObject.quote(type)
    val safeValue = JSONObject.quote(value)
    mainHandler.post {
      webView?.evaluateJavascript(
        "window.dispatchEvent(new CustomEvent('primovex-native-barcode',{detail:{type:$safeType,value:$safeValue}}));",
        null
      )
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

  override fun onDestroy() {
    Log.i(TAG, "activity-onDestroy")
    stopBleScanInternal()
    stopNativeRecognition(true, "activity-destroyed")
    webView = null
    super.onDestroy()
  }
}
