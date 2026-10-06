import type { Cents, ISODate, MilliPercent } from '@/domain/types'
import { parseISODate } from './dates'

const currency = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' })
const currencyCompact = new Intl.NumberFormat('nl-NL', {
  style: 'currency',
  currency: 'EUR',
  notation: 'compact',
  maximumFractionDigits: 1,
})
const percent = new Intl.NumberFormat('nl-NL', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 3,
})
const percentShort = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 })
const monthLong = new Intl.DateTimeFormat('nl-NL', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})
const monthShort = new Intl.DateTimeFormat('nl-NL', {
  month: 'short',
  year: '2-digit',
  timeZone: 'UTC',
})

/** 25000000 → "€ 250.000,00". (Alleen voor weergave; rekenen gebeurt in centen.) */
export function formatCurrency(cents: Cents): string {
  return currency.format(cents / 100)
}

/** Voor grafiek-assen: "€ 250K". */
export function formatCurrencyCompact(cents: Cents): string {
  return currencyCompact.format(cents / 100)
}

/** 3850 → "3,85%" */
export function formatRate(milli: MilliPercent): string {
  return `${percent.format(milli / 1000)}%`
}

/** 0.4567 → "45,7%" */
export function formatShare(fraction: number): string {
  return `${percentShort.format(fraction * 100)}%`
}

/** "2025-03-01" → "01-03-2025" */
export function formatDate(date: ISODate): string {
  const { year, month, day } = parseISODate(date)
  return `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${year}`
}

/** "2025-03" → "maart 2025" */
export function formatMonthLong(key: string): string {
  const [y, m] = key.split('-').map(Number) as [number, number]
  return monthLong.format(new Date(Date.UTC(y, m - 1, 1)))
}

/** "2025-03" → "mrt '25" */
export function formatMonthShort(key: string): string {
  const [y, m] = key.split('-').map(Number) as [number, number]
  const parts = monthShort.formatToParts(new Date(Date.UTC(y, m - 1, 1)))
  const month = parts.find((p) => p.type === 'month')?.value.replace('.', '') ?? ''
  return `${month} '${String(y).slice(2)}`
}
