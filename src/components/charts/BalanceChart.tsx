import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { BalancePoint } from '@/lib/calculations'
import { parseISODate } from '@/lib/dates'
import { formatCurrency, formatCurrencyCompact, formatDate, formatMonthShort } from '@/lib/format'
import { TooltipBox } from './chartParts'
import { axisProps, CHART_COLORS } from './chartTheme'

const toTime = (date: string) => {
  const { year, month, day } = parseISODate(date)
  return Date.UTC(year, month - 1, day)
}
const fromTime = (t: number) => new Date(t).toISOString().slice(0, 10)

/** Verloop van het openstaande bedrag (trapvormig: het saldo daalt op betaaldatums). */
export function BalanceChart({ points }: { points: BalancePoint[] }) {
  const data = points.map((p) => ({ t: toTime(p.date), balance: p.balanceCents }))
  const min = Math.min(...data.map((d) => d.balance))
  const max = Math.max(...data.map((d) => d.balance))
  // Ruim om het bereik heen zodat de daling zichtbaar is, zonder de as bij 0 te laten beginnen.
  const pad = Math.max((max - min) * 0.15, max * 0.005)
  const domain = [
    Math.max(0, Math.floor((min - pad) / 100_000) * 100_000),
    Math.ceil((max + pad) / 100_000) * 100_000,
  ]

  return (
    <div className="h-64 w-full sm:h-72">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
          <XAxis
            {...axisProps}
            dataKey="t"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(t: number) => formatMonthShort(fromTime(t).slice(0, 7))}
            minTickGap={24}
          />
          <YAxis
            {...axisProps}
            domain={domain}
            width={72}
            tickFormatter={(v: number) => formatCurrencyCompact(v)}
          />
          <Tooltip
            cursor={{ stroke: CHART_COLORS.axis, strokeWidth: 1 }}
            content={({ active, payload }) => {
              const item = payload?.[0]?.payload as { t: number; balance: number } | undefined
              if (!active || !item) return null
              return (
                <TooltipBox
                  title={formatDate(fromTime(item.t))}
                  rows={[
                    {
                      color: CHART_COLORS.principal,
                      label: 'Openstaand',
                      value: formatCurrency(item.balance),
                      strong: true,
                    },
                  ]}
                />
              )
            }}
          />
          <Area
            type="stepAfter"
            dataKey="balance"
            name="Openstaand"
            stroke={CHART_COLORS.principal}
            strokeWidth={2}
            fill={CHART_COLORS.principal}
            fillOpacity={0.1}
            activeDot={{ r: 4, stroke: CHART_COLORS.surface, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
