import { classifyIncident, findDuplicate, jaccard, summarize, tokenize, validateReport, IncidentReport } from '../src/services/incidents';

jest.mock('../src/lib/storage', () => require('./helpers').memoryStorage().mod);
jest.mock('../src/services/audit', () => ({ logEvent: jest.fn() }));

const here = { latitude: -29.86, longitude: 31.02 };
const mk = (o: Partial<IncidentReport>): IncidentReport => ({ id: 'x', type: 'crime', severity: 'low', description: '', latitude: here.latitude, longitude: here.longitude, reportedAt: new Date().toISOString(), status: 'open', matched: [], updates: [], ...o });

describe('incident classification', () => {
  it('detects armed robbery as crime/critical', () => {
    const c = classifyIncident('Armed robbery at the garage, shots fired');
    expect(c.type).toBe('crime');
    expect(c.severity).toBe('critical');
  });
  it('detects traffic', () => expect(classifyIncident('Bad accident, two cars collision on N2').type).toBe('trafficAccident'));
  it('detects fire as environmental hazard high', () => {
    const c = classifyIncident('Shack fire spreading with smoke');
    expect(c.type).toBe('environmentalHazard');
    expect(c.severity).toBe('high');
  });
  it('whole-word match: "gunning" does not match gun', () => expect(classifyIncident('car gunning down the road').matched).not.toContain('gun'));
  it('unknown text gets low severity and zero match strength', () => {
    const c = classifyIncident('lovely weather today');
    expect(c.severity).toBe('low');
    expect(c.matchStrength).toBe(0);
  });
});

describe('duplicates', () => {
  const at = here;
  it('flags same type, same place, similar words', () => {
    const existing = [mk({ id: 'a', description: 'robbery outside the shop on main road' })];
    expect(findDuplicate({ type: 'crime', description: 'robbery outside shop main road', at, time: Date.now() }, existing)?.id).toBe('a');
  });
  it('ignores far away or old or resolved reports', () => {
    const far = mk({ id: 'f', latitude: here.latitude + 0.05, description: 'robbery outside the shop' });
    const old = mk({ id: 'o', reportedAt: new Date(Date.now() - 5 * 3600_000).toISOString(), description: 'robbery outside the shop' });
    const done = mk({ id: 'r', status: 'resolved', description: 'robbery outside the shop' });
    expect(findDuplicate({ type: 'crime', description: 'robbery outside the shop', at, time: Date.now() }, [far, old, done])).toBeNull();
  });
  it('jaccard and tokenizer', () => {
    expect(jaccard(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3);
    expect(tokenize('A big, red car!')).toEqual(['big', 'red', 'car']);
  });
});

describe('validation and summary', () => {
  it('requires 10 to 500 chars', () => {
    expect(validateReport('short')).not.toBeNull();
    expect(validateReport('x'.repeat(501))).not.toBeNull();
    expect(validateReport('A proper description')).toBeNull();
  });
  it('summarises', () => {
    expect(summarize([])).toMatch(/No reports/);
    expect(summarize([mk({ severity: 'high' })])).toMatch(/Highest severity: high/);
  });
});
