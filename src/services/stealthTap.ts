/** Discreet trigger: 3 taps within 900 ms (port of StealthEmergencyService.registerTap). */
export class StealthTap {
  private taps: number[] = [];
  constructor(private windowMs = 900, private required = 3) {}
  registerTap(now = Date.now()): boolean {
    this.taps = [...this.taps.filter((t) => now - t <= this.windowMs), now];
    if (this.taps.length >= this.required) {
      this.taps = [];
      return true;
    }
    return false;
  }
}
