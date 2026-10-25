import { Linking, PermissionsAndroid, Platform } from 'react-native';
import PulsenetNative from '../../modules/pulsenet-native';

/**
 * Thin wrapper over the local Expo module (modules/pulsenet-native).
 * Every method fails soft so the emergency flow never throws.
 * Expo Go / iOS: the module is absent, so SMS falls back to the composer (see sos.ts).
 */
export const nativeAvailable = Platform.OS === 'android' && PulsenetNative != null;

async function ensure(permission: 'android.permission.SEND_SMS' | 'android.permission.CALL_PHONE'): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    if (await PermissionsAndroid.check(permission)) return true;
    const r = await PermissionsAndroid.request(permission);
    return r === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

/** >0 recipients handed to the radio, 0 none sent, -1 permission denied, -2 not supported here. */
export async function sendSmsSilently(numbers: string[], message: string): Promise<number> {
  if (!nativeAvailable || !PulsenetNative) return -2;
  if (!(await ensure('android.permission.SEND_SMS'))) return -1;
  try {
    return PulsenetNative.sendSms(numbers, message);
  } catch {
    return 0;
  }
}

/** Calls directly when CALL_PHONE is granted, otherwise opens the dialer. */
export async function callNumber(number: string): Promise<boolean> {
  if (nativeAvailable && PulsenetNative) {
    await ensure('android.permission.CALL_PHONE');
    try {
      if (PulsenetNative.callNumber(number)) return true;
    } catch {
      // fall through to dialer
    }
  }
  try {
    await Linking.openURL(`tel:${encodeURIComponent(number)}`);
    return true;
  } catch {
    return false;
  }
}

/** FLAG_SECURE: blocks screenshots and blanks the app-switcher preview. */
export function setSecureScreen(enabled: boolean): void {
  try {
    if (nativeAvailable) PulsenetNative?.setSecureScreen(enabled);
  } catch {
    // ignore
  }
}
