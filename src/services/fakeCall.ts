import { cancelNotification, notifyAt, notifyNow } from '../lib/notify';
import { plainGetJSON, plainSetJSON } from '../lib/storage';
import { logEvent } from './audit';
import { safetyState } from './safetyState';
import { dispatchSos, sendMessageToContacts } from './sos';

/**
 * Fake call / exit assistance. A scheduled call raises a local notification (works in the background);
 * opening it shows a realistic full-screen incoming call. Other strategies run real actions.
 */
export type ExitStrategy = 'fakeCall' | 'fakeText' | 'shareLocation' | 'silentSos';
export const STRATEGIES: { id: ExitStrategy; label: string; description: string }[] = [
  { id: 'fakeCall', label: 'Fake incoming call', description: 'Your phone rings with a call from your chosen contact' },
  { id: 'fakeText', label: 'Fake text message', description: 'A message notification asking you to come home' },
  { id: 'shareLocation', label: 'Share my location', description: 'Texts your emergency contacts a map link' },
  { id: 'silentSos', label: 'Silent SOS', description: 'Alerts your emergency contacts without any sound or screen' },
];

export interface FakeCallConfig {
  callerName: string;
  callerNumber: string;
  delaySeconds: number;
  durationSeconds: number;
  strategy: ExitStrategy;
  textMessage: string;
}
export const DEFAULT: FakeCallConfig = { callerName: 'Mom', callerNumber: '', delaySeconds: 15, durationSeconds: 120, strategy: 'fakeCall', textMessage: 'Where are you? Please come home now, it is important.' };
const KEY = 'fake_call_config_v3';
const SCHEDULED = 'fake_call_scheduled_v3';
const HISTORY = 'fake_call_history_v3';

export function validateConfig(c: FakeCallConfig): string | null {
  if (!c.callerName.trim()) return 'Enter the caller name';
  if (c.delaySeconds < 0 || c.delaySeconds > 3600) return 'Delay must be 0 to 3600 seconds';
  if (c.durationSeconds < 10 || c.durationSeconds > 1800) return 'Call length must be 10 to 1800 seconds';
  return null;
}
export const getConfig = async (): Promise<FakeCallConfig> => ({ ...DEFAULT, ...(await plainGetJSON<Partial<FakeCallConfig>>(KEY, {})) });
export async function saveConfig(c: FakeCallConfig): Promise<void> {
  const e = validateConfig(c);
  if (e) throw new Error(e);
  await plainSetJSON(KEY, c);
}

interface Scheduled { at: number; notificationId: string | null; strategy: ExitStrategy }
export const getScheduled = () => plainGetJSON<Scheduled | null>(SCHEDULED, null);
export const getHistory = () => plainGetJSON<{ at: string; strategy: ExitStrategy }[]>(HISTORY, []);

/** Runs the strategy now. Returns where the UI should go: 'call' opens the live fake-call screen. */
export async function execute(c: FakeCallConfig): Promise<'call' | 'done'> {
  await plainSetJSON(HISTORY, [{ at: new Date().toISOString(), strategy: c.strategy }, ...(await getHistory())].slice(0, 30));
  await logEvent('exit_strategy', 'Exit strategy executed', { strategy: c.strategy });
  switch (c.strategy) {
    case 'fakeCall':
      return 'call';
    case 'fakeText':
      await notifyNow(c.callerName, c.textMessage);
      return 'done';
    case 'shareLocation':
      await sendMessageToContacts('I want to leave a situation. Here is my location.', { allowComposer: true });
      return 'done';
    case 'silentSos':
      safetyState.setRed(true);
      await dispatchSos({ emergencyType: 'exit strategy', silent: true });
      return 'done';
  }
}

export async function schedule(c: FakeCallConfig): Promise<number> {
  await cancelScheduled();
  const at = Date.now() + c.delaySeconds * 1000;
  const body = c.strategy === 'fakeCall' ? 'Incoming call' : c.textMessage;
  const id = await notifyAt(new Date(at), c.callerName, body, { fakeCall: c.strategy === 'fakeCall' });
  await plainSetJSON(SCHEDULED, { at, notificationId: id, strategy: c.strategy } satisfies Scheduled);
  return at;
}
export async function cancelScheduled(): Promise<void> {
  const s = await getScheduled();
  await cancelNotification(s?.notificationId);
  await plainSetJSON(SCHEDULED, null);
}
