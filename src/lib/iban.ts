/** IBAN zonder spaties, in hoofdletters. */
export function normalizeIban(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase()
}

/**
 * Controleert een IBAN: landcode, lengte en het controlegetal (mod 97).
 * Geeft een melding of `null` als het klopt.
 */
export function validateIban(value: string): string | null {
  const iban = normalizeIban(value)
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{8,30}$/.test(iban)) {
    return 'Vul een geldig IBAN in, bijv. NL91 ABNA 0417 1643 00.'
  }
  if (iban.startsWith('NL') && iban.length !== 18) return 'Een Nederlands IBAN heeft 18 tekens.'
  // Eerste 4 tekens naar achteren, letters → cijfers (A=10 … Z=35), dan mod 97 = 1.
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  let remainder = 0
  for (const char of rearranged) {
    const digits = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char
    for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97
  }
  return remainder === 1 ? null : 'Dit IBAN klopt niet (controlegetal). Controleer het nummer.'
}
