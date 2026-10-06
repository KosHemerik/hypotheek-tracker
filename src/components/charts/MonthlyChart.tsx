import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { MonthlyBreakdown } from '@/lib/calculations'
import {
  formatCurrency,
  formatCurrencyCompact,
  formatMonthLong,
  formatMonthShort,
} from '@/lib/format'
import { ChartLegend, LegendItem, TooltipBox } from './chartParts'
import { axisProps, CHART_COLORS } from './chartTheme'

/**
 * Betaalde rente en aflossing per maand (gestapeld), met de theoretisch verschuldigde
 * rente als lijn ter vergelijking met de werkelijk betaalde rente.
 */
export function MonthlyChart({
  rows,
  showTheoretical = true,
}: {
  rows: MonthlyBreakdown[]
  showTheoretical?: boolean
}) {
  const hasTheoretical = showTheoretical && rows.some((r) => r.theoreticalInterestCents !== null)
  return (
    <div>
      <ChartLegend>
        <LegendItem color={CHART_COLORS.interest} label="Betaalde rente" />
        <LegendItem color={CHART_COLORS.principal} label="Aflossing" />
        {hasTheoretical && (
          <LegendItem
            color={CHART_COLORS.theoretical}
            label="Theoretische rente (indicatie)"
            kind="line"
          />
        )}
      </ChartLegend>
      <div className="h-64 w-full sm:h-72">
        <ResponsiveContainer>
          <ComposedChart
            data={rows}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            barCategoryGap="20%"
          >
            <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
            <XAxis {...axisProps} dataKey="month" tickFormatter={formatMonthShort} minTickGap={8} />
            <YAxis
              {...axisProps}
              width={72}
              tickFormatter={(v: number) => formatCurrencyCompact(v)}
            />
            <Tooltip
              cursor={{ fill: '#f1f5f9' }}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as MonthlyBreakdown | undefined
                if (!active || !row) return null
                return (
                  <TooltipBox
                    title={formatMonthLong(row.month)}
                    rows={[
                      {
                        color: CHART_COLORS.interest,
                        label: 'Betaalde rente',
                        value: formatCurrency(row.interestCents),
                      },
                      {
                        color: CHART_COLORS.principal,
                        label: 'Aflossing',
                        value: formatCurrency(row.principalCents),
                      },
                      {
                        label: 'Totaal',
                        value: formatCurrency(row.interestCents + row.principalCents),
                        strong: true,
                      },
                      ...(hasTheoretical && row.theoreticalInterestCents !== null
                        ? [
                            {
                              color: CHART_COLORS.theoretical,
                              label: 'Theoretische rente',
                              value: formatCurrency(row.theoreticalInterestCents),
                            },
                          ]
                        : []),
                    ]}
                  />
                )
              }}
            />
            <Bar
              dataKey="interestCents"
              name="Betaalde rente"
              stackId="paid"
              fill={CHART_COLORS.interest}
              stroke={CHART_COLORS.surface}
              strokeWidth={1}
              maxBarSize={24}
              isAnimationActive={false}
            />
            <Bar
              dataKey="principalCents"
              name="Aflossing"
              stackId="paid"
              fill={CHART_COLORS.principal}
              stroke={CHART_COLORS.surface}
              strokeWidth={1}
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
              isAnimationActive={false}
            />
            {hasTheoretical && (
              <Line
                dataKey="theoreticalInterestCents"
                name="Theoretische rente"
                type="linear"
                stroke={CHART_COLORS.theoretical}
                strokeWidth={2}
                strokeLinecap="round"
                dot={false}
                activeDot={{ r: 4, stroke: CHART_COLORS.surface, strokeWidth: 2 }}
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
