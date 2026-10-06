import type { ISODate } from '@/domain/types'
import type { DateRange } from './calculations'
import { addDays, addMonths, parseISODate } from './dates'

/** Periodefilter. Kalenderjaren worden als getal-string opgeslagen, bijv. "2025". */
export type PeriodKey = '3M' | '6M' | '1J' | 'YTD' | 'ALL' | `${number}`

export const RELATIVE_PERIODS: { key: PeriodKey; label: string }[] = [
  { key: '3M', label: '3M' },
  { key: '6M', label: '6M' },
  { key: '1J', label: '1J' },
  { key: 'YTD', label: 'YTD' },
  { key: 'ALL', label: 'Alles' },
]

export const DEFAULT_PERIOD: PeriodKey = 'ALL'

export function isPeriodKey(value: string | null | undefined): value is PeriodKey {
  if (!value) return false
  return ['3M', '6M', '1J', 'YTD', 'ALL'].includes(value) || /^\d{4}$/.test(value)
}

/**
 * Zet een periodefilter om naar een inclusieve datumrange.
 * Relatieve periodes eindigen vandaag; "3M" op 15-05 loopt van 16-02 t/m 15-05.
 */
export function periodRange(key: PeriodKey, today: ISODate): DateRange {
  switch (key) {
    case '3M':
      return { from: addDays(addMonths(today, -3), 1), to: today }
    case '6M':
      return { from: addDays(addMonths(today, -6), 1), to: today }
    case '1J':
      return { from: addDays(addMonths(today, -12), 1), to: today }
    case 'YTD':
      return { from: `${parseISODate(today).year}-01-01`, to: today }
    case 'ALL':
      return { from: null, to: null }
    default:
      return { from: `${key}-01-01`, to: `${key}-12-31` }
  }
}

export function periodLabel(key: PeriodKey): string {
  switch (key) {
    case '3M':
      return 'afgelopen 3 maanden'
    case '6M':
      return 'afgelopen 6 maanden'
    case '1J':
      return 'afgelopen jaar'
    case 'YTD':
      return 'dit jaar tot nu'
    case 'ALL':
      return 'totaal'
    default:
      return `in ${key}`
  }
}

/** Kalenderjaren om uit te kiezen: van het vroegste startjaar t/m het huidige (of laatste betaal)jaar, nieuwste eerst. */
export function availableYears(dates: readonly ISODate[], today: ISODate): number[] {
  const current = parseISODate(today).year
  if (dates.length === 0) return [current]
  const years = dates.map((d) => parseISODate(d).year)
  const first = Math.min(...years, current)
  const last = Math.max(...years, current)
  return Array.from({ length: last - first + 1 }, (_, i) => last - i)
}
