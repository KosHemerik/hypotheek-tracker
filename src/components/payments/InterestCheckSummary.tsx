import type { InterestCheckTotals } from '@/lib/calculations'
import { INTEREST_TOLERANCE_CENTS } from '@/lib/calculations'
import { formatCurrency, formatDate } from '@/lib/format'
import { InterestDiff } from './InterestDiff'

interface InterestCheckSummaryProps {
  check: InterestCheckTotals
  /** Opgebouwde rente sinds de laatste rentebetaling (nog te betalen). */
  pending: { from: string; to: string; dueCents: number } | null
  periodLabel: string
  /** Rekenmethode van de hypotheek (voor de uitleg). */
  method: { interestMethod: 'actual' | 'thirty_360'; dueDay: number | null }
}

/** Rentecontrole: is er genoeg rente betaald op basis van de rentepercentages? */
export function InterestCheckSummary({
  check,
  pending,
  periodLabel,
  method,
}: InterestCheckSummaryProps) {
  const conclusion =
    check.status === 'under'
      ? `Er is ${formatCurrency(-check.differenceCents)} minder rente betaald dan verschuldigd.`
      : check.status === 'over'
        ? `Er is ${formatCurrency(check.differenceCents)} meer rente betaald dan verschuldigd.`
        : 'De betaalde rente komt overeen met de verschuldigde rente.'

  return (
    <div className="mb-4 rounded-lg bg-slate-50 px-4 py-3 ring-1 ring-slate-200 ring-inset">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p className="text-sm font-medium text-slate-900">Rentecontrole {periodLabel}</p>
        <dl className="tabular flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div className="flex gap-1.5">
            <dt className="text-slate-500">Betaald</dt>
            <dd className="font-medium">{formatCurrency(check.paidCents)}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-slate-500">Verschuldigd</dt>
            <dd className="font-medium">{formatCurrency(check.dueCents)}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="sr-only">Verschil</dt>
            <dd>
              <InterestDiff differenceCents={check.differenceCents} status={check.status} />
            </dd>
          </div>
        </dl>
      </div>
      <p className="mt-1.5 text-sm text-slate-600">
        {conclusion}
        {check.deviations > 0 &&
          ` ${check.deviations} ${check.deviations === 1 ? 'betaling wijkt' : 'betalingen wijken'} meer dan ${formatCurrency(INTEREST_TOLERANCE_CENTS)} af; zie de kolom Verschil.`}
      </p>
      {pending && pending.dueCents > 0 && (
        <p className="mt-1 text-sm text-slate-600">
          Sinds {formatDate(pending.from)} is {formatCurrency(pending.dueCents)} rente opgebouwd die
          bij de volgende termijn betaald wordt.
        </p>
      )}
      <p className="mt-2 text-xs text-slate-500">
        {method.interestMethod === 'thirty_360' && method.dueDay
          ? `Verschuldigd = rente per renteperiode tot en met de ${method.dueDay}e van de maand, met 30/360: elke maand telt als 30 dagen (openstaand bedrag × geldend percentage / 12 per volle maand). `
          : 'Verschuldigd = rente over de periode sinds de vorige rentebetaling, per dag berekend: openstaand bedrag × geldend percentage / 12, naar rato van de dagen in de maand. Rente wordt achteraf betaald (de termijn van 1 november betaalt oktober). '}
        Verschillen tot {formatCurrency(INTEREST_TOLERANCE_CENTS)} tellen als &lsquo;klopt&rsquo;.
      </p>
    </div>
  )
}
