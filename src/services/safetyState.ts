import { useSyncExternalStore } from 'react';
import { plainGetJSON, plainSetJSON } from '../lib/storage';
import { logEvent } from './audit';

/** Green (normal) / Yellow (check-in) / Red (emergency) with stealth option. Port of SafetyStateModel. */
export type SafetyLevel = 'green' | 'yellow' | 'red';

export interface SafetySnapshot {
  level: SafetyLevel;
  isEmergencyActive: boolean;
  isStealthMode: boolean;
  emergencyStartTime: string | null;
  isLocationSharingActive: boolean;
  isJourneySharingActive: boolean;
  currentJourneyId: string | null;
  notifiedContacts: string[];
  lastLocationShareTime: string | null;
}

const KEY = 'safety_state_v3';
const GREEN: SafetySnapshot = {
  level: 'green',
  isEmergencyActive: false,
  isStealthMode: false,
  emergencyStartTime: null,
  isLocationSharingActive: false,
  isJourneySharingActive: false,
  currentJourneyId: null,
  notifiedContacts: [],
  lastLocationShareTime: null,
};

type Listener = () => void;

export class SafetyStateStore {
  private snap: SafetySnapshot = GREEN;
  private listeners = new Set<Listener>();

  constructor(private persist = true) {}

  getSnapshot = (): SafetySnapshot => this.snap;
  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  async load(): Promise<void> {
    if (!this.persist) return;
    const saved = await plainGetJSON<SafetySnapshot | null>(KEY, null);
    if (saved) this.set({ ...GREEN, ...saved });
  }

  private set(next: SafetySnapshot): void {
    this.snap = next;
    this.listeners.forEach((l) => l());
    if (this.persist) void plainSetJSON(KEY, next);
  }

  setGreen(): void {
    this.set({ ...GREEN });
    void logEvent('state_green', 'Safety state set to green');
  }
  setYellow(): void {
    this.set({ ...this.snap, level: 'yellow', isEmergencyActive: false, isStealthMode: false });
    void logEvent('state_yellow', 'Safety state set to yellow');
  }
  setRed(stealth = false): void {
    this.set({
      ...this.snap,
      level: 'red',
      isEmergencyActive: true,
      isStealthMode: stealth,
      emergencyStartTime: new Date().toISOString(),
      isLocationSharingActive: true,
      notifiedContacts: [],
      lastLocationShareTime: null,
    });
    void logEvent('state_red', stealth ? 'Emergency (stealth)' : 'Emergency', undefined, 'critical');
  }
  startJourney(id: string): void {
    this.set({ ...this.snap, currentJourneyId: id, isJourneySharingActive: true });
  }
  endJourney(): void {
    this.set({ ...this.snap, currentJourneyId: null, isJourneySharingActive: false });
  }
  markContactNotified(id: string): void {
    if (this.snap.notifiedContacts.includes(id)) return;
    this.set({ ...this.snap, notifiedContacts: [...this.snap.notifiedContacts, id] });
  }
  /** Valid transitions only: red can only be left via green (user confirms safe). */
  canTransition(to: SafetyLevel): boolean {
    if (this.snap.level === 'red') return to === 'green' || to === 'red';
    return true;
  }
}

export const safetyState = new SafetyStateStore();

export function useSafetyState(): SafetySnapshot {
  return useSyncExternalStore(safetyState.subscribe, safetyState.getSnapshot, safetyState.getSnapshot);
}
