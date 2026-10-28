import type { InterestStatus } from '@/lib/calculations'
import { INTEREST_TOLERANCE_CENTS } from '@/lib/calculations'
import { formatCurrency } from '@/lib/format'

const STYLES: Record<InterestStatus, string> = {
  ok: 'text-emerald-700',
  under: 'text-red-700',
  over: 'text-amber-700',
}

function StatusIcon({ status }: { status: InterestStatus }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="size-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {status === 'ok' ? (
        <path d="m3.5 8.5 3 3 6-7" />
      ) : status === 'under' ? (
        <path d="M8 3v6M8 12.5v.5" />
      ) : (
        <path d="M8 13V4M4.5 7.5 8 4l3.5 3.5" />
      )}
    </svg>
  )
}

/**
 * Verschil tussen betaalde en verschuldigde rente, met icoon + tekst (nooit alleen kleur).
 * Binnen de marge van € 1 tonen we "Klopt".
 */
export function InterestDiff({
  differenceCents,
  status,
}: {
  differenceCents: number
  status: InterestStatus
}) {
  const amount = formatCurrency(Math.abs(differenceCents))
  const label =
    status === 'ok' ? 'Klopt' : status === 'under' ? `${amount} te weinig` : `${amount} te veel`
  const title =
    status === 'ok'
      ? differenceCents === 0
        ? 'Precies de verschuldigde rente betaald'
        : `Verschil ${differenceCents > 0 ? '+' : '−'}${amount}, binnen de marge van ${formatCurrency(INTEREST_TOLERANCE_CENTS)}`
      : undefined
  return (
    <span
      className={`inline-flex items-center gap-1 font-medium whitespace-nowrap ${STYLES[status]}`}
      title={title}
    >
      <StatusIcon status={status} />
      {label}
    </span>
  )
}
