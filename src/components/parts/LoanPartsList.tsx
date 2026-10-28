import type { LoanPart, Mortgage, Payment } from '@/domain/types'
import type { PartSummary } from '@/lib/calculations'
import { formatCurrency, formatRate, formatShare } from '@/lib/format'
import { canDeleteLoanPart } from '@/lib/validation'
import { IconButton } from '../ui/Button'
import { ProgressBar } from '../ui/Card'
import { PencilIcon, TrashIcon } from '../ui/icons'

interface LoanPartsListProps {
  mortgage: Mortgage
  parts: PartSummary[]
  payments: Payment[]
  onEdit: (part: LoanPart) => void
  onDelete: (part: LoanPart) => void
}

/** Overzicht per leningdeel: bedrag, openstaand, huidige rente en afgesproken aflossing. */
export function LoanPartsList({ mortgage, parts, payments, onEdit, onDelete }: LoanPartsListProps) {
  return (
    <div className="-mx-4 overflow-x-auto sm:-mx-5">
      <table className="tabular w-full min-w-200 text-sm">
        <thead className="border-b border-slate-200 text-xs text-slate-500">
          <tr>
            <th scope="col" className="py-2 pr-2 pl-4 text-left font-medium sm:pl-5">
              Leningdeel
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              Bedrag
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              Openstaand
            </th>
            <th scope="col" className="w-40 px-2 py-2 text-left font-medium">
              Afgelost
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              Rente nu
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              Afgesproken aflossing
            </th>
            <th className="w-24 pr-4 sm:pr-5">
              <span className="sr-only">Acties</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {parts.map(({ part, outstandingCents, currentRate, shareRepaid }) => {
            const deletable = canDeleteLoanPart(part, mortgage, payments)
            return (
              <tr key={part.id}>
                <td className="py-2.5 pr-2 pl-4 font-medium sm:pl-5">{part.name}</td>
                <td className="px-2 py-2.5 text-right whitespace-nowrap">
                  {formatCurrency(part.principalCents)}
                </td>
                <td className="px-2 py-2.5 text-right whitespace-nowrap">
                  {formatCurrency(outstandingCents)}
                </td>
                <td className="px-2 py-2.5">
                  <div className="flex items-center gap-2">
                    <ProgressBar value={shareRepaid} label={`${part.name}: afgelost`} />
                    <span className="w-12 shrink-0 text-right text-xs text-slate-500">
                      {formatShare(shareRepaid)}
                    </span>
                  </div>
                </td>
                <td className="px-2 py-2.5 text-right whitespace-nowrap">
                  {currentRate ? formatRate(currentRate.rateMilliPct) : '—'}
                </td>
                <td className="px-2 py-2.5 text-right whitespace-nowrap">
                  {part.agreedRepaymentCents > 0 ? (
                    `${formatCurrency(part.agreedRepaymentCents)} p/m`
                  ) : (
                    <span className="text-slate-500">Aflossingsvrij / niets afgesproken</span>
                  )}
                </td>
                <td className="py-1 pr-3 text-right whitespace-nowrap sm:pr-4">
                  <IconButton label={`${part.name} bewerken`} onClick={() => onEdit(part)}>
                    <PencilIcon />
                  </IconButton>
                  <IconButton
                    label={deletable.ok ? `${part.name} verwijderen` : deletable.reason}
                    disabled={!deletable.ok}
                    onClick={() => onDelete(part)}
                    className="hover:text-red-600"
                  >
                    <TrashIcon />
                  </IconButton>
                </td>
              </tr>
            )
          })}
        </tbody>
        {parts.length > 1 && (
          <tfoot className="border-t border-slate-200 font-medium">
            <tr>
              <td className="py-2.5 pr-2 pl-4 sm:pl-5">Totaal</td>
              <td className="px-2 py-2.5 text-right whitespace-nowrap">
                {formatCurrency(mortgage.principalCents)}
              </td>
              <td className="px-2 py-2.5 text-right whitespace-nowrap">
                {formatCurrency(parts.reduce((s, p) => s + p.outstandingCents, 0))}
              </td>
              <td />
              <td />
              <td className="px-2 py-2.5 text-right whitespace-nowrap">
                {formatCurrency(parts.reduce((s, p) => s + p.part.agreedRepaymentCents, 0))} p/m
              </td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}
