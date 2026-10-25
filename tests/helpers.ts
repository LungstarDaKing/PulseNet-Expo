/** In-memory replacement for lib/storage used by service tests. */
export function memoryStorage() {
  const m = new Map<string, string>();
  const jget = async <T,>(k: string, f: T): Promise<T> => (m.has(k) ? (JSON.parse(m.get(k)!) as T) : f);
  const jset = async (k: string, v: unknown) => { m.set(k, JSON.stringify(v)); };
  return {
    m,
    mod: {
      secureGet: async (k: string) => m.get(k) ?? null,
      secureSet: async (k: string, v: string) => { m.set(k, v); },
      secureDelete: async (k: string) => { m.delete(k); },
      secureGetJSON: jget,
      secureSetJSON: jset,
      plainGetJSON: jget,
      plainSetJSON: jset,
      plainGet: async (k: string) => m.get(k) ?? null,
      plainSet: async (k: string, v: string) => { m.set(k, v); },
      plainRemove: async (k: string) => { m.delete(k); },
      getBool: async (k: string, d = false) => (m.has(k) ? m.get(k) === 'true' : d),
      setBool: async (k: string, v: boolean) => { m.set(k, String(v)); },
      K: { onboarded: 'hasSeenOnboarding', userName: 'user_name', locationSharing: 'location_sharing_enabled', appLockEnabled: 'app_lock_enabled', pinFails: 'pin_fail_count', pinLockUntil: 'pin_lock_until_ms' },
      SECURE_KEYS: [],
      wipeAllData: async () => m.clear(),
    },
  };
}
