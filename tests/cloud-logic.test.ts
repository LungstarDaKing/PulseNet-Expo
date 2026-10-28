jest.mock('../src/lib/supabase', () => ({ supabase: null, cloudConfigured: false, isNetworkError: () => false }));

import { buildMapHtml, safeJson } from '../src/lib/mapHtml';
import {
  CommunityAlert, containsPersonalData, firstAidTopicFor, looksUrgent, matchesFilter, removeAlert, suggestedSeverity,
  timeAgo, trustLevel, upsertAlert, validateReportInput,
} from '../src/services/alertsLogic';
import { validateCredentials } from '../src/services/auth';

const mk = (o: Partial<CommunityAlert> = {}): CommunityAlert => ({
  id: 'a', type: 'fire', severity: 'high', description: 'Shack fire', latitude: -29.857, longitude: 31.022, status: 'open',
  verified: false, confirmations: 0, created_at: '2026-10-25T10:00:00Z', distance_km: 1.2, confirmed_by_me: false, ...o,
});

describe('trust is never overstated', () => {
  it('unverified by default, corroborated at 2 confirmations, verified only by moderator flag', () => {
    expect(trustLevel({ verified: false, confirmations: 0 })).toBe('unverified');
    expect(trustLevel({ verified: false, confirmations: 1 })).toBe('unverified');
    expect(trustLevel({ verified: false, confirmations: 2 })).toBe('corroborated');
    expect(trustLevel({ verified: true, confirmations: 0 })).toBe('verified');
  });
});

describe('feed helpers', () => {
  it('filters emergency vs info by severity', () => {
    expect(matchesFilter('critical', 'emergency')).toBe(true);
    expect(matchesFilter('high', 'emergency')).toBe(true);
    expect(matchesFilter('medium', 'emergency')).toBe(false);
    expect(matchesFilter('medium', 'info')).toBe(true);
    expect(matchesFilter('high', 'info')).toBe(false);
    expect(matchesFilter('low', 'all')).toBe(true);
  });
  it('upsert keeps my confirmation flag and sorts newest first; remove works', () => {
    const l1 = upsertAlert([], mk({ id: 'old', created_at: '2026-10-25T08:00:00Z', confirmed_by_me: true }));
    const l2 = upsertAlert(l1, mk({ id: 'new', created_at: '2026-10-25T11:00:00Z' }));
    expect(l2.map((x) => x.id)).toEqual(['new', 'old']);
    const l3 = upsertAlert(l2, mk({ id: 'old', created_at: '2026-10-25T08:00:00Z', severity: 'critical', verified: true, confirmed_by_me: false }));
    expect(l3.find((x) => x.id === 'old')).toMatchObject({ severity: 'critical', verified: true, confirmed_by_me: true });
    expect(removeAlert(l3, 'old').map((x) => x.id)).toEqual(['new']);
  });
  it('time ago', () => {
    const now = Date.parse('2026-10-25T12:00:00Z');
    expect(timeAgo('2026-10-25T11:59:40Z', now)).toBe('just now');
    expect(timeAgo('2026-10-25T11:30:00Z', now)).toBe('30m ago');
    expect(timeAgo('2026-10-25T07:00:00Z', now)).toBe('5h ago');
    expect(timeAgo('2026-10-23T12:00:00Z', now)).toBe('2d ago');
  });
});

describe('report validation and severity', () => {
  const ok = { description: 'Shack fire near the taxi rank', latitude: -29.8, longitude: 31, evidence: [] };
  it('accepts a good report', () => expect(validateReportInput(ok)).toBeNull());
  it('rejects short text, bad coordinates, too many photos', () => {
    expect(validateReportInput({ ...ok, description: 'fire' })).not.toBeNull();
    expect(validateReportInput({ ...ok, latitude: NaN })).toMatch(/location/i);
    expect(validateReportInput({ ...ok, latitude: 95 })).toMatch(/location/i);
    expect(validateReportInput({ ...ok, evidence: [1, 2, 3, 4].map((n) => ({ uri: String(n), mime: 'image/jpeg' })) })).toMatch(/3 photos/);
  });
  it('type floor: fire is never below high, medical never below medium', () => {
    expect(suggestedSeverity('fire', 'low')).toBe('high');
    expect(suggestedSeverity('medical', 'low')).toBe('medium');
    expect(suggestedSeverity('crime', 'low')).toBe('low');
    expect(suggestedSeverity('crime', 'critical')).toBe('critical');
  });
  it('flags personal data that would be shown publicly', () => {
    expect(containsPersonalData('call me on 082 123 4567')).toBe(true);
    expect(containsPersonalData('ID 8001015009087')).toBe(true);
    expect(containsPersonalData('fire at the corner of Smith and Main')).toBe(false);
  });
});

describe('assistant safety helpers', () => {
  it('shows call buttons for danger words', () => {
    expect(looksUrgent('someone is following me')).toBe(true);
    expect(looksUrgent('there is a gas leak')).toBe(true);
    expect(looksUrgent('what is a good flashlight')).toBe(false);
  });
  it('maps questions to written first-aid topics', () => {
    expect(firstAidTopicFor('how do I treat a burn')).toBe('burns');
    expect(firstAidTopicFor('he is choking')).toBe('choking');
    expect(firstAidTopicFor('hello')).toBeNull();
  });
});

describe('credentials', () => {
  it('validates email and password rules', () => {
    expect(validateCredentials('bad', 'x', 'signin')).toMatch(/email/i);
    expect(validateCredentials('a@b.co', 'short', 'signup')).toMatch(/8/);
    expect(validateCredentials('a@b.co', 'longenough', 'signup')).toBeNull();
    expect(validateCredentials('a@b.co', 'x', 'signin')).toBeNull();
  });
});

describe('map html cannot be hijacked by report text', () => {
  const evil = '</script><script>alert(1)</script><img src=x onerror=alert(2)> & \u2028';
  it('escapes angle brackets, ampersands and line separators', () => {
    const j = safeJson({ t: evil });
    expect(j).not.toMatch(/[<>&\u2028]/);
    expect(JSON.parse(j).t).toBe(evil);
  });
  it('page has integrity-pinned Leaflet, textContent popups, and no raw payload', () => {
    const html = buildMapHtml({ latitude: 1, longitude: 2 }, [{ lat: 1, lon: 2, title: evil, detail: evil, color: '#fff', kind: 'alert' }]);
    expect(html).not.toContain('</script><script>alert(1)');
    expect(html).toContain('integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="');
    expect(html).toContain('textContent');
    expect(html).not.toMatch(/innerHTML\s*=\s*[^']*p\./);
  });
});
