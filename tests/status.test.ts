jest.mock('../src/lib/supabase', () => ({ supabase: null, cloudConfigured: false, isNetworkError: () => false }));
jest.mock('../src/lib/storage', () => require('./helpers').memoryStorage().mod);
import { matchDistress } from '../src/data/distressPhrases';
import { interpretRpcError } from '../src/services/cloudStatus';
import { tapStep } from '../src/services/distress';
import { crashText } from '../src/lib/crashLog';

describe('connection check wording', () => {
  it('tells you to run the SQL file when functions are missing', () => {
    const r = interpretRpcError({ code: 'PGRST202', message: 'Could not find the function public.nearby_alerts' });
    expect(r.state).toBe('fail');
    expect(r.fix).toMatch(/SQL Editor/);
  });
  it('treats permission errors as "sign in", and bad keys as key problems', () => {
    expect(interpretRpcError({ code: '42501' }).state).toBe('warn');
    expect(interpretRpcError({ message: 'Invalid JWT' }).fix).toMatch(/anon/);
  });
});
describe('crash text', () => {
  it('includes message and time', () => {
    const t = crashText({ at: '2026-10-27T10:00:00Z', message: 'boom', stack: 'at x', fatal: true });
    expect(t).toContain('boom');
    expect(t).toContain('(fatal)');
  });
});
describe('distress gesture is pure', () => {
  it('still needs 4 taps', () => { expect(tapStep([0, 1, 2], 3).armed).toBe(true); expect(matchDistress('help me', 'en')).toBe('help me'); });
});
