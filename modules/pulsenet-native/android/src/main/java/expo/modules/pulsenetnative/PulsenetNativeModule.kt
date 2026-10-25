package expo.modules.pulsenetnative

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.telephony.SmsManager
import android.view.WindowManager
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Port of the Flutter MainActivity bridge. Things Expo's managed APIs cannot do:
 *  - send SMS silently (needs only a cellular signal)
 *  - place a call directly (falls back to the dialer without CALL_PHONE)
 *  - FLAG_SECURE (no screenshots / blank app-switcher preview)
 * Permissions are requested from JS (PermissionsAndroid); this module only checks them.
 */
class PulsenetNativeModule : Module() {
  private val context get() = appContext.reactContext ?: throw IllegalStateException("No context")

  override fun definition() = ModuleDefinition {
    Name("PulsenetNative")

    // >0 recipients handed to the radio, 0 none, -1 SEND_SMS not granted
    Function("sendSms") { numbers: List<String>, message: String ->
      if (ContextCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS)
        != PackageManager.PERMISSION_GRANTED) {
        return@Function -1
      }
      if (numbers.isEmpty() || message.isEmpty()) return@Function 0
      val sms: SmsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        context.getSystemService(SmsManager::class.java)
      } else {
        @Suppress("DEPRECATION") SmsManager.getDefault()
      }
      var sent = 0
      for (number in numbers) {
        try {
          val parts = sms.divideMessage(message)
          sms.sendMultipartTextMessage(number, null, parts, null, null)
          sent++
        } catch (e: Exception) {
          // one bad number must not block the others
        }
      }
      return@Function sent
    }

    Function("callNumber") { number: String ->
      if (number.isEmpty()) return@Function false
      val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.CALL_PHONE) ==
        PackageManager.PERMISSION_GRANTED
      val action = if (granted) Intent.ACTION_CALL else Intent.ACTION_DIAL
      val intent = Intent(action, Uri.parse("tel:" + Uri.encode(number)))
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      return@Function try {
        context.startActivity(intent)
        true
      } catch (e: Exception) {
        false
      }
    }

    Function("setSecureScreen") { enabled: Boolean ->
      val activity = appContext.currentActivity ?: return@Function false
      activity.runOnUiThread {
        if (enabled) activity.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
      }
      return@Function true
    }
  }
}
