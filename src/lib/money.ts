import type { Cents, MilliPercent } from '@/domain/types'

/**
 * Integer-rekenkunde en het parsen van invoer. Alle bedragen zijn gehele centen;
 * delen gebeurt altijd via `roundDiv`, zodat afronding expliciet en voorspelbaar is.
 */

/** Deelt twee gehele getallen en rondt af op het dichtstbijzijnde gehele getal (half → weg van 0). */
export function roundDiv(numerator: number, denominator: number): number {
  if (denominator === 0) throw new RangeError('Deling door nul')
  const sign = Math.sign(numerator) * Math.sign(denominator)
  const n = Math.abs(numerator)
  const d = Math.abs(denominator)
  const q = Math.floor((2 * n + d) / (2 * d))
  return sign * q || 0
}

export function sumCents(values: readonly Cents[]): Cents {
  return values.reduce((sum, v) => sum + v, 0)
}

/**
 * Parset een door de gebruiker ingevoerd bedrag naar centen.
 * Accepteert Nederlandse notatie (`250.000,00`, `1234,5`, `€ 12,-`) en een punt als
 * decimaalteken wanneer er geen komma staat (`1234.56`). Geeft `null` bij ongeldige invoer.
 */
export function parseAmountToCents(input: string): Cents | null {
  let s = input.replace(/[€\s\u00a0]/g, '').replace(/,-$/, '')
  if (s === '') return null
  let negative = false
  if (s.startsWith('-')) {
    negative = true
    s = s.slice(1)
  }

  let whole: string
  let fraction = ''
  if (s.includes(',')) {
    // Komma = decimaalteken, punten = duizendtallen.
    const parts = s.split(',')
    if (parts.length !== 2) return null
    whole = parts[0]!
    fraction = parts[1]!
    if (whole.includes('.') && !/^\d{1,3}(\.\d{3})+$/.test(whole)) return null
    whole = whole.replace(/\./g, '')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // "250.000" → duizendtallen.
    whole = s.replace(/\./g, '')
  } else {
    const parts = s.split('.')
    if (parts.length > 2) return null
    whole = parts[0]!
    fraction = parts[1] ?? ''
  }

  if (whole === '') whole = '0'
  if (!/^\d+$/.test(whole) || !/^\d{0,2}$/.test(fraction)) return null
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents)) return null
  return negative ? -cents : cents
}

/**
 * Parset een rentepercentage (`3,85`, `3.850`, `3,85%`) naar duizendsten van een procent.
 * Maximaal 3 decimalen. Geeft `null` bij ongeldige invoer.
 */
export function parseRateToMilli(input: string): MilliPercent | null {
  const s = input.replace(/[%\s\u00a0]/g, '').replace(',', '.')
  const match = /^(\d+)(?:\.(\d{0,3}))?$/.exec(s)
  if (!match) return null
  const [, whole, fraction = ''] = match
  return Number(whole) * 1000 + Number(fraction.padEnd(3, '0'))
}

/** Centen → invoerwaarde voor een formulierveld (`250000,00`). */
export function centsToInput(cents: Cents): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`
}

/** Duizendsten procent → invoerwaarde (`3,85`), zonder overbodige nullen. */
export function milliToInput(milli: MilliPercent): string {
  const whole = Math.floor(milli / 1000)
  const fraction = String(milli % 1000)
    .padStart(3, '0')
    .replace(/0+$/, '')
  return fraction ? `${whole},${fraction.padEnd(2, '0')}` : `${whole},00`
}
