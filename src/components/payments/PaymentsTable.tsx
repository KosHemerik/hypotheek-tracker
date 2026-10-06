import { useMemo, useState } from 'react'
import type { Payment } from '@/domain/types'
import type { PaymentWithBalance, Totals } from '@/lib/calculations'
import { formatCurrency, formatDate } from '@/lib/format'
import { IconButton } from '../ui/Button'
import { PencilIcon, SortIcon, TrashIcon } from '../ui/icons'

type SortKey = 'date' | 'interestCents' | 'principalCents' | 'totalCents' | 'balanceAfterCents'

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'interestCents', label: 'Rente' },
  { key: 'principalCents', label: 'Aflossing' },
  { key: 'totalCents', label: 'Totaal' },
  { key: 'balanceAfterCents', label: 'Saldo na betaling' },
]

interface PaymentsTableProps {
  /** Al gefilterd op de periode, met saldo berekend over álle betalingen. */
  rows: PaymentWithBalance[]
  totals: Totals
  onEdit: (payment: Payment) => void
  onDelete: (payment: Payment) => void
}

export function PaymentsTable({ rows, totals, onEdit, onDelete }: PaymentsTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'date',
    dir: 'desc',
  })

  const sorted = useMemo(() => {
    // `rows` is chronologisch; voor datum gebruiken we die volgorde (stabiel bij gelijke datums).
    const indexed = rows.map((row, index) => ({ row, index }))
    indexed.sort((a, b) => {
      const diff =
        sort.key === 'date'
          ? a.index - b.index
          : a.row[sort.key] - b.row[sort.key] || a.index - b.index
      return sort.dir === 'asc' ? diff : -diff
    })
    return indexed.map((x) => x.row)
  }, [rows, sort])

  const toggle = (key: SortKey) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' },
    )

  const header = (key: SortKey, label: string, align: 'left' | 'right', extra = '') => (
    <th
      key={key}
      scope="col"
      aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`px-3 py-2 font-medium ${align === 'right' ? 'text-right' : 'text-left'} ${extra}`}
    >
      <button
        type="button"
        onClick={() => toggle(key)}
        className={`inline-flex cursor-pointer items-center gap-1 hover:text-slate-900 ${align === 'right' ? 'flex-row-reverse' : ''} ${sort.key === key ? 'text-slate-900' : ''}`}
      >
        {label}
        <SortIcon sortDirection={sort.key === key ? sort.dir : null} />
      </button>
    </th>
  )

  return (
    <div className="-mx-4 overflow-x-auto sm:-mx-5">
      <table className="tabular w-full min-w-[42rem] text-sm">
        <thead className="border-b border-slate-200 text-xs text-slate-500">
          <tr>
            {header('date', 'Datum', 'left', 'pl-4 sm:pl-5')}
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Omschrijving
            </th>
            {COLUMNS.map((c) => header(c.key, c.label, 'right'))}
            <th className="w-20 pr-4 sm:pr-5">
              <span className="sr-only">Acties</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map((p) => (
            <tr key={p.id} className="hover:bg-slate-50">
              <td className="py-2.5 pr-3 pl-4 whitespace-nowrap sm:pl-5">{formatDate(p.date)}</td>
              <td
                className="max-w-48 truncate px-3 py-2.5 text-slate-600"
                title={p.description ?? undefined}
              >
                {p.description ?? <span className="text-slate-300">—</span>}
              </td>
              <td className="px-3 py-2.5 text-right whitespace-nowrap">
                {formatCurrency(p.interestCents)}
              </td>
              <td className="px-3 py-2.5 text-right whitespace-nowrap">
                {formatCurrency(p.principalCents)}
              </td>
              <td className="px-3 py-2.5 text-right font-medium whitespace-nowrap">
                {formatCurrency(p.totalCents)}
              </td>
              <td className="px-3 py-2.5 text-right whitespace-nowrap text-slate-600">
                {formatCurrency(p.balanceAfterCents)}
              </td>
              <td className="py-1 pr-3 text-right whitespace-nowrap sm:pr-4">
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
          ))}
        </tbody>
        <tfoot className="border-t border-slate-200 font-medium">
          <tr>
            <td className="py-2.5 pr-3 pl-4 sm:pl-5" colSpan={2}>
              Totaal ({totals.count} {totals.count === 1 ? 'betaling' : 'betalingen'})
            </td>
            <td className="px-3 py-2.5 text-right whitespace-nowrap">
              {formatCurrency(totals.interestCents)}
            </td>
            <td className="px-3 py-2.5 text-right whitespace-nowrap">
              {formatCurrency(totals.principalCents)}
            </td>
            <td className="px-3 py-2.5 text-right whitespace-nowrap">
              {formatCurrency(totals.totalCents)}
            </td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
