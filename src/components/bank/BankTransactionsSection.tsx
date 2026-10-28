import { useState } from 'react'
import type { BankTransaction, InterestRatePeriod, Mortgage, Payment } from '@/domain/types'
import { useAuth } from '@/hooks/useAuth'
import { useData } from '@/hooks/useData'
import {
  formatIban,
  isOpen,
  paymentValuesFromTransaction,
  quickPaymentInput,
  transactionsForMortgage,
} from '@/lib/bank'
import { messageOf } from '@/lib/errors'
import { formatCurrency, formatDate } from '@/lib/format'
import { maxRepayment } from '@/lib/validation'
import { PaymentForm } from '../payments/PaymentForm'
import { Button } from '../ui/Button'
import { EmptyState, Section } from '../ui/Card'
import { FormError, SelectInput } from '../ui/Field'

interface BankTransactionsSectionProps {
  mortgage: Mortgage
  rates: InterestRatePeriod[]
  payments: Payment[]
  onEditMortgage: () => void
}

type Tab = 'open' | 'archived'

/**
 * Afschrijvingen naar het rekeningnummer van de geldverstrekker, om goed te keuren als
 * rente en/of aflossing (dan worden ze een betaling van deze hypotheek) of te archiveren.
 */
export function BankTransactionsSection({
  mortgage,
  rates,
  payments,
  onEditMortgage,
}: BankTransactionsSectionProps) {
  const { bankConnection, bankTransactions, createPayment, updateBankTransaction } = useData()
  const { state: auth } = useAuth()
  const [tab, setTab] = useState<Tab>('open')
  const [partId, setPartId] = useState(mortgage.parts[0]?.id ?? '')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [splitting, setSplitting] = useState<BankTransaction | null>(null)

  // Geen bankkoppeling en geen transacties: sectie niet tonen.
  if (auth.status === 'local' || (!bankConnection && bankTransactions.length === 0)) return null

  const all = transactionsForMortgage(bankTransactions, mortgage)
  const open = all.filter(isOpen)
  const archived = all.filter((t) => t.ignored && !t.paymentId)
  const processed = all.filter((t) => t.paymentId).length
  const list = tab === 'open' ? open : archived
  /** Oudste nog niet verwerkte transactie vóór deze (open lijst is oudste eerst). */
  const olderOpen = (t: BankTransaction) =>
    open.find((o) => o.id !== t.id && o.bookingDate < t.bookingDate) ?? null
  const multi = mortgage.parts.length > 1
  const part = mortgage.parts.find((p) => p.id === partId) ?? mortgage.parts[0]!

  async function run(id: string, fn: () => Promise<void>) {
    setError(null)
    setBusyId(id)
    try {
      await fn()
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusyId(null)
    }
  }

  const quick = (t: BankTransaction, kind: 'interest' | 'principal') =>
    run(t.id, async () => {
      const amount = Math.abs(t.amountCents)
      if (kind === 'principal') {
        const max = maxRepayment(part, payments, null)
        if (amount > max) {
          throw new Error(
            `Dit bedrag is hoger dan wat er op ${part.name} nog openstaat (${formatCurrency(max)}). Gebruik "Verdelen…".`,
          )
        }
      }
      const payment = await createPayment(quickPaymentInput(t, mortgage, kind, part.id))
      await updateBankTransaction(t.id, { paymentId: payment.id })
    })

  let content
  if (!mortgage.counterpartyIban) {
    content = (
      <EmptyState
        title="Nog geen rekeningnummer van de geldverstrekker"
        description="Vul bij deze hypotheek het IBAN in waarnaar je betaalt. Afschrijvingen naar dat rekeningnummer verschijnen dan hier om goed te keuren."
        action={<Button onClick={onEditMortgage}>Rekeningnummer invullen</Button>}
      />
    )
  } else if (list.length === 0) {
    content = (
      <EmptyState
        title={tab === 'open' ? 'Niets te verwerken' : 'Geen gearchiveerde transacties'}
        description={
          tab === 'open'
            ? `Er zijn geen nieuwe afschrijvingen naar ${formatIban(mortgage.counterpartyIban)}.${processed ? ` ${processed} ${processed === 1 ? 'transactie is' : 'transacties zijn'} al als betaling vastgelegd.` : ''}`
            : undefined
        }
      />
    )
  } else {
    content = (
      <ul className="-mx-4 divide-y divide-slate-100 sm:-mx-5">
        {list.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
            <div className="min-w-0 flex-1">
              <p className="tabular text-sm font-medium text-slate-900">
                {formatDate(t.bookingDate)}
                <span className="ml-3">{formatCurrency(Math.abs(t.amountCents))}</span>
              </p>
              <p className="truncate text-xs text-slate-500" title={t.description ?? undefined}>
                {t.counterpartyName ?? formatIban(t.counterpartyIban)}
                {t.description && ` · ${t.description}`}
              </p>
              {tab === 'open' && olderOpen(t) && (
                <p className="mt-0.5 text-xs font-medium text-amber-700">
                  Verwerk eerst de transactie van {formatDate(olderOpen(t)!.bookingDate)}; anders
                  klopt de renteperiode niet.
                </p>
              )}
            </div>
            {tab === 'open' ? (
              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  disabled={busyId !== null}
                  onClick={() => void quick(t, 'interest')}
                >
                  Rente
                </Button>
                <Button
                  size="sm"
                  disabled={busyId !== null}
                  onClick={() => void quick(t, 'principal')}
                >
                  Aflossing
                </Button>
                <Button size="sm" disabled={busyId !== null} onClick={() => setSplitting(t)}>
                  Verdelen…
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyId !== null}
                  onClick={() =>
                    void run(t.id, () => updateBankTransaction(t.id, { ignored: true }))
                  }
                >
                  Archiveren
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                disabled={busyId !== null}
                onClick={() =>
                  void run(t.id, () => updateBankTransaction(t.id, { ignored: false }))
                }
              >
                Terugzetten
              </Button>
            )}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <Section
      title="Banktransacties"
      description={
        mortgage.counterpartyIban
          ? `Afschrijvingen naar ${formatIban(mortgage.counterpartyIban)}, oudste eerst. Keur ze goed als rente of aflossing, of archiveer ze.`
          : undefined
      }
      actions={
        mortgage.counterpartyIban ? (
          <div
            className="inline-flex rounded-lg bg-slate-200/60 p-0.5"
            role="group"
            aria-label="Weergave"
          >
            {(
              [
                ['open', `Te verwerken (${open.length})`],
                ['archived', `Gearchiveerd (${archived.length})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={tab === key}
                onClick={() => setTab(key)}
                className={`h-7 cursor-pointer rounded-md px-2.5 text-xs font-medium ${tab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : undefined
      }
    >
      {error && (
        <div className="mb-3">
          <FormError message={error} />
        </div>
      )}
      {multi && tab === 'open' && open.length > 0 && (
        <label className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
          "Rente" en "Aflossing" boeken op
          <SelectInput
            size="sm"
            className="w-56"
            value={part.id}
            onChange={(e) => setPartId(e.target.value)}
          >
            {mortgage.parts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectInput>
          <span className="text-xs text-slate-500">(of kies "Verdelen…" voor meerdere delen)</span>
        </label>
      )}
      {content}

      {splitting && (
        <PaymentForm
          mortgage={mortgage}
          rates={rates}
          payments={payments}
          bankTransaction={splitting}
          bankWarning={
            olderOpen(splitting)
              ? `Let op: de transactie van ${formatDate(olderOpen(splitting)!.bookingDate)} is nog niet verwerkt. De renteperiode loopt daardoor vanaf de vorige vastgelegde betaling (of de start) en is te lang. Verwerk of archiveer eerst de oudere transactie.`
              : undefined
          }
          initialValues={paymentValuesFromTransaction(splitting, mortgage, rates, payments)}
          onSaved={async (payment) => {
            if (payment) await updateBankTransaction(splitting.id, { paymentId: payment.id })
          }}
          onClose={() => setSplitting(null)}
        />
      )}
    </Section>
  )
}
