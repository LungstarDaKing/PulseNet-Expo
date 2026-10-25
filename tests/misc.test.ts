jest.mock('../src/lib/storage', () => require('./helpers').memoryStorage().mod);
jest.mock('../src/services/audit', () => ({ logEvent: jest.fn() }));
jest.mock('../src/lib/notify', () => ({ notifyNow: jest.fn(), notifyAt: jest.fn(), cancelNotification: jest.fn() }));
jest.mock('../src/lib/location', () => ({ getPosition: jest.fn(), watchPosition: jest.fn() }));
jest.mock('../src/services/sos', () => ({ sendMessageToContacts: jest.fn(async () => 0), dispatchSos: jest.fn(), sendSmsTo: jest.fn() }));
jest.mock('../src/services/settings', () => ({ getSettings: jest.fn(async () => ({ vitalsAutoAlert: false })), getUserName: jest.fn(async () => '') }));
jest.mock('../src/services/contacts', () => ({ getContacts: jest.fn(async () => []) }));
jest.mock('../src/services/safetyState', () => ({ safetyState: {} }));

import { matchDistress } from '../src/data/distressPhrases';
import { FIRST_AID } from '../src/data/firstAid';
import { TIP_CATEGORIES } from '../src/data/safetyTips';
import { tapStep } from '../src/services/distress';
import { JourneyMonitor } from '../src/services/journey';
import { parseNominatim, parseOsrm } from '../src/services/routing';
import { UserPlace, geofenceStep, kindOf, parseOverpass, validatePlace } from '../src/services/safePlaces';
import { BADGES, dailyChallenges, levelFor, nextStreak } from '../src/services/safePoints';
import { StealthTap } from '../src/services/stealthTap';
import { riskScore, riskLabel, validateRide } from '../src/services/taxi';
import { _resetVitalsForTests, b64ToBytes, bpmFromTaps, classifyBpm, parseHeartRate, recordReading } from '../src/services/vitals';
import { hashEntry, redact, verifyChain, AuditEntry } from '../src/services/auditCore';
import { validateConfig, DEFAULT } from '../src/services/fakeCall';
import { validateProfile } from '../src/services/safetyProfiles';

const P = (lat: number, lon: number, t = 0, acc = 5) => ({ latitude: lat, longitude: lon, t, accuracy: acc });

describe('journey monitor', () => {
  const route = [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0.01 }];
  it('needs two consecutive off-route samples (GPS jitter guard)', () => {
    const m = new JourneyMonitor({ route });
    expect(m.add(P(0.0013, 0.002, 0)).level).toBe('ok');
    expect(m.add(P(0.0013, 0.003, 5000)).level).toBe('critical'); // ~145 m > 100 m critical
  });
  it('ignores inaccurate fixes', () => {
    const m = new JourneyMonitor({ route });
    m.add(P(0.003, 0.002, 0, 300));
    expect(m.add(P(0.003, 0.003, 5000, 300)).level).toBe('ok');
  });
  it('flags a long stop', () => {
    const m = new JourneyMonitor();
    m.add(P(1, 1, 0));
    expect(m.add(P(1, 1, 200_000)).level).toBe('warning');
    expect(m.add(P(1, 1, 700_000)).level).toBe('critical');
  });
});

describe('vitals', () => {
  it('parses HR characteristic uint8 and uint16', () => {
    expect(parseHeartRate(Uint8Array.from([0, 72]))).toBe(72);
    expect(parseHeartRate(Uint8Array.from([1, 0x2c, 0x01]))).toBe(300 > 300 ? 0 : null); // 300 bpm is rejected
    expect(parseHeartRate(Uint8Array.from([1, 150, 0]))).toBe(150);
    expect(parseHeartRate(Uint8Array.from([0]))).toBeNull();
    expect(b64ToBytes('ADg=')).toEqual(Uint8Array.from([0, 56]));
  });
  it('zones follow documented thresholds', () => {
    expect([30, 45, 70, 130, 150].map(classifyBpm)).toEqual(['critical-low', 'low', 'normal', 'elevated', 'critical-high']);
  });
  it('tap counting uses the median interval', () => {
    const t = [0, 800, 1600, 2400, 3200, 4000];
    expect(bpmFromTaps(t)).toBe(75);
    expect(bpmFromTaps([0, 800, 1600])).toBeNull();
  });
  it('alerts only after 3 sustained critical readings, then respects cooldown', async () => {
    _resetVitalsForTests();
    const t0 = 1_000_000;
    expect((await recordReading(150, 'manual', t0)).outcome.alerted).toBe(false);
    expect((await recordReading(151, 'manual', t0 + 1000)).outcome.alerted).toBe(false);
    expect((await recordReading(152, 'manual', t0 + 2000)).outcome.alerted).toBe(true);
    expect((await recordReading(153, 'manual', t0 + 3000)).outcome.alerted).toBe(false);
    await expect(recordReading(5, 'manual')).rejects.toThrow();
  });
});

describe('taxi', () => {
  const checks = { plateMatches: true, driverMatches: true, bookedInApp: true, childLocksOff: true, routeFollowed: true };
  it('risk grows with unchecked items, deviations, concerns and night', () => {
    const day = new Date(2026, 0, 1, 12).toISOString();
    expect(riskScore({ checks, deviations: 0, concerns: [], startedAt: day })).toBe(0);
    const bad = riskScore({ checks: { ...checks, plateMatches: false }, deviations: 2, concerns: ['x'], startedAt: new Date(2026, 0, 1, 23).toISOString() });
    expect(bad).toBe(15 + 30 + 5 + 10);
    expect(riskLabel(bad)).toBe('High');
  });
  it('validates plate', () => {
    expect(validateRide({ driverName: '', plate: '' })).not.toBeNull();
    expect(validateRide({ driverName: '', plate: 'ND 123-456' })).toBeNull();
    expect(validateRide({ driverName: '', plate: '<script>' })).not.toBeNull();
  });
});

describe('safe places', () => {
  it('parses Overpass nodes and ways, drops untagged/unknown, sorts by distance', () => {
    const r = parseOverpass({ elements: [
      { type: 'node', id: 1, lat: -29.87, lon: 31.03, tags: { amenity: 'police', name: 'Central SAPS', phone: '+27 31 000 0000' } },
      { type: 'way', id: 2, center: { lat: -29.861, lon: 31.021 }, tags: { amenity: 'hospital' } },
      { type: 'node', id: 3, lat: 1, lon: 1, tags: { amenity: 'cafe' } },
      { type: 'node', id: 4, tags: { amenity: 'clinic' } },
    ] }, { latitude: -29.86, longitude: 31.02 });
    expect(r.map((x) => x.id)).toEqual(['osm:way/2', 'osm:node/1']);
    expect(r[0].name).toBe('Hospital');
    expect(kindOf({ social_facility: 'shelter' })).toBe('shelter');
  });
  it('geofence has hysteresis', () => {
    const place: UserPlace = { id: 'h', name: 'Home', latitude: 0, longitude: 0, radiusM: 100, tags: [], notifyOnEnter: true, notifyOnExit: true, createdAt: '' };
    let s = geofenceStep([place], new Set(), { latitude: 0, longitude: 0.0005 }); // ~55 m
    expect(s.events).toEqual([{ placeId: 'h', kind: 'enter' }]);
    s = geofenceStep([place], s.inside, { latitude: 0, longitude: 0.00095 }); // ~105 m: inside hysteresis band
    expect(s.events).toEqual([]);
    s = geofenceStep([place], s.inside, { latitude: 0, longitude: 0.0013 }); // ~145 m
    expect(s.events).toEqual([{ placeId: 'h', kind: 'exit' }]);
  });
  it('validates place', () => {
    expect(validatePlace('', 100)).not.toBeNull();
    expect(validatePlace('Home', 10)).not.toBeNull();
    expect(validatePlace('Home', 100)).toBeNull();
  });
});

describe('routing parsers', () => {
  it('parses Nominatim and OSRM, rejects bad responses', () => {
    expect(parseNominatim([{ lat: '-29.8', lon: '31.0', display_name: 'A, Durban' }, { lat: 'x', lon: 'y', display_name: 'bad' }])).toHaveLength(1);
    const r = parseOsrm({ code: 'Ok', routes: [{ distance: 1000, duration: 700, geometry: { coordinates: [[31, -29.8], [31.01, -29.81]] } }] });
    expect(r?.points[0]).toEqual({ latitude: -29.8, longitude: 31 });
    expect(parseOsrm({ code: 'NoRoute' })).toBeNull();
  });
});

describe('distress', () => {
  it('matches whole phrases only, per language', () => {
    expect(matchDistress('please help me now', 'en-ZA')).toBe('help me');
    expect(matchDistress('that was helpful', 'en-ZA')).toBeNull();
    expect(matchDistress('ek is bang', 'af-ZA')).toBe('ek is bang');
    expect(matchDistress('ngicela usizo', 'zu-ZA')).toBe('ngicela usizo');
    expect(matchDistress('ndiyabonga', 'xh-ZA')).toBeNull(); // "thank you" must never trigger
  });
  it('needs 4 taps within 5 s', () => {
    let t: number[] = [];
    let r = { taps: t, armed: false };
    for (const at of [0, 500, 1000]) { r = tapStep(r.taps, at); expect(r.armed).toBe(false); }
    expect(tapStep(r.taps, 1500).armed).toBe(true);
    expect(tapStep([0, 500, 1000], 9000).armed).toBe(false);
  });
  it('stealth triple tap', () => {
    const s = new StealthTap();
    expect([0, 300, 600].map((t) => s.registerTap(t))).toEqual([false, false, true]);
    expect(s.registerTap(5000)).toBe(false);
  });
});

describe('safe points', () => {
  it('levels match the original table', () => {
    expect(levelFor(0).name).toBe('Newcomer');
    expect(levelFor(49).name).toBe('Scout');
    expect(levelFor(50).name).toBe('Sentry');
    expect(levelFor(100000).level).toBe(15);
  });
  it('streak rules', () => {
    expect(nextStreak(null, '2026-10-25', 0)).toBe(1);
    expect(nextStreak('2026-10-24', '2026-10-25', 3)).toBe(4);
    expect(nextStreak('2026-10-20', '2026-10-25', 3)).toBe(1);
    expect(nextStreak('2026-10-25', '2026-10-25', 3)).toBe(3);
  });
  it('three distinct daily challenges, deterministic', () => {
    const a = dailyChallenges('2026-10-25');
    expect(new Set(a.map((c) => c.id)).size).toBe(3);
    expect(dailyChallenges('2026-10-25')).toEqual(a);
    expect(BADGES.length).toBeGreaterThan(8);
  });
});

describe('content', () => {
  it('first aid has steps for every topic and tips are complete', () => {
    expect(FIRST_AID).toHaveLength(10);
    FIRST_AID.forEach((t) => { expect(t.steps.length).toBeGreaterThanOrEqual(4); expect(t.never.length).toBeGreaterThan(0); });
    TIP_CATEGORIES.forEach((c) => expect(c.tips).toHaveLength(10));
  });
});

describe('validation and audit', () => {
  it('fake call config', () => {
    expect(validateConfig(DEFAULT)).toBeNull();
    expect(validateConfig({ ...DEFAULT, callerName: '' })).not.toBeNull();
    expect(validateConfig({ ...DEFAULT, durationSeconds: 1 })).not.toBeNull();
  });
  it('profile bounds', () => {
    expect(validateProfile({ name: 'a', followUpMinutes: 3, checkInMinutes: 30, maxMissedCheckIns: 2, deviationWarnMeters: 100 })).toBeNull();
    expect(validateProfile({ name: 'a', followUpMinutes: 0, checkInMinutes: 30, maxMissedCheckIns: 2, deviationWarnMeters: 100 })).not.toBeNull();
  });
  it('redacts sensitive keys and detects tampering', () => {
    expect(redact({ phone: '+27', latitude: 1, count: 2, nested: { pin: '1' } })).toEqual({ phone: '[redacted]', latitude: '[redacted]', count: 2, nested: { pin: '[redacted]' } });
    const mk = (id: string, prev: string): AuditEntry => { const b = { id, ts: 't', level: 'info' as const, event: 'e', description: 'd', prev }; return { ...b, hash: hashEntry(b) }; };
    const a = mk('1', 'genesis');
    const b = mk('2', a.hash);
    expect(verifyChain([a, b]).ok).toBe(true);
    expect(verifyChain([a, { ...b, description: 'tampered' }]).ok).toBe(false);
    expect(verifyChain([a, mk('3', 'wrong')]).ok).toBe(false);
  });
});
