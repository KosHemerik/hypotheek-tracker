import type { ISODate } from '@/domain/types'

/**
 * Datumhulpjes op ISO-strings (`YYYY-MM-DD`). We rekenen bewust niet met `Date`-objecten
 * om tijdzone-verschuivingen te voorkomen; ISO-datums zijn lexicografisch sorteerbaar.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isValidISODate(value: string): boolean {
  const match = ISO_DATE.exec(value)
  if (!match) return false
  const [, y, m, d] = match.map(Number) as [number, number, number, number]
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m)
}

export function toISODate(year: number, month: number, day: number): ISODate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function parseISODate(date: ISODate): { year: number; month: number; day: number } {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  return { year, month, day }
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Vandaag in de lokale tijdzone. */
export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

/** Telt maanden op (of af); de dag wordt begrensd op het einde van de maand (31-03 − 1M = 28/29-02). */
export function addMonths(date: ISODate, months: number): ISODate {
  const { year, month, day } = parseISODate(date)
  const index = year * 12 + (month - 1) + months
  const newYear = Math.floor(index / 12)
  const newMonth = (index % 12) + 1
  return toISODate(newYear, newMonth, Math.min(day, daysInMonth(newYear, newMonth)))
}

export function addDays(date: ISODate, days: number): ISODate {
  const { year, month, day } = parseISODate(date)
  const d = new Date(Date.UTC(year, month - 1, day + days))
  return toISODate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

/** `YYYY-MM` */
export type MonthKey = string

export function monthKey(date: ISODate): MonthKey {
  return date.slice(0, 7)
}

export function firstDayOfMonth(key: MonthKey): ISODate {
  return `${key}-01`
}

export function lastDayOfMonth(key: MonthKey): ISODate {
  const [y, m] = key.split('-').map(Number) as [number, number]
  return toISODate(y, m, daysInMonth(y, m))
}

/** Alle maanden van `from` t/m `to` (inclusief). */
export function monthsBetween(from: MonthKey, to: MonthKey): MonthKey[] {
  const result: MonthKey[] = []
  let current = firstDayOfMonth(from)
  const end = firstDayOfMonth(to)
  while (current <= end) {
    result.push(monthKey(current))
    current = addMonths(current, 1)
  }
  return result
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b
}

/** Hele maanden tussen twee datums (afgerond naar beneden). */
export function monthsDiff(from: ISODate, to: ISODate): number {
  const a = parseISODate(from)
  const b = parseISODate(to)
  let months = (b.year - a.year) * 12 + (b.month - a.month)
  if (b.day < a.day) months -= 1
  return months
}
