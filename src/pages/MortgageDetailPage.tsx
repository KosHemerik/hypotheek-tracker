import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { BalanceChart } from '@/components/charts/BalanceChart'
import { MonthlyChart } from '@/components/charts/MonthlyChart'
import { MortgageForm } from '@/components/mortgage/MortgageForm'
import { PaymentForm } from '@/components/payments/PaymentForm'
import { PaymentsTable } from '@/components/payments/PaymentsTable'
import { PeriodFilter } from '@/components/PeriodFilter'
import { RateForm } from '@/components/rates/RateForm'
import { RateHistory } from '@/components/rates/RateHistory'
import { Button } from '@/components/ui/Button'
import { Card, EmptyState, ProgressBar, Section, StatCard } from '@/components/ui/Card'
import {
  ArrowLeftIcon,
  PencilIcon,
  PercentIcon,
  PlusIcon,
  ReceiptIcon,
  TrashIcon,
} from '@/components/ui/icons'
import { ConfirmDialog } from '@/components/ui/Modal'
import { YearOverview } from '@/components/YearOverview'
import type { InterestRatePeriod, Payment } from '@/domain/types'
import { useData, useMortgage } from '@/hooks/useData'
import { usePeriod } from '@/hooks/usePeriod'
import {
  balanceSeries,
  isInRange,
  monthlyBreakdown,
  paymentsWithBalance,
  summarizeMortgage,
  yearOverview,
} from '@/lib/calculations'
import { monthsDiff, parseISODate } from '@/lib/dates'
import { formatCurrency, formatDate, formatRate, formatShare } from '@/lib/format'
import { availableYears, periodLabel } from '@/lib/period'

type Dialog =
  | { kind: 'edit-mortgage' }
  | { kind: 'delete-mortgage' }
  | { kind: 'payment'; payment?: Payment }
  | { kind: 'delete-payment'; payment: Payment }
  | { kind: 'rate'; rate?: InterestRatePeriod }
  | { kind: 'delete-rate'; rate: InterestRatePeriod }
  | null

export function MortgageDetailPage() {
  const { id } = useParams()
  const { mortgage, rates, payments } = useMortgage(id)
  const { deleteMortgage, deletePayment, deleteRate, sampleIds } = useData()
  const { period, setPeriod, range, today, search } = usePeriod()
  const navigate = useNavigate()
  const [dialog, setDialog] = useState<Dialog>(null)

  const view = useMemo(() => {
    if (!mortgage) return null
    const withBalance = paymentsWithBalance(mortgage.principalCents, payments)
    return {
      summary: summarizeMortgage(mortgage, rates, payments, range, today),
      balance: balanceSeries(mortgage, payments, range, today),
      monthly: monthlyBreakdown(mortgage, rates, payments, range, today),
      rows: withBalance.filter((p) => isInRange(p.date, range)),
      years: yearOverview(mortgage, payments, today),
    }
  }, [mortgage, rates, payments, range, today])

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
  const label = periodLabel(period)
  const isAll = period === 'ALL'
  const years = availableYears([mortgage.startDate, ...payments.map((p) => p.date)], today)
  const term = mortgage.endDate ? monthsDiff(mortgage.startDate, mortgage.endDate) : null

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={`/${search}`}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"
        >
          <ArrowLeftIcon /> Overzicht
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
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
      </div>

      <PeriodFilter value={period} onChange={setPeriod} years={years} />

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
          value={summary.currentRate ? formatRate(summary.currentRate.rateMilliPct) : '—'}
          sub={
            summary.theoreticalMonthlyInterestCents !== null
              ? `≈ ${formatCurrency(summary.theoreticalMonthlyInterestCents)} rente / maand (indicatie)`
              : undefined
          }
        />
        <StatCard
          label={`Betaalde rente ${label}`}
          value={formatCurrency(summary.period.interestCents)}
          sub={isAll ? undefined : `Totaal: ${formatCurrency(summary.allTime.interestCents)}`}
        />
        <StatCard
          label={`Afgelost ${label}`}
          value={formatCurrency(summary.period.principalCents)}
          sub={isAll ? undefined : `Totaal: ${formatCurrency(summary.allTime.principalCents)}`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
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
        <Section
          title="Rente en aflossing per maand"
          description="Vergelijk de betaalde rente met de theoretische rente (saldo begin maand × percentage / 12)."
        >
          {view.monthly.length > 0 ? (
            <MonthlyChart rows={view.monthly} />
          ) : (
            <EmptyState title="Geen gegevens in deze periode" />
          )}
        </Section>
      </div>

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
          <PaymentsTable
            rows={view.rows}
            totals={summary.period}
            onEdit={(payment) => setDialog({ kind: 'payment', payment })}
            onDelete={(payment) => setDialog({ kind: 'delete-payment', payment })}
          />
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Section
          title="Rentehistorie"
          description="Het geldende percentage is dat met de laatste ingangsdatum op of vóór een datum."
          actions={
            <Button size="sm" icon={<PlusIcon />} onClick={() => setDialog({ kind: 'rate' })}>
              Toevoegen
            </Button>
          }
        >
          <RateHistory
            mortgage={mortgage}
            rates={rates}
            today={today}
            onEdit={(rate) => setDialog({ kind: 'rate', rate })}
            onDelete={(rate) => setDialog({ kind: 'delete-rate', rate })}
          />
        </Section>
        <Section
          title="Jaaroverzicht"
          description="Per kalenderjaar; handig voor de belastingaangifte."
        >
          <YearOverview rows={view.years} currentYear={parseISODate(today).year} />
        </Section>
      </div>

      {mortgage.notes && (
        <Section title="Notities">
          <p className="text-sm whitespace-pre-line text-slate-600">{mortgage.notes}</p>
        </Section>
      )}

      <div className="flex justify-end">
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
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'rate' && (
        <RateForm
          mortgage={mortgage}
          rates={rates}
          rate={dialog.rate}
          onClose={() => setDialog(null)}
        />
      )}
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
            {payments.length === 1 ? 'betaling' : 'betalingen'} en {rates.length}{' '}
            {rates.length === 1 ? 'rentepercentage' : 'rentepercentages'}. Dit kan niet ongedaan
            worden gemaakt.
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
