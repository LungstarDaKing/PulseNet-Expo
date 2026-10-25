import { boundingBox, distanceToRoute, distanceToSegment, formatDistance, haversine } from '../src/lib/geo';
import { isValidPhone, normalizePhone } from '../src/lib/phone';

const durban = { latitude: -29.8587, longitude: 31.0218 };
const jhb = { latitude: -26.2041, longitude: 28.0473 };

describe('geo', () => {
  it('haversine Durban-Johannesburg is about 500 km', () => {
    const d = haversine(durban, jhb);
    expect(d).toBeGreaterThan(480_000);
    expect(d).toBeLessThan(520_000);
  });
  it('distance to a segment is perpendicular distance', () => {
    const a = { latitude: 0, longitude: 0 };
    const b = { latitude: 0, longitude: 0.01 };
    const p = { latitude: 0.001, longitude: 0.005 };
    expect(distanceToSegment(p, a, b)).toBeGreaterThan(105);
    expect(distanceToSegment(p, a, b)).toBeLessThan(115);
  });
  it('route distance is Infinity for empty route and 0 on the route', () => {
    expect(distanceToRoute(durban, [])).toBe(Infinity);
    expect(distanceToRoute(durban, [durban, jhb])).toBeLessThan(1);
  });
  it('bounding box contains centre', () => {
    const [a, b, c, d] = boundingBox(durban, 5000);
    expect(a).toBeLessThan(durban.latitude);
    expect(c).toBeGreaterThan(durban.latitude);
    expect(b).toBeLessThan(durban.longitude);
    expect(d).toBeGreaterThan(durban.longitude);
  });
  it('formats distances', () => {
    expect(formatDistance(450)).toBe('450 m');
    expect(formatDistance(1500)).toBe('1.5 km');
  });
});

describe('phone', () => {
  it('normalises SA numbers', () => {
    expect(normalizePhone('082 123 4567')).toBe('+27821234567');
    expect(normalizePhone('27821234567')).toBe('+27821234567');
    expect(normalizePhone('0027821234567')).toBe('+27821234567');
    expect(normalizePhone('+27 82 123 4567')).toBe('+27821234567');
  });
  it('validates', () => {
    expect(isValidPhone('082 123 4567')).toBe(true);
    expect(isValidPhone('abc')).toBe(false);
    expect(isValidPhone('12')).toBe(false);
  });
});
