import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { BankTransactionsSection } from '@/components/bank/BankTransactionsSection'
import { BalanceChart } from '@/components/charts/BalanceChart'
import { DocumentsSection } from '@/components/documents/DocumentsSection'
import { MortgageForm } from '@/components/mortgage/MortgageForm'
import { InterestCheckSummary } from '@/components/payments/InterestCheckSummary'
import { PaymentForm } from '@/components/payments/PaymentForm'
import { PaymentsTable } from '@/components/payments/PaymentsTable'
import { PeriodFilter } from '@/components/PeriodFilter'
import { LoanPartForm } from '@/components/parts/LoanPartForm'
import { LoanPartsList } from '@/components/parts/LoanPartsList'
import { rateLabel } from '@/components/mortgage/rateLabel'
import { RateForm } from '@/components/rates/RateForm'
import { RateHistory } from '@/components/rates/RateHistory'
import { Button } from '@/components/ui/Button'
import { Card, EmptyState, ProgressBar, Section, StatCard } from '@/components/ui/Card'
import {
  ArchiveIcon,
  ArrowLeftIcon,
  PencilIcon,
  PercentIcon,
  PlusIcon,
  ReceiptIcon,
  TrashIcon,
} from '@/components/ui/icons'
import { ConfirmDialog } from '@/components/ui/Modal'
import { YearOverview } from '@/components/YearOverview'
import type { InterestRatePeriod, LoanPart, Payment } from '@/domain/types'
import { useData, useMortgage } from '@/hooks/useData'
import { usePeriod } from '@/hooks/usePeriod'
import {
  balanceSeries,
  interestDueByPayment,
  isInRange,
  paymentsWithBalance,
  pendingInterest,
  summarizeInterestCheck,
  summarizeMortgage,
  yearOverview,
} from '@/lib/calculations'
import { monthsDiff, parseISODate } from '@/lib/dates'
import { formatCurrency, formatDate, formatRate, formatShare } from '@/lib/format'
import { availableYears, periodLabel } from '@/lib/period'

type Dialog =
  | { kind: 'edit-mortgage' }
  | { kind: 'delete-mortgage' }
  | { kind: 'payment'; payment?: Payment; copyFrom?: Payment }
  | { kind: 'delete-payment'; payment: Payment }
  | { kind: 'rate'; rate?: InterestRatePeriod; loanPartId?: string }
  | { kind: 'part'; part?: LoanPart }
  | { kind: 'delete-part'; part: LoanPart }
  | { kind: 'delete-rate'; rate: InterestRatePeriod }
  | null

export function MortgageDetailPage() {
  const { id } = useParams()
  const { mortgage, rates, payments, documents } = useMortgage(id)
  const {
    deleteMortgage,
    deletePayment,
    deleteRate,
    deleteLoanPart,
    setMortgageArchived,
    sampleIds,
    allMortgages,
    selectEntity,
  } = useData()
  const { period, setPeriod, range, today, search } = usePeriod()
  const navigate = useNavigate()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [archiving, setArchiving] = useState(false)
  const toggleArchived = async (archived: boolean) => {
    if (!mortgage) return
    setArchiving(true)
    try {
      await setMortgageArchived(mortgage.id, archived)
    } finally {
      setArchiving(false)
    }
  }

  // Open je (via een link) een hypotheek van een andere entiteit, dan wisselen we één keer
  // naar die entiteit. Daarna niet meer: wissel je zelf van entiteit terwijl deze pagina
  // nog open is, dan moet die keuze blijven staan.
  const elsewhere = mortgage ? undefined : allMortgages.find((m) => m.id === id)
  const checkedId = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (checkedId.current === id) return
    checkedId.current = id
    if (elsewhere) selectEntity(elsewhere.entityId)
  }, [id, elsewhere, selectEntity])

  const view = useMemo(() => {
    if (!mortgage) return null
    // Saldo en rentecontrole altijd over álle betalingen, daarna filteren op de periode.
    const due = interestDueByPayment(mortgage, rates, payments)
    const rows = paymentsWithBalance(mortgage.principalCents, payments)
      .filter((p) => isInRange(p.date, range))
      .map((p) => ({ ...p, due: due.get(p.id) ?? null }))
    return {
      summary: summarizeMortgage(mortgage, rates, payments, range, today),
      balance: balanceSeries(mortgage, payments, range, today),
      rows,
      interestCheck: summarizeInterestCheck(rows, due),
      pending:
        range.to === null || range.to >= today
          ? pendingInterest(mortgage, rates, payments, today)
          : null,
      years: yearOverview(mortgage, rates, payments, today),
    }
  }, [mortgage, rates, payments, range, today])

  if (elsewhere) return null

  if (!mortgage || !view) {
    return (
      <Card>
        <EmptyState
          title="Hypotheek niet gevonden"
          description="Deze hypotheek bestaat niet (meer)."
          action={
            <Link to="/" className="text-sm font-medium text-slate-900 underline">
              Terug naar overzicht
            </Link>
          }
        />
      </Card>
    )
  }

  const { summary } = view
  const rate = rateLabel(summary)
  const label = periodLabel(period)
  const isAll = period === 'ALL'
  const years = availableYears([mortgage.startDate, ...payments.map((p) => p.date)], today)
  const term = mortgage.endDate ? monthsDiff(mortgage.startDate, mortgage.endDate) : null
  // Terug naar het overzicht in dezelfde weergave (actief of gearchiveerd).
  const overviewUrl = mortgage.archivedAt
    ? `/${search ? `${search}&` : '?'}weergave=gearchiveerd`
    : `/${search}`

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={overviewUrl}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"
        >
          <ArrowLeftIcon /> {mortgage.archivedAt ? 'Gearchiveerde leningen' : 'Overzicht'}
        </Link>
        <div className="mt-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{mortgage.name}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {mortgage.mortgageNumber} · gestart {formatDate(mortgage.startDate)}
              {mortgage.endDate &&
                ` · looptijd t/m ${formatDate(mortgage.endDate)}${term ? ` (${Math.round(term / 12)} jaar)` : ''}`}
              {sampleIds.includes(mortgage.id) && (
                <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
                  voorbeeld
                </span>
              )}
            </p>
          </div>
        </div>
        {mortgage.archivedAt && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-200 ring-inset">
            <span>
              <strong className="font-medium">Gearchiveerd</strong> op{' '}
              {formatDate(mortgage.archivedAt.slice(0, 10))}. Deze lening staat niet bij de actieve
              leningen op het dashboard; alle gegevens blijven bewaard.
            </span>
            <Button size="sm" disabled={archiving} onClick={() => void toggleArchived(false)}>
              Dearchiveren
            </Button>
          </div>
        )}
      </div>

      {/* Filter links, acties rechts op dezelfde regel; op smalle schermen onder elkaar. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodFilter value={period} onChange={setPeriod} years={years} />
        <div className="flex flex-wrap gap-2">
          <Button icon={<PencilIcon />} onClick={() => setDialog({ kind: 'edit-mortgage' })}>
            Hypotheek bewerken
          </Button>
          <Button icon={<PercentIcon />} onClick={() => setDialog({ kind: 'rate' })}>
            Rentewijziging toevoegen
          </Button>
          <Button
            variant="primary"
            icon={<PlusIcon />}
            onClick={() => setDialog({ kind: 'payment' })}
          >
            Betaling toevoegen
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="col-span-2 lg:col-span-1">
          <StatCard
            emphasis
            label={
              summary.balanceDate === today
                ? 'Openstaand'
                : `Openstaand per ${formatDate(summary.balanceDate)}`
            }
            value={formatCurrency(summary.outstandingCents)}
            sub={
              <span className="mt-1.5 block space-y-1">
                <ProgressBar value={summary.shareRepaid} label="Afgelost" />
                <span className="block">{formatShare(summary.shareRepaid)} afgelost</span>
              </span>
            }
          />
        </div>
        <StatCard label="Hoofdsom" value={formatCurrency(summary.principalCents)} />
        <StatCard
          label="Huidig rentepercentage"
          value={rate.value}
          sub={
            <>
              {rate.range && <span className="block">{rate.range}</span>}
              {summary.theoreticalMonthlyInterestCents !== null &&
                `≈ ${formatCurrency(summary.theoreticalMonthlyInterestCents)} rente / maand (indicatie)`}
            </>
          }
        />
        <StatCard
          label={`Betaalde rente ${label}`}
          value={formatCurrency(summary.period.interestCents)}
          sub={
            <>
              Verschuldigd: {formatCurrency(view.interestCheck.dueCents)}
              {!isAll && <> · totaal betaald {formatCurrency(summary.allTime.interestCents)}</>}
            </>
          }
        />
        <StatCard
          label={`Afgelost ${label}`}
          value={formatCurrency(summary.period.principalCents)}
          sub={isAll ? undefined : `Totaal: ${formatCurrency(summary.allTime.principalCents)}`}
        />
      </div>

      <Section
        title="Leningdelen"
        description={
          mortgage.parts.length > 1
            ? `${mortgage.parts.length} leningdelen, elk met een eigen rente en aflossingsafspraak.`
            : 'Heeft een deel van de hypotheek een andere rente? Voeg dan een leningdeel toe.'
        }
        actions={
          <Button size="sm" icon={<PlusIcon />} onClick={() => setDialog({ kind: 'part' })}>
            Leningdeel toevoegen
          </Button>
        }
      >
        <LoanPartsList
          mortgage={mortgage}
          parts={summary.parts}
          payments={payments}
          onEdit={(part) => setDialog({ kind: 'part', part })}
          onDelete={(part) => setDialog({ kind: 'delete-part', part })}
        />
      </Section>

      <Section title="Verloop openstaand bedrag" description={`Saldo na aflossingen, ${label}`}>
        {view.balance.length > 0 ? (
          <BalanceChart points={view.balance} />
        ) : (
          <EmptyState
            title="Geen gegevens in deze periode"
            description="Deze periode ligt vóór de startdatum."
          />
        )}
      </Section>

      <BankTransactionsSection
        mortgage={mortgage}
        rates={rates}
        payments={payments}
        onEditMortgage={() => setDialog({ kind: 'edit-mortgage' })}
      />

      <Section
        title="Betalingen"
        description={
          isAll ? undefined : `Getoond: ${label}. Het saldo is berekend over alle betalingen.`
        }
        actions={
          <Button
            size="sm"
            variant="primary"
            icon={<PlusIcon />}
            onClick={() => setDialog({ kind: 'payment' })}
          >
            Betaling toevoegen
          </Button>
        }
      >
        {payments.length === 0 ? (
          <EmptyState
            icon={<ReceiptIcon />}
            title="Nog geen betalingen"
            description="Voeg je eerste betaling toe. Vul per betaling apart in hoeveel rente en hoeveel aflossing het was."
            action={
              <Button
                variant="primary"
                icon={<PlusIcon />}
                onClick={() => setDialog({ kind: 'payment' })}
              >
                Betaling toevoegen
              </Button>
            }
          />
        ) : view.rows.length === 0 ? (
          <EmptyState
            icon={<ReceiptIcon />}
            title="Geen betalingen in deze periode"
            description="Kies een andere periode of voeg een betaling toe."
          />
        ) : (
          <>
            <InterestCheckSummary
              check={view.interestCheck}
              pending={view.pending}
              periodLabel={label}
              method={mortgage}
            />
            <PaymentsTable
              rows={view.rows}
              parts={mortgage.parts}
              totals={summary.period}
              interestCheck={view.interestCheck}
              onEdit={(payment) => setDialog({ kind: 'payment', payment })}
              onCopy={(copyFrom) => setDialog({ kind: 'payment', copyFrom })}
              onDelete={(payment) => setDialog({ kind: 'delete-payment', payment })}
            />
          </>
        )}
      </Section>

      <div className="grid gap-6">
        <Section
          title="Rentehistorie"
          description="Het geldende percentage is dat met de laatste ingangsdatum op of vóór een datum."
          actions={
            <Button size="sm" icon={<PlusIcon />} onClick={() => setDialog({ kind: 'rate' })}>
              Toevoegen
            </Button>
          }
        >
          <div className="space-y-5">
            {mortgage.parts.map((part) => (
              <div key={part.id}>
                {mortgage.parts.length > 1 && (
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-medium text-slate-900">{part.name}</h3>
                    <button
                      type="button"
                      onClick={() => setDialog({ kind: 'rate', loanPartId: part.id })}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    >
                      <PlusIcon className="size-3.5" /> Rentewijziging
                    </button>
                  </div>
                )}
                <RateHistory
                  mortgage={mortgage}
                  rates={rates.filter((r) => r.loanPartId === part.id)}
                  today={today}
                  onEdit={(rate) => setDialog({ kind: 'rate', rate })}
                  onDelete={(rate) => setDialog({ kind: 'delete-rate', rate })}
                />
              </div>
            ))}
          </div>
        </Section>
        <Section
          title="Jaaroverzicht"
          description="Per kalenderjaar; handig voor de belastingaangifte."
        >
          <YearOverview rows={view.years} currentYear={parseISODate(today).year} />
        </Section>
      </div>

      <DocumentsSection mortgage={mortgage} documents={documents} />

      {mortgage.notes && (
        <Section title="Notities">
          <p className="text-sm whitespace-pre-line text-slate-600">{mortgage.notes}</p>
        </Section>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        {!mortgage.archivedAt && (
          <Button
            variant="ghost"
            icon={<ArchiveIcon />}
            disabled={archiving}
            onClick={() => void toggleArchived(true)}
          >
            Archiveren
          </Button>
        )}
        <Button
          variant="ghost"
          icon={<TrashIcon />}
          onClick={() => setDialog({ kind: 'delete-mortgage' })}
          className="text-red-600 hover:bg-red-50 hover:text-red-700"
        >
          Hypotheek verwijderen
        </Button>
      </div>

      {dialog?.kind === 'edit-mortgage' && (
        <MortgageForm mortgage={mortgage} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'payment' && (
        <PaymentForm
          mortgage={mortgage}
          rates={rates}
          payments={payments}
          payment={dialog.payment}
          copyFrom={dialog.copyFrom}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'rate' && (
        <RateForm
          mortgage={mortgage}
          rates={rates}
          rate={dialog.rate}
          loanPartId={dialog.loanPartId}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'part' && (
        <LoanPartForm
          mortgage={mortgage}
          payments={payments}
          part={dialog.part}
          onClose={() => setDialog(null)}
        />
      )}
      <ConfirmDialog
        open={dialog?.kind === 'delete-part'}
        title="Leningdeel verwijderen?"
        message={
          dialog?.kind === 'delete-part' && (
            <>
              <strong>{dialog.part.name}</strong> en zijn rentehistorie worden verwijderd. Er staan
              geen betalingen op dit deel.
            </>
          )
        }
        onConfirm={() =>
          dialog?.kind === 'delete-part' ? deleteLoanPart(dialog.part.id) : undefined
        }
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog?.kind === 'delete-payment'}
        title="Betaling verwijderen?"
        message={
          dialog?.kind === 'delete-payment' && (
            <>
              De betaling van <strong>{formatDate(dialog.payment.date)}</strong> (
              {formatCurrency(dialog.payment.interestCents + dialog.payment.principalCents)}) wordt
              verwijderd.
            </>
          )
        }
        onConfirm={() =>
          dialog?.kind === 'delete-payment' ? deletePayment(dialog.payment.id) : undefined
        }
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog?.kind === 'delete-rate'}
        title="Rentepercentage verwijderen?"
        message={
          dialog?.kind === 'delete-rate' && (
            <>
              Het percentage van <strong>{formatRate(dialog.rate.rateMilliPct)}</strong> vanaf{' '}
              {formatDate(dialog.rate.effectiveDate)} wordt verwijderd. Het vorige percentage loopt
              dan door.
            </>
          )
        }
        onConfirm={() => (dialog?.kind === 'delete-rate' ? deleteRate(dialog.rate.id) : undefined)}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog?.kind === 'delete-mortgage'}
        title="Hypotheek verwijderen?"
        message={
          <>
            <strong>{mortgage.name}</strong> wordt verwijderd, inclusief {payments.length}{' '}
            {payments.length === 1 ? 'betaling' : 'betalingen'}, {rates.length}{' '}
            {rates.length === 1 ? 'rentepercentage' : 'rentepercentages'}
            {documents.length > 0 &&
              ` en ${documents.length} ${documents.length === 1 ? 'document' : 'documenten'}`}
            . Dit kan niet ongedaan worden gemaakt.
          </>
        }
        onConfirm={async () => {
          await deleteMortgage(mortgage.id)
          navigate(`/${search}`)
        }}
        onClose={() => setDialog(null)}
      />
    </div>
  )
}
