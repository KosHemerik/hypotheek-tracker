import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { MonthlyChart } from '@/components/charts/MonthlyChart'
import { MortgageCard } from '@/components/mortgage/MortgageCard'
import { MortgageForm } from '@/components/mortgage/MortgageForm'
import { PeriodFilter } from '@/components/PeriodFilter'
import { Button } from '@/components/ui/Button'
import { Card, EmptyState, Section, StatCard } from '@/components/ui/Card'
import { HouseIcon, PlusIcon, SparkleIcon } from '@/components/ui/icons'
import { ConfirmDialog } from '@/components/ui/Modal'
import { YearOverview } from '@/components/YearOverview'
import { useData } from '@/hooks/useData'
import { usePeriod } from '@/hooks/usePeriod'
import {
  combineMonthlyBreakdowns,
  combineYearOverviews,
  monthlyBreakdown,
  summarizeMortgage,
  yearOverview,
} from '@/lib/calculations'
import { parseISODate } from '@/lib/dates'
import { formatCurrency, formatDate, formatShare } from '@/lib/format'
import { availableYears, periodLabel } from '@/lib/period'

export function DashboardPage() {
  const data = useData()
  const { mortgages, rates, payments, sampleIds } = data
  const { period, setPeriod, range, today, search } = usePeriod()
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  const view = useMemo(() => {
    const perMortgage = mortgages.map((m) => {
      const r = rates.filter((x) => x.mortgageId === m.id)
      const p = payments.filter((x) => x.mortgageId === m.id)
      return {
        mortgage: m,
        summary: summarizeMortgage(m, r, p, range, today),
        monthly: monthlyBreakdown(m, r, p, range, today),
        years: yearOverview(m, p, today),
      }
    })
    const sum = (f: (s: (typeof perMortgage)[number]['summary']) => number) =>
      perMortgage.reduce((acc, x) => acc + f(x.summary), 0)
    const principal = sum((s) => s.principalCents)
    const outstanding = sum((s) => s.outstandingCents)
    return {
      perMortgage,
      totals: {
        principal,
        outstanding,
        interest: sum((s) => s.period.interestCents),
        repaid: sum((s) => s.period.principalCents),
        interestAll: sum((s) => s.allTime.interestCents),
        repaidAll: sum((s) => s.allTime.principalCents),
        theoretical: sum((s) => s.theoreticalMonthlyInterestCents ?? 0),
        share: principal > 0 ? (principal - outstanding) / principal : 0,
      },
      monthly: combineMonthlyBreakdowns(perMortgage.map((x) => x.monthly)),
      years: combineYearOverviews(perMortgage.map((x) => x.years)),
    }
  }, [mortgages, rates, payments, range, today])

  const years = availableYears(
    [...mortgages.map((m) => m.startDate), ...payments.map((p) => p.date)],
    today,
  )
  const label = periodLabel(period)
  const balanceDate = view.perMortgage[0]?.summary.balanceDate ?? today
  const isAll = period === 'ALL'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overzicht</h1>
          <p className="mt-1 text-sm text-slate-500">
            {mortgages.length === 0
              ? 'Nog geen hypotheken'
              : `${mortgages.length} ${mortgages.length === 1 ? 'hypotheek' : 'hypotheken'}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {sampleIds.length > 0 ? (
            <Button variant="ghost" onClick={() => setConfirmClear(true)}>
              Voorbeelddata wissen
            </Button>
          ) : (
            <Button
              variant="ghost"
              icon={<SparkleIcon />}
              onClick={() => void data.loadSampleData()}
            >
              Voorbeelddata laden
            </Button>
          )}
          <Button variant="primary" icon={<PlusIcon />} onClick={() => setAdding(true)}>
            Hypotheek toevoegen
          </Button>
        </div>
      </div>

      {mortgages.length === 0 ? (
        <Card>
          <EmptyState
            icon={<HouseIcon />}
            title="Nog geen hypotheken"
            description="Voeg je eerste hypotheek (of leningdeel) toe om de stand, betaalde rente en aflossingen bij te houden. Of laad voorbeelddata om de app te verkennen."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="primary" icon={<PlusIcon />} onClick={() => setAdding(true)}>
                  Hypotheek toevoegen
                </Button>
                <Button icon={<SparkleIcon />} onClick={() => void data.loadSampleData()}>
                  Voorbeelddata laden
                </Button>
              </div>
            }
          />
        </Card>
      ) : (
        <>
          <PeriodFilter value={period} onChange={setPeriod} years={years} />

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="col-span-2 lg:col-span-1">
              <StatCard
                emphasis
                label={
                  balanceDate === today
                    ? 'Totaal openstaand'
                    : `Openstaand per ${formatDate(balanceDate)}`
                }
                value={formatCurrency(view.totals.outstanding)}
                sub={`${formatShare(view.totals.share)} afgelost van ${formatCurrency(view.totals.principal)}`}
              />
            </div>
            <StatCard
              label={`Betaalde rente ${label}`}
              value={formatCurrency(view.totals.interest)}
              sub={isAll ? undefined : `Totaal: ${formatCurrency(view.totals.interestAll)}`}
            />
            <StatCard
              label={`Afgelost ${label}`}
              value={formatCurrency(view.totals.repaid)}
              sub={isAll ? undefined : `Totaal: ${formatCurrency(view.totals.repaidAll)}`}
            />
            <div className="col-span-2 lg:col-span-1">
              <StatCard
                label="Theoretische rente / maand"
                value={formatCurrency(view.totals.theoretical)}
                sub="Indicatie: huidig saldo × huidig percentage / 12"
              />
            </div>
          </div>

          <section aria-labelledby="mortgages-heading">
            <h2 id="mortgages-heading" className="sr-only">
              Hypotheken
            </h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {view.perMortgage.map(({ mortgage, summary }) => (
                <MortgageCard
                  key={mortgage.id}
                  mortgage={mortgage}
                  summary={summary}
                  periodLabel={label}
                  isSample={sampleIds.includes(mortgage.id)}
                  search={search}
                  today={today}
                />
              ))}
            </div>
          </section>

          <Section
            title="Rente en aflossing per maand"
            description={`Alle hypotheken samen, ${label}`}
          >
            {view.monthly.length > 0 ? (
              <MonthlyChart rows={view.monthly} />
            ) : (
              <EmptyState title="Geen gegevens in deze periode" />
            )}
          </Section>

          <Section
            title="Jaaroverzicht"
            description="Alle hypotheken samen. Handig voor de belastingaangifte (betaalde rente en schuld per 1 januari / 31 december)."
          >
            <YearOverview rows={view.years} currentYear={parseISODate(today).year} />
          </Section>
        </>
      )}

      {adding && (
        <MortgageForm
          onClose={() => setAdding(false)}
          onSaved={(created) => created && navigate(`/hypotheek/${created.id}${search}`)}
        />
      )}
      <ConfirmDialog
        open={confirmClear}
        title="Voorbeelddata wissen?"
        message="De voorbeeld-hypotheken en al hun rentewijzigingen en betalingen worden verwijderd. Hypotheken die je zelf hebt toegevoegd blijven staan."
        confirmLabel="Wissen"
        onConfirm={() => data.clearSampleData()}
        onClose={() => setConfirmClear(false)}
      />
    </div>
  )
}
