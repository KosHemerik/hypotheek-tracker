import type { ReactNode } from 'react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl bg-white ring-1 ring-slate-200 ${className}`}>{children}</div>
}

export function Section({
  title,
  description,
  actions,
  children,
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </Card>
  )
}

export function StatCard({
  label,
  value,
  sub,
  emphasis = false,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  emphasis?: boolean
}) {
  return (
    <Card className="h-full px-4 py-3.5">
      <p className="text-sm text-slate-500">{label}</p>
      <p
        className={`tabular mt-1 font-semibold tracking-tight text-slate-900 ${emphasis ? 'text-2xl' : 'text-xl'}`}
      >
        {value}
      </p>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </Card>
  )
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 1000) / 10
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-2 w-full overflow-hidden rounded-full bg-blue-100"
    >
      <div className="h-full rounded-full bg-principal" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      {icon && (
        <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 [&_svg]:size-5">
          {icon}
        </div>
      )}
      <p className="font-medium text-slate-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
