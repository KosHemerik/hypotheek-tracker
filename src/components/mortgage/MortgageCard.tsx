import { Link } from 'react-router'
import type { Mortgage } from '@/domain/types'
import type { MortgageSummary } from '@/lib/calculations'
import { formatCurrency, formatDate, formatRate, formatShare } from '@/lib/format'
import { Card, ProgressBar } from '../ui/Card'
import { ChevronRightIcon } from '../ui/icons'

interface MortgageCardProps {
  mortgage: Mortgage
  summary: MortgageSummary
  periodLabel: string
  isSample: boolean
  search: string
  today: string
}

export function MortgageCard({
  mortgage,
  summary,
  periodLabel,
  isSample,
  search,
  today,
}: MortgageCardProps) {
  return (
    <Card className="group relative transition-shadow hover:shadow-md hover:ring-slate-300">
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-slate-900">
              <Link
                to={`/hypotheek/${mortgage.id}${search}`}
                className="after:absolute after:inset-0"
              >
                {mortgage.name}
              </Link>
            </h3>
            <p className="truncate text-sm text-slate-500">
              {mortgage.mortgageNumber}
              {isSample && (
                <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
                  voorbeeld
                </span>
              )}
            </p>
          </div>
          <ChevronRightIcon className="mt-1 size-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
        </div>

        <div className="mt-4">
          <p className="text-xs text-slate-500">
            Openstaand{summary.balanceDate !== today && ` per ${formatDate(summary.balanceDate)}`}
          </p>
          <p className="tabular text-2xl font-semibold tracking-tight">
            {formatCurrency(summary.outstandingCents)}
          </p>
        </div>

        <div className="mt-3 space-y-1.5">
          <ProgressBar value={summary.shareRepaid} label={`${mortgage.name}: afgelost`} />
          <div className="tabular flex justify-between text-xs text-slate-500">
            <span>{formatShare(summary.shareRepaid)} afgelost</span>
            <span>van {formatCurrency(summary.principalCents)}</span>
          </div>
        </div>

        <dl className="tabular mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-sm">
          <div>
            <dt className="text-xs text-slate-500">Rente nu</dt>
            <dd className="font-medium">
              {summary.currentRate ? formatRate(summary.currentRate.rateMilliPct) : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Rente {periodLabel}</dt>
            <dd className="font-medium">{formatCurrency(summary.period.interestCents)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Afgelost {periodLabel}</dt>
            <dd className="font-medium">{formatCurrency(summary.period.principalCents)}</dd>
          </div>
        </dl>
      </div>
    </Card>
  )
}
