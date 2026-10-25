import { LatLng, distanceToRoute, haversine } from '../lib/geo';

/**
 * Journey anomaly detection (port of JourneyMonitorService): route deviation and unexpected stops.
 * Thresholds: deviation warning 50 m / critical 100 m (profile-adjustable); the original 30 s / 60 s
 * stop thresholds fire at every traffic light, so they are 180 s / 600 s here.
 */
export type Level = 'ok' | 'warning' | 'critical';

export interface Sample extends LatLng {
  t: number; // epoch ms
  accuracy?: number | null;
}

export interface Analysis {
  level: Level;
  deviationM: number | null;
  stoppedSeconds: number;
  reasons: string[];
}

export interface MonitorOptions {
  route?: LatLng[];
  deviationWarnM?: number;
  deviationCritM?: number;
  stopWarnS?: number;
  stopCritS?: number;
  minMoveSpeed?: number; // m/s
  maxTrail?: number;
}

export class JourneyMonitor {
  readonly trail: Sample[] = [];
  private lastMoveAt: number | null = null;
  private deviationStreak = 0;
  private o: Required<Omit<MonitorOptions, 'route'>> & { route: LatLng[] };

  constructor(opts: MonitorOptions = {}) {
    this.o = {
      route: opts.route ?? [],
      deviationWarnM: opts.deviationWarnM ?? 50,
      deviationCritM: opts.deviationCritM ?? 100,
      stopWarnS: opts.stopWarnS ?? 180,
      stopCritS: opts.stopCritS ?? 600,
      minMoveSpeed: opts.minMoveSpeed ?? 1.0,
      maxTrail: opts.maxTrail ?? 500,
    };
  }

  setRoute(route: LatLng[]): void {
    this.o.route = route;
    this.deviationStreak = 0;
  }

  add(s: Sample): Analysis {
    const prev = this.trail[this.trail.length - 1];
    this.trail.push(s);
    if (this.trail.length > this.o.maxTrail) this.trail.shift();

    let moving = true;
    if (prev) {
      const dt = (s.t - prev.t) / 1000;
      if (dt > 0) moving = haversine(prev, s) / dt >= this.o.minMoveSpeed;
    }
    if (this.lastMoveAt == null || moving) this.lastMoveAt = s.t;
    const stoppedSeconds = Math.round((s.t - (this.lastMoveAt ?? s.t)) / 1000);

    const reasons: string[] = [];
    let level: Level = 'ok';
    const raise = (l: Level) => {
      if (l === 'critical' || (l === 'warning' && level === 'ok')) level = l;
    };

    let deviationM: number | null = null;
    if (this.o.route.length >= 2) {
      deviationM = Math.round(distanceToRoute(s, this.o.route));
      // GPS with poor accuracy is not evidence of deviation
      const trustworthy = (s.accuracy ?? 0) <= Math.max(50, this.o.deviationWarnM);
      if (trustworthy && deviationM > this.o.deviationWarnM) this.deviationStreak++;
      else this.deviationStreak = 0;
      if (this.deviationStreak >= 2) {
        if (deviationM > this.o.deviationCritM) {
          raise('critical');
          reasons.push(`${deviationM} m off the planned route`);
        } else {
          raise('warning');
          reasons.push(`${deviationM} m from the planned route`);
        }
      }
    }
    if (stoppedSeconds >= this.o.stopCritS) {
      raise('critical');
      reasons.push(`Stopped for ${Math.round(stoppedSeconds / 60)} min`);
    } else if (stoppedSeconds >= this.o.stopWarnS) {
      raise('warning');
      reasons.push(`Stopped for ${Math.round(stoppedSeconds / 60)} min`);
    }
    return { level, deviationM, stoppedSeconds, reasons };
  }
}
