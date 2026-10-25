jest.mock('../src/lib/storage', () => require('./helpers').memoryStorage().mod);
jest.mock('../src/services/audit', () => ({ logEvent: jest.fn() }));
jest.mock('../src/lib/notify', () => ({ notifyAt: jest.fn(), notifyNow: jest.fn(), cancelNotification: jest.fn() }));
jest.mock('../src/lib/location', () => ({ watchPosition: jest.fn(), getPosition: jest.fn() }));
jest.mock('../src/services/sos', () => ({ dispatchSos: jest.fn(), sendAllClear: jest.fn(), sendMessageToContacts: jest.fn(), sendSmsTo: jest.fn() }));
jest.mock('../src/services/contacts', () => ({ getContacts: jest.fn(async () => []) }));
jest.mock('../src/services/settings', () => ({ getUserName: jest.fn(async () => 'T') }));
jest.mock('../src/services/safetyProfiles', () => ({ getActiveProfile: jest.fn(async () => ({ checkInMinutes: 30, maxMissedCheckIns: 2, deviationWarnMeters: 100 })) }));

import { SafetyStateStore } from '../src/services/safetyState';
import { CompanionState, GRACE_SECONDS, WalkState, companionStep, walkStep } from '../src/services/walk';

describe('safety state transitions', () => {
  it('green -> red -> green only via green', () => {
    const s = new SafetyStateStore(false);
    expect(s.getSnapshot().level).toBe('green');
    s.setRed(false);
    expect(s.getSnapshot()).toMatchObject({ level: 'red', isEmergencyActive: true, isLocationSharingActive: true });
    expect(s.canTransition('yellow')).toBe(false);
    expect(s.canTransition('green')).toBe(true);
    s.setGreen();
    expect(s.getSnapshot().isEmergencyActive).toBe(false);
  });
  it('stealth flag and notified contacts dedupe', () => {
    const s = new SafetyStateStore(false);
    s.setRed(true);
    s.markContactNotified('a');
    s.markContactNotified('a');
    expect(s.getSnapshot().isStealthMode).toBe(true);
    expect(s.getSnapshot().notifiedContacts).toEqual(['a']);
  });
  it('notifies subscribers', () => {
    const s = new SafetyStateStore(false);
    const fn = jest.fn();
    const off = s.subscribe(fn);
    s.setYellow();
    off();
    s.setGreen();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('walk timer', () => {
  const base: WalkState = { active: true, endAt: 1000, graceUntil: null, notificationId: null, durationMin: 1 };
  it('stays idle before expiry', () => expect(walkStep(base, 999).action).toBe('none'));
  it('enters grace at expiry then escalates only after grace', () => {
    const g = walkStep(base, 1000);
    expect(g.action).toBe('grace');
    expect(g.next.graceUntil).toBe(1000 + GRACE_SECONDS * 1000);
    expect(walkStep(g.next, 1000 + 59_000).action).toBe('none');
    expect(walkStep(g.next, 1000 + 60_000).action).toBe('escalate');
  });
  it('inactive does nothing', () => expect(walkStep({ ...base, active: false }, 99999).action).toBe('none'));
});

describe('companion check-ins', () => {
  const s: CompanionState = { active: true, companionIds: ['a'], destinationName: 'x', route: [], startedAt: 0, checkInMinutes: 30, maxMissed: 2, nextCheckInAt: 1000, pendingUntil: null, missed: 0, lastLevel: 'ok', lastReason: '' };
  it('prompts when due, counts a miss after the window, escalates on the 2nd miss', () => {
    const p = companionStep(s, 1000);
    expect(p.action).toBe('prompt');
    const m1 = companionStep(p.next, p.next.pendingUntil!);
    expect(m1.action).toBe('missed');
    expect(m1.next.missed).toBe(1);
    const p2 = companionStep(m1.next, m1.next.nextCheckInAt!);
    const m2 = companionStep(p2.next, p2.next.pendingUntil!);
    expect(m2.action).toBe('escalate');
  });
  it('no action before due', () => expect(companionStep(s, 500).action).toBe('none'));
});
