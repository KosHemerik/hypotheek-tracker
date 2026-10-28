import { SelectInput } from './ui/Field'
import { RELATIVE_PERIODS, type PeriodKey } from '@/lib/period'

interface PeriodFilterProps {
  value: PeriodKey
  onChange: (key: PeriodKey) => void
  years: number[]
}

export function PeriodFilter({ value, onChange, years }: PeriodFilterProps) {
  const isYear = /^\d{4}$/.test(value)
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Periode">
      <div className="inline-flex rounded-lg bg-slate-200/60 p-0.5">
        {RELATIVE_PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            aria-pressed={value === p.key}
            onClick={() => onChange(p.key)}
            className={`h-8 cursor-pointer rounded-md px-3 text-sm font-medium transition-colors ${
              value === p.key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <label className="sr-only" htmlFor="period-year">
        Kalenderjaar
      </label>
      <SelectInput
        id="period-year"
        size="sm"
        active={isYear}
        className="w-40"
        value={isYear ? value : ''}
        onChange={(e) => e.target.value && onChange(e.target.value as PeriodKey)}
      >
        <option value="">Kalenderjaar…</option>
        {years.map((y) => (
          <option key={y} value={String(y)}>
            {y}
          </option>
        ))}
      </SelectInput>
    </div>
  )
}
