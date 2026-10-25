import { EonetResponse, MeteoResponse, UsgsResponse, DEFAULT_CONFIG, DangerAlert, deriveWeatherHazards, parseEonet, parseUsgs, selectAlerts } from '../src/services/danger';

jest.mock('../src/lib/storage', () => require('./helpers').memoryStorage().mod);
jest.mock('../src/lib/notify', () => ({ notifyNow: jest.fn() }));
jest.mock('../src/lib/location', () => ({ getPosition: jest.fn() }));
jest.mock('../src/services/audit', () => ({ logEvent: jest.fn() }));

// TEST FIXTURES shaped like the public API responses. The app itself never uses fixtures.
const at = { latitude: -29.86, longitude: 31.02 };

describe('USGS parser', () => {
  const r: UsgsResponse = { features: [
    { id: 'us1', properties: { mag: 5.4, place: '40 km S of Durban', time: 1_700_000_000_000, url: 'https://earthquake.usgs.gov/x' }, geometry: { coordinates: [31.0, -30.2, 10] } },
    { id: 'us2', properties: { mag: null, place: 'x', time: 1 }, geometry: { coordinates: [0, 0, 0] } },
  ] };
  it('keeps valid events, skips null magnitude, sets severity from magnitude and distance', () => {
    const a = parseUsgs(r, at);
    expect(a).toHaveLength(1);
    expect(a[0].id).toBe('usgs:us1');
    expect(a[0].severity).toBe('high');
    expect(a[0].distanceM).toBeGreaterThan(30_000);
  });
});

describe('EONET parser', () => {
  const r: EonetResponse = { events: [
    { id: 'EONET_1', title: 'Wildfire near X', link: 'https://eonet.gsfc.nasa.gov/1', categories: [{ id: 'wildfires', title: 'Wildfires' }], geometry: [{ date: '2026-10-24T00:00:00Z', type: 'Point', coordinates: [31.1, -29.9] }] },
    { id: 'EONET_2', title: 'Sea ice', categories: [{ id: 'seaLakeIce', title: 'Sea and Lake Ice' }], geometry: [{ date: '2026-10-24T00:00:00Z', type: 'Point', coordinates: [0, 0] }] },
    { id: 'EONET_3', title: 'Storm area', categories: [{ id: 'severeStorms', title: 'Severe Storms' }], geometry: [{ date: '2026-10-24T00:00:00Z', type: 'Polygon', coordinates: [[[31, -29.8], [31.2, -29.8], [31.2, -30], [31, -30]]] }] },
  ] };
  it('maps categories, drops unsupported ones, handles polygons', () => {
    const a = parseEonet(r, at);
    expect(a.map((x) => x.id).sort()).toEqual(['eonet:EONET_1', 'eonet:EONET_3']);
    expect(a.find((x) => x.id === 'eonet:EONET_1')!.severity).toBe('high');
  });
});

describe('weather hazard derivation', () => {
  const now = new Date('2026-10-25T10:00:00Z');
  const hours = ['2026-10-25T10:00', '2026-10-25T11:00', '2026-10-25T12:00', '2026-10-25T13:00'];
  const base = (o: Partial<MeteoResponse['hourly']>): MeteoResponse => ({ hourly: { time: hours, weather_code: [0, 0, 0, 0], wind_gusts_10m: [10, 10, 10, 10], precipitation: [0, 0, 0, 0], temperature_2m: [22, 22, 22, 22], ...o } });
  it('nothing for calm weather', () => expect(deriveWeatherHazards(base({}), at, now)).toEqual([]));
  it('thunderstorm with hail is high', () => {
    const a = deriveWeatherHazards(base({ weather_code: [0, 96, 0, 0] }), at, now);
    expect(a[0].severity).toBe('high');
    expect(a[0].source).toMatch(/not an official warning/);
  });
  it('wind gusts and heat thresholds', () => {
    const a = deriveWeatherHazards(base({ wind_gusts_10m: [10, 70, 95, 10], temperature_2m: [22, 22, 41, 22] }), at, now);
    const ids = a.map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(['meteo:wind', 'meteo:gale', 'meteo:heat']));
  });
  it('ignores hours beyond the 6 hour window and past hours', () => {
    const r = base({ weather_code: [0, 0, 0, 99] });
    expect(deriveWeatherHazards(r, at, now, 2)).toEqual([]);
  });
});

describe('selection', () => {
  const mk = (o: Partial<DangerAlert>): DangerAlert => ({ id: 'a', type: 'crime', title: 't', description: 'd', latitude: 0, longitude: 0, distanceM: 100, timestamp: '', severity: 'low', source: 'Reported on this device', basis: '', ...o });
  it('sorts by severity then distance, dedupes, filters by type and radius', () => {
    const all = [
      mk({ id: '1', severity: 'low', distanceM: 10 }),
      mk({ id: '2', severity: 'high', distanceM: 900 }),
      mk({ id: '2', severity: 'high', distanceM: 900 }),
      mk({ id: '3', severity: 'high', distanceM: 100 }),
      mk({ id: '4', type: 'civilUnrest', severity: 'critical' }),
      mk({ id: '5', severity: 'critical', distanceM: 50_000 }),
    ];
    const out = selectAlerts(all, { ...DEFAULT_CONFIG, types: ['crime'], radiusM: 5000 });
    expect(out.map((a) => a.id)).toEqual(['3', '2', '1']);
  });
});
