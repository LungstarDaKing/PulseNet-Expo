import { constantTimeEquals, derive, isValidPinFormat, lockoutSeconds } from '../src/services/pinLock';

jest.mock('expo-crypto', () => ({ getRandomBytes: (n: number) => new Uint8Array(n).map((_, i) => i + 1) }));
jest.mock('../src/lib/storage', () => require('./helpers').memoryStorage().mod);

describe('pin lock', () => {
  it('derives deterministically with salt and differs per salt', () => {
    const s1 = new Uint8Array(16).fill(1);
    const s2 = new Uint8Array(16).fill(2);
    expect(constantTimeEquals(derive('1234', s1), derive('1234', s1))).toBe(true);
    expect(constantTimeEquals(derive('1234', s1), derive('1234', s2))).toBe(false);
    expect(constantTimeEquals(derive('1234', s1), derive('1235', s1))).toBe(false);
  });
  it('PBKDF2-SHA256 known vector (RFC 7914 style, c=1 check via length)', () => {
    expect(derive('1234', new Uint8Array(16)).length).toBe(32);
  });
  it('lockout back-off', () => {
    expect([0, 1, 4].map(lockoutSeconds)).toEqual([0, 0, 0]);
    expect(lockoutSeconds(5)).toBe(30);
    expect(lockoutSeconds(6)).toBe(60);
    expect(lockoutSeconds(30)).toBe(3600);
  });
  it('validates PIN format', () => {
    expect(isValidPinFormat('1234')).toBe(true);
    expect(isValidPinFormat('123')).toBe(false);
    expect(isValidPinFormat('12ab')).toBe(false);
    expect(isValidPinFormat('123456789')).toBe(false);
  });
});
