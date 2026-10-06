import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { todayISO } from '@/lib/dates'
import { DEFAULT_PERIOD, isPeriodKey, periodRange, type PeriodKey } from '@/lib/period'

/** Het periodefilter staat in de URL (`?periode=1J`), zodat het meegaat tussen pagina's. */
export function usePeriod() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('periode')
  const period: PeriodKey = isPeriodKey(raw) ? raw : DEFAULT_PERIOD
  const today = todayISO()

  const setPeriod = useCallback(
    (key: PeriodKey) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (key === DEFAULT_PERIOD) next.delete('periode')
          else next.set('periode', key)
          return next
        },
        { replace: true },
      ),
    [setParams],
  )

  const range = useMemo(() => periodRange(period, today), [period, today])
  return { period, setPeriod, range, today, search: raw ? `?periode=${raw}` : '' }
}
