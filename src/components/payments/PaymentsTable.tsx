import { Fragment, useMemo, useState } from 'react'
import type { LoanPart, Payment } from '@/domain/types'
import type {
  InterestCheckTotals,
  InterestDue,
  PaymentWithBalance,
  Totals,
} from '@/lib/calculations'
import { formatCurrency, formatDate } from '@/lib/format'
import { IconButton } from '../ui/Button'
import { ChevronDownIcon, CopyIcon, PencilIcon, SortIcon, TrashIcon } from '../ui/icons'
import { InterestDiff } from './InterestDiff'

export interface PaymentRow extends PaymentWithBalance {
  /** Rentecontrole; `null` voor betalingen zonder rente (bijv. een extra aflossing). */
  due: InterestDue | null
}

type SortKey =
  | 'date'
  | 'interestCents'
  | 'dueCents'
  | 'differenceCents'
  | 'principalCents'
  | 'totalCents'
  | 'balanceAfterCents'

const sortValue: Record<Exclude<SortKey, 'date'>, (row: PaymentRow) => number> = {
  interestCents: (r) => r.interestCents,
  dueCents: (r) => r.due?.dueCents ?? Number.NEGATIVE_INFINITY,
  differenceCents: (r) => r.due?.differenceCents ?? Number.NEGATIVE_INFINITY,
  principalCents: (r) => r.principalCents,
  totalCents: (r) => r.totalCents,
  balanceAfterCents: (r) => r.balanceAfterCents,
}

interface PaymentsTableProps {
  /** Al gefilterd op de periode, met saldo en rentecontrole berekend over álle betalingen. */
  rows: PaymentRow[]
  /** Leningdelen van de hypotheek; bij meer dan één zijn betalingen uit te klappen per deel. */
  parts: LoanPart[]
  totals: Totals
  interestCheck: InterestCheckTotals
  onEdit: (payment: Payment) => void
  onCopy: (payment: Payment) => void
  onDelete: (payment: Payment) => void
}

const empty = <span className="text-slate-300">—</span>

export function PaymentsTable({
  rows,
  parts,
  totals,
  interestCheck,
  onEdit,
  onCopy,
  onDelete,
}: PaymentsTableProps) {
  const multi = parts.length > 1
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const toggleExpanded = (id: string) =>
    setExpanded((set) => {
      const next = new Set(set)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'date',
    dir: 'desc',
  })

  const sorted = useMemo(() => {
    // `rows` is chronologisch; voor datum gebruiken we die volgorde (stabiel bij gelijke datums).
    const indexed = rows.map((row, index) => ({ row, index }))
    indexed.sort((a, b) => {
      let diff = a.index - b.index
      if (sort.key !== 'date') {
        const va = sortValue[sort.key](a.row)
        const vb = sortValue[sort.key](b.row)
        diff = va === vb ? diff : va < vb ? -1 : 1
      }
      return sort.dir === 'asc' ? diff : -diff
    })
    return indexed.map((x) => x.row)
  }, [rows, sort])

  const toggle = (key: SortKey) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' },
    )

  const header = (
    key: SortKey,
    label: string,
    align: 'left' | 'right',
    extra = '',
    hint?: string,
  ) => (
    <th
      key={key}
      scope="col"
      title={hint}
      aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`px-2 py-2 font-medium ${align === 'right' ? 'text-right' : 'text-left'} ${extra}`}
    >
      <button
        type="button"
        onClick={() => toggle(key)}
        className={`inline-flex cursor-pointer items-center gap-1 whitespace-nowrap hover:text-slate-900 ${align === 'right' ? 'flex-row-reverse' : ''} ${sort.key === key ? 'text-slate-900' : ''}`}
      >
        {label}
        <SortIcon sortDirection={sort.key === key ? sort.dir : null} />
      </button>
    </th>
  )

  return (
    <div className="-mx-4 overflow-x-auto sm:-mx-5">
      <table className="tabular w-full min-w-240 text-sm">
        <thead className="border-b border-slate-200 text-xs text-slate-500">
          <tr>
            {header('date', 'Datum', 'left', 'pl-4 sm:pl-5')}
            <th scope="col" className="px-2 py-2 text-left font-medium">
              Omschrijving
            </th>
            {header('interestCents', 'Rente', 'right')}
            {header(
              'dueCents',
              'Verschuldigd',
              'right',
              '',
              'Rente over de periode sinds de vorige rentebetaling, berekend met de rentepercentages',
            )}
            {header('differenceCents', 'Verschil', 'left')}
            {header('principalCents', 'Aflossing', 'right')}
            {header('totalCents', 'Totaal', 'right')}
            {header('balanceAfterCents', 'Saldo na betaling', 'right')}
            <th className="w-36 pr-4 sm:pr-5">
              <span className="sr-only">Acties</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map((p) => (
            <Fragment key={p.id}>
              <tr className="hover:bg-slate-50">
                <td className="py-2.5 pr-2 pl-4 whitespace-nowrap sm:pl-5">
                  {multi ? (
                    <button
                      type="button"
                      onClick={() => toggleExpanded(p.id)}
                      aria-expanded={expanded.has(p.id)}
                      aria-label={`${expanded.has(p.id) ? 'Inklappen' : 'Uitklappen per leningdeel'}: ${formatDate(p.date)}`}
                      className="-ml-1 inline-flex cursor-pointer items-center gap-1 rounded px-1 hover:bg-slate-100"
                    >
                      <ChevronDownIcon
                        className={`size-3.5 text-slate-400 transition-transform ${expanded.has(p.id) ? '' : '-rotate-90'}`}
                      />
                      {formatDate(p.date)}
                    </button>
                  ) : (
                    formatDate(p.date)
                  )}
                </td>
                <td
                  className="max-w-40 truncate px-2 py-2.5 text-slate-600"
                  title={p.description ?? undefined}
                >
                  {p.description ?? empty}
                </td>
                <td className="px-2 py-2.5 text-right whitespace-nowrap">
                  {formatCurrency(p.interestCents)}
                </td>
                <td
                  className="px-2 py-2.5 text-right whitespace-nowrap text-slate-600"
                  title={
                    p.due
                      ? `Rente over ${formatDate(p.due.from)} t/m ${formatDate(p.due.to)}`
                      : 'Geen rentebetaling'
                  }
                >
                  {p.due ? formatCurrency(p.due.dueCents) : empty}
                </td>
                <td className="px-2 py-2.5">
                  {p.due ? (
                    <InterestDiff differenceCents={p.due.differenceCents} status={p.due.status} />
                  ) : (
                    empty
                  )}
                </td>
                <td className="px-2 py-2.5 text-right whitespace-nowrap">
                  {formatCurrency(p.principalCents)}
                </td>
                <td className="px-2 py-2.5 text-right font-medium whitespace-nowrap">
                  {formatCurrency(p.totalCents)}
                </td>
                <td className="px-2 py-2.5 text-right whitespace-nowrap text-slate-600">
                  {formatCurrency(p.balanceAfterCents)}
                </td>
                <td className="py-1 pr-3 text-right whitespace-nowrap sm:pr-4">
                  <IconButton label="Betaling kopiëren" onClick={() => onCopy(p)}>
                    <CopyIcon />
                  </IconButton>
                  <IconButton label="Betaling bewerken" onClick={() => onEdit(p)}>
                    <PencilIcon />
                  </IconButton>
                  <IconButton
                    label="Betaling verwijderen"
                    onClick={() => onDelete(p)}
                    className="hover:text-red-600"
                  >
                    <TrashIcon />
                  </IconButton>
                </td>
              </tr>
              {multi && expanded.has(p.id) && <PartRows payment={p} parts={parts} />}
            </Fragment>
          ))}
        </tbody>
        <tfoot className="border-t border-slate-200 font-medium">
          <tr>
            <td className="py-2.5 pr-2 pl-4 sm:pl-5" colSpan={2}>
              Totaal ({totals.count} {totals.count === 1 ? 'betaling' : 'betalingen'})
            </td>
            <td className="px-2 py-2.5 text-right whitespace-nowrap">
              {formatCurrency(totals.interestCents)}
            </td>
            <td className="px-2 py-2.5 text-right whitespace-nowrap">
              {formatCurrency(interestCheck.dueCents)}
            </td>
            <td className="px-2 py-2.5">
              <InterestDiff
                differenceCents={interestCheck.differenceCents}
                status={interestCheck.status}
              />
            </td>
            <td className="px-2 py-2.5 text-right whitespace-nowrap">
              {formatCurrency(totals.principalCents)}
            </td>
            <td className="px-2 py-2.5 text-right whitespace-nowrap">
              {formatCurrency(totals.totalCents)}
            </td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

/** Uitsplitsing van één betaling per leningdeel (alleen bij meerdere delen). */
function PartRows({ payment, parts }: { payment: PaymentRow; parts: LoanPart[] }) {
  return (
    <>
      {parts.map((part) => {
        const line = payment.lines.find((l) => l.loanPartId === part.id)
        const due = payment.due?.parts.find((d) => d.loanPartId === part.id)
        if (!line && !due) return null
        const interest = line?.interestCents ?? 0
        const principal = line?.principalCents ?? 0
        return (
          <tr key={part.id} className="bg-slate-50/70 text-xs text-slate-600">
            <td className="py-1.5 pr-2 pl-4 sm:pl-5" />
            <td className="px-2 py-1.5">
              <span className="text-slate-400">↳</span> {part.name}
            </td>
            <td className="px-2 py-1.5 text-right whitespace-nowrap">{formatCurrency(interest)}</td>
            <td className="px-2 py-1.5 text-right whitespace-nowrap">
              {due ? formatCurrency(due.dueCents) : empty}
            </td>
            <td className="px-2 py-1.5">
              {due ? (
                <InterestDiff differenceCents={due.differenceCents} status={due.status} />
              ) : (
                empty
              )}
            </td>
            <td className="px-2 py-1.5 text-right whitespace-nowrap">
              {formatCurrency(principal)}
            </td>
            <td className="px-2 py-1.5 text-right whitespace-nowrap">
              {formatCurrency(interest + principal)}
            </td>
            <td colSpan={2} />
          </tr>
        )
      })}
    </>
  )
}
