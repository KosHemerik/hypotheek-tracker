import type { ReactNode } from 'react'

export function LegendItem({
  color,
  label,
  kind = 'box',
}: {
  color: string
  label: string
  kind?: 'box' | 'line'
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
      {kind === 'box' ? (
        <span className="size-2.5 rounded-sm" style={{ background: color }} />
      ) : (
        <span className="h-0.5 w-3.5 rounded-full" style={{ background: color }} />
      )}
      {label}
    </span>
  )
}

export function ChartLegend({ children }: { children: ReactNode }) {
  return <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1">{children}</div>
}

export function TooltipBox({
  title,
  rows,
}: {
  title: string
  rows: { color?: string; label: string; value: string; strong?: boolean }[]
}) {
  return (
    <div className="tabular min-w-44 rounded-lg bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-slate-200">
      <p className="mb-1 font-medium text-slate-900">{title}</p>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4 py-0.5">
          <span className="inline-flex items-center gap-1.5 text-slate-500">
            {r.color && <span className="size-2 rounded-sm" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className={r.strong ? 'font-semibold text-slate-900' : 'text-slate-700'}>
            {r.value}
          </span>
        </div>
      ))}
    </div>
  )
}
