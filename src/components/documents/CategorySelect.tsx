import type { DocumentCategory } from '@/domain/types'
import { CATEGORY_OPTIONS } from '@/lib/documents'

interface CategorySelectProps {
  id?: string
  value: DocumentCategory
  onChange: (value: DocumentCategory) => void
  className?: string
}

export function CategorySelect({ id, value, onChange, className = '' }: CategorySelectProps) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value as DocumentCategory)}
      className={`h-9 cursor-pointer rounded-lg border-0 bg-white px-3 pr-8 text-sm text-slate-900 ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-slate-900 ${className}`}
    >
      {CATEGORY_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
