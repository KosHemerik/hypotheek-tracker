import { interestStatus, type YearSummary } from '@/lib/calculations'
import { formatCurrency } from '@/lib/format'
import { InterestDiff } from './payments/InterestDiff'

/** Jaaroverzicht per kalenderjaar (handig voor de belastingaangifte: betaalde rente + saldo 1-1 / 31-12). */
export function YearOverview({ rows, currentYear }: { rows: YearSummary[]; currentYear: number }) {
  return (
    <div className="-mx-4 overflow-x-auto sm:-mx-5">
      <table className="tabular w-full min-w-200 text-sm">
        <thead className="border-b border-slate-200 text-xs text-slate-500">
          <tr>
            <th scope="col" className="py-2 pr-3 pl-4 text-left font-medium sm:pl-5">
              Jaar
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Betaalde rente
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Verschuldigd
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Verschil
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Afgelost
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Saldo begin jaar
            </th>
            <th scope="col" className="py-2 pr-4 pl-3 text-right font-medium sm:pr-5">
              Saldo eind jaar
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.year}>
              <td className="py-2.5 pr-3 pl-4 font-medium sm:pl-5">
                {r.year}
                {r.year === currentYear && (
                  <span className="ml-2 text-xs font-normal text-slate-400">lopend</span>
                )}
              </td>
              <td className="px-3 py-2.5 text-right">{formatCurrency(r.interestCents)}</td>
              <td className="px-3 py-2.5 text-right text-slate-600">
                {formatCurrency(r.dueInterestCents)}
              </td>
              <td className="px-3 py-2.5">
                {r.interestCents > 0 || r.dueInterestCents > 0 ? (
                  <InterestDiff
                    differenceCents={r.interestCents - r.dueInterestCents}
                    status={interestStatus(r.interestCents - r.dueInterestCents)}
                  />
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </td>
              <td className="px-3 py-2.5 text-right">{formatCurrency(r.principalCents)}</td>
              <td className="px-3 py-2.5 text-right text-slate-600">
                {formatCurrency(r.openingBalanceCents)}
              </td>
              <td className="py-2.5 pr-4 pl-3 text-right text-slate-600 sm:pr-5">
                {formatCurrency(r.closingBalanceCents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
