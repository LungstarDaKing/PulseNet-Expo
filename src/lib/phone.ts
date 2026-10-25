/** Normalises South African numbers to E.164 (+27...). Ported from SosService.normalizePhone. */
export function normalizePhone(raw: string): string {
  let n = raw.replace(/[^\d+]/g, '');
  if (n.startsWith('00')) n = `+${n.slice(2)}`;
  if (n.startsWith('0') && n.length === 10) {
    n = `+27${n.slice(1)}`;
  } else if (n.startsWith('27') && n.length === 11) {
    n = `+${n}`;
  }
  return n;
}

export function isValidPhone(raw: string): boolean {
  return /^\+?\d{7,15}$/.test(normalizePhone(raw));
}
