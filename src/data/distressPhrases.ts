/**
 * Distress phrases the voice listener reacts to. Ported from assets/data/distress_phrases.
 * Corrections vs the original files (documented in docs/MIGRATION.md):
 *  - xh/zu contained "thank you" and "I am speaking" - phrases that would trigger false alarms - and were removed.
 *  - af "bel en amber" and zu "ngicela uncedo" (Xhosa word in the Zulu list) were replaced.
 * xh/zu/af phrases still need review by native speakers before release.
 */
export const DISTRESS_PHRASES: Record<string, string[]> = {
  en: ['help me', 'call police', 'i am scared', 'i am in danger', 'help'],
  af: ['help my', 'bel die polisie', 'ek is bang', 'ek is in gevaar'],
  zu: ['ngicela usizo', 'ngisize', 'ngiyesaba', 'ngisengozini'],
  xh: ['ndicela uncedo', 'ndincedeni', 'ndiyoyika', 'ndisemngciphekweni'],
};
export const SUPPORTED_DISTRESS_LOCALES = Object.keys(DISTRESS_PHRASES);

export function matchDistress(transcript: string, locale: string): string | null {
  const t = transcript.toLowerCase().trim();
  if (!t) return null;
  const lang = locale.split(/[-_]/)[0];
  const phrases = DISTRESS_PHRASES[lang] ?? DISTRESS_PHRASES.en;
  for (const p of phrases) {
    // whole-word match so "helpful" does not trigger "help"
    if (new RegExp(`(^|[^\\p{L}])${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'u').test(t)) return p;
  }
  return null;
}
