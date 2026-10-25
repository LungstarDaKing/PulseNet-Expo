import { requireOptionalNativeModule } from 'expo';

export interface PulsenetNativeApi {
  /** >0 recipients handed to the radio, 0 none, -1 SEND_SMS permission missing */
  sendSms(numbers: string[], message: string): number;
  callNumber(number: string): boolean;
  setSecureScreen(enabled: boolean): boolean;
}

/** null in Expo Go / on iOS / when the native build does not include the module. */
const Native = requireOptionalNativeModule<PulsenetNativeApi>('PulsenetNative');
export default Native;
