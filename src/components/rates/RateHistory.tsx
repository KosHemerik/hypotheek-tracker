import type { InterestRatePeriod, Mortgage } from '@/domain/types'
import { rateAt, sortRatesChronologically } from '@/lib/calculations'
import { addDays } from '@/lib/dates'
import { formatDate, formatRate } from '@/lib/format'
import { canDeleteRate } from '@/lib/validation'
import { IconButton } from '../ui/Button'
import { PencilIcon, TrashIcon } from '../ui/icons'

interface RateHistoryProps {
  mortgage: Mortgage
  rates: InterestRatePeriod[]
  today: string
  onEdit: (rate: InterestRatePeriod) => void
  onDelete: (rate: InterestRatePeriod) => void
}

/** Tijdlijn van rentepercentages, nieuwste bovenaan. */
export function RateHistory({ mortgage, rates, today, onEdit, onDelete }: RateHistoryProps) {
  const chronological = sortRatesChronologically(rates)
  const current = rateAt(rates, today)

  return (
    <ol className="relative space-y-1">
      {chronological
        .map((rate, i) => ({ rate, next: chronological[i + 1] }))
        .reverse()
        .map(({ rate, next }) => {
          const isCurrent = rate.id === current?.id
          const isFuture = rate.effectiveDate > today
          const deletable = canDeleteRate(rate, mortgage, rates)
          return (
            <li
              key={rate.id}
              className="group relative flex items-center gap-3 rounded-lg py-2 pr-1 pl-7"
            >
              <span
                aria-hidden="true"
                className={`absolute top-1/2 left-1.5 size-2.5 -translate-y-1/2 rounded-full ring-4 ring-white ${
                  isCurrent
                    ? 'bg-principal'
                    : isFuture
                      ? 'border-2 border-slate-300 bg-white'
                      : 'bg-slate-300'
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="tabular text-base font-semibold">
                    {formatRate(rate.rateMilliPct)}
                  </span>
                  {isCurrent && (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                      Huidig
                    </span>
                  )}
                  {isFuture && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      Toekomstig
                    </span>
                  )}
                </div>
                <p className="tabular text-sm text-slate-500">
                  {next
                    ? `${formatDate(rate.effectiveDate)} t/m ${formatDate(addDays(next.effectiveDate, -1))}`
                    : `Vanaf ${formatDate(rate.effectiveDate)}`}
                  {rate.effectiveDate === mortgage.startDate && ' · startdatum'}
                </p>
              </div>
              <IconButton label="Rentepercentage bewerken" onClick={() => onEdit(rate)}>
                <PencilIcon />
              </IconButton>
              <IconButton
                label={deletable.ok ? 'Rentepercentage verwijderen' : deletable.reason}
                onClick={() => onDelete(rate)}
                disabled={!deletable.ok}
                className="hover:text-red-600"
              >
                <TrashIcon />
              </IconButton>
            </li>
          )
        })}
      <span
        aria-hidden="true"
        className="absolute top-4 bottom-4 left-[11px] -z-0 w-px bg-slate-200"
      />
    </ol>
  )
}
