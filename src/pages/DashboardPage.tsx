import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { BankAccountCard } from '@/components/bank/BankAccountCard'
import { MonthlyChart } from '@/components/charts/MonthlyChart'
import { MortgageCard } from '@/components/mortgage/MortgageCard'
import { MortgageForm } from '@/components/mortgage/MortgageForm'
import { PeriodFilter } from '@/components/PeriodFilter'
import { Button } from '@/components/ui/Button'
import { Card, EmptyState, Section, StatCard } from '@/components/ui/Card'
import { BuildingIcon, HouseIcon, PlusIcon, SparkleIcon } from '@/components/ui/icons'
import { EntityManager } from '@/components/entities/EntityManager'
import { ConfirmDialog } from '@/components/ui/Modal'
import { YearOverview } from '@/components/YearOverview'
import { useAuth } from '@/hooks/useAuth'
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
  // In je echte (Supabase-)database bieden we voorbeelddata alleen aan als er nog niets staat.
  const isLocal = useAuth().state.status === 'local'
  const { rates, payments, sampleIds, currentEntity } = data
  // Actief / gearchiveerd: de weergave staat in de URL (?weergave=gearchiveerd).
  const [params, setParams] = useSearchParams()
  const showArchived = params.get('weergave') === 'gearchiveerd'
  const setShowArchived = (archived: boolean) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (archived) next.set('weergave', 'gearchiveerd')
        else next.delete('weergave')
        return next
      },
      { replace: true },
    )
  const activeMortgages = data.mortgages.filter((m) => !m.archivedAt)
  const archivedMortgages = data.mortgages.filter((m) => m.archivedAt)
  // Kaarten, totalen, grafiek en jaaroverzicht volgen de gekozen weergave.
  const mortgages = showArchived ? archivedMortgages : activeMortgages
  const [managing, setManaging] = useState(false)
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
        years: yearOverview(m, r, p, today),
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {currentEntity?.name ?? 'Overzicht'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Overzicht ·{' '}
            {data.mortgages.length === 0
              ? 'nog geen hypotheken'
              : `${activeMortgages.length} actief${archivedMortgages.length ? ` · ${archivedMortgages.length} gearchiveerd` : ''}`}
          </p>
        </div>
        {data.mortgages.length > 0 && (
          <div
            className="inline-flex rounded-lg bg-slate-200/60 p-0.5"
            role="group"
            aria-label="Welke leningen tonen"
          >
            {(
              [
                [false, `Actief (${activeMortgages.length})`],
                [true, `Gearchiveerd (${archivedMortgages.length})`],
              ] as const
            ).map(([archived, text]) => (
              <button
                key={text}
                type="button"
                aria-pressed={showArchived === archived}
                onClick={() => setShowArchived(archived)}
                className={`h-8 cursor-pointer rounded-md px-3 text-sm font-medium transition-colors ${showArchived === archived ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                {text}
              </button>
            ))}
          </div>
        )}
      </div>

      {!currentEntity ? (
        <Card>
          <EmptyState
            icon={<BuildingIcon />}
            title="Nog geen entiteiten"
            description="Maak eerst een entiteit aan, bijvoorbeeld je eigen naam of je BV. Daarna kun je per entiteit hypotheken toevoegen."
            action={
              <Button variant="primary" icon={<PlusIcon />} onClick={() => setManaging(true)}>
                Entiteit toevoegen
              </Button>
            }
          />
        </Card>
      ) : data.mortgages.length > 0 && mortgages.length === 0 ? (
        <>
          <Card>
            <EmptyState
              icon={<HouseIcon />}
              title={showArchived ? 'Geen gearchiveerde leningen' : 'Geen actieve leningen'}
              description={
                showArchived
                  ? 'Archiveer een afgeloste of beëindigde lening via de knop "Archiveren" op de pagina van die lening.'
                  : `Alle leningen van ${currentEntity.name} zijn gearchiveerd.`
              }
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button onClick={() => setShowArchived(!showArchived)}>
                    {showArchived ? 'Toon actieve leningen' : 'Toon gearchiveerde leningen'}
                  </Button>
                  {!showArchived && (
                    <Button variant="primary" icon={<PlusIcon />} onClick={() => setAdding(true)}>
                      Hypotheek toevoegen
                    </Button>
                  )}
                </div>
              }
            />
          </Card>
          <BankAccountCard />
        </>
      ) : mortgages.length === 0 ? (
        <>
          <Card>
            <EmptyState
              icon={<HouseIcon />}
              title={`Nog geen hypotheken voor ${currentEntity.name}`}
              description="Voeg de eerste hypotheek (of leningdeel) van deze entiteit toe om de stand, betaalde rente en aflossingen bij te houden. Of laad voorbeelddata om de app te verkennen."
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
          <BankAccountCard />
        </>
      ) : (
        <>
          {/* Filter links, acties rechts op dezelfde regel; op smalle schermen onder elkaar. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <PeriodFilter value={period} onChange={setPeriod} years={years} />
            <div className="flex flex-wrap gap-2">
              {sampleIds.length > 0 ? (
                <Button variant="ghost" onClick={() => setConfirmClear(true)}>
                  Voorbeelddata wissen
                </Button>
              ) : (
                isLocal && (
                  <Button
                    variant="ghost"
                    icon={<SparkleIcon />}
                    onClick={() => void data.loadSampleData()}
                  >
                    Voorbeelddata laden
                  </Button>
                )
              )}
              <Button variant="primary" icon={<PlusIcon />} onClick={() => setAdding(true)}>
                Hypotheek toevoegen
              </Button>
            </div>
          </div>

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

          <BankAccountCard />

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

      {managing && <EntityManager focusNew onClose={() => setManaging(false)} />}
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
