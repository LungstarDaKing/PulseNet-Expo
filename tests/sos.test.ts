const mem = require('./helpers').memoryStorage();
jest.mock('../src/lib/storage', () => require('./helpers').memoryStorage().mod);
jest.mock('../src/services/audit', () => ({ logEvent: jest.fn() }));
jest.mock('expo-sms', () => ({ isAvailableAsync: jest.fn(async () => true), sendSMSAsync: jest.fn(async () => ({ result: 'unknown' })) }));
jest.mock('../src/lib/location', () => ({
  getPosition: jest.fn(async () => ({ latitude: -29.86, longitude: 31.02, accuracy: 12, timestamp: Date.now() })),
  ensureLocationPermission: jest.fn(async () => true),
  watchPosition: jest.fn(async () => ({ remove: jest.fn() })),
}));
jest.mock('../src/lib/native', () => ({ sendSmsSilently: jest.fn(), callNumber: jest.fn(async () => true) }));
jest.mock('../src/services/contacts', () => ({ contactNumbers: jest.fn() }));
jest.mock('../src/services/settings', () => ({
  getLocationSharing: jest.fn(async () => true),
  getSettings: jest.fn(async () => ({ drillMode: false, vitalsAutoAlert: false, sosCountdownSeconds: 5 })),
  getUserName: jest.fn(async () => 'Thandi'),
}));
jest.mock('../src/services/safetyProfiles', () => ({ getActiveProfile: jest.fn(async () => ({ followUpMinutes: 3 })) }));

import * as SMS from 'expo-sms';
import { sendSmsSilently } from '../src/lib/native';
import { contactNumbers } from '../src/services/contacts';
import { getSettings } from '../src/services/settings';
import { _resetForTests, buildMessage, delivered, dispatchSos } from '../src/services/sos';

const silent = sendSmsSilently as jest.Mock;
const nums = contactNumbers as jest.Mock;
const settings = getSettings as jest.Mock;

beforeEach(() => {
  _resetForTests();
  silent.mockReset();
  nums.mockResolvedValue(['+27821234567', '+27831234567']);
  settings.mockResolvedValue({ drillMode: false, vitalsAutoAlert: false, sosCountdownSeconds: 5 });
  (SMS.sendSMSAsync as jest.Mock).mockClear();
  void mem;
});

describe('SOS dispatch', () => {
  it('reports delivered only when the radio accepted messages', async () => {
    silent.mockResolvedValue(2);
    const r = await dispatchSos({ emergencyType: 'a' });
    expect(delivered(r)).toBe(true);
    expect(r.smsSent).toBe(2);
    expect(r.locationIncluded).toBe(true);
    expect(silent.mock.calls[0][1]).toContain('maps.google.com/?q=-29.860000,31.020000');
  });
  it('falls back to composer and never claims delivery', async () => {
    silent.mockResolvedValue(-2); // module unavailable (Expo Go)
    const r = await dispatchSos({ emergencyType: 'b' });
    expect(delivered(r)).toBe(false);
    expect(r.usedManualComposer).toBe(true);
    expect(SMS.sendSMSAsync).toHaveBeenCalledTimes(1);
  });
  it('silent mode never opens the composer', async () => {
    silent.mockResolvedValue(-1);
    const r = await dispatchSos({ emergencyType: 'c', silent: true });
    expect(r.usedManualComposer).toBe(false);
    expect(SMS.sendSMSAsync).not.toHaveBeenCalled();
    expect(delivered(r)).toBe(false);
  });
  it('no contacts is reported, nothing sent', async () => {
    nums.mockResolvedValue([]);
    const r = await dispatchSos({ emergencyType: 'd' });
    expect(r.noContacts).toBe(true);
    expect(silent).not.toHaveBeenCalled();
  });
  it('drill mode sends nothing and is flagged simulated', async () => {
    settings.mockResolvedValue({ drillMode: true, vitalsAutoAlert: false, sosCountdownSeconds: 5 });
    const r = await dispatchSos({ emergencyType: 'e' });
    expect(r.simulated).toBe(true);
    expect(delivered(r)).toBe(false);
    expect(silent).not.toHaveBeenCalled();
    expect(SMS.sendSMSAsync).not.toHaveBeenCalled();
  });
  it('duplicate submissions within 10 s do not send twice', async () => {
    silent.mockResolvedValue(2);
    const [a, b] = await Promise.all([dispatchSos({ emergencyType: 'f' }), dispatchSos({ emergencyType: 'f' })]);
    const c = await dispatchSos({ emergencyType: 'f' });
    expect(silent).toHaveBeenCalledTimes(1);
    expect(a.duplicate || b.duplicate).toBe(true);
    expect(c.duplicate).toBe(true);
  });
});

describe('message', () => {
  it('is plain ASCII with location and numbers', () => {
    const m = buildMessage({ name: 'Thandi', emergencyType: 'manual SOS', position: { latitude: 1, longitude: 2, accuracy: 5, timestamp: 0 }, now: new Date(2026, 0, 1, 9, 5) });
    expect(m).toMatch(/^[\x20-\x7E]+$/);
    expect(m).toContain('09:05');
    expect(m).toContain('10111');
  });
  it('says so when location is missing', () => expect(buildMessage({ name: '', emergencyType: 'x', position: null })).toContain('Location unavailable'));
});
