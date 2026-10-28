import type { DocumentCategory } from '@/domain/types'
import { CATEGORY_OPTIONS } from '@/lib/documents'
import { SelectInput } from '../ui/Field'

interface CategorySelectProps {
  id?: string
  value: DocumentCategory
  onChange: (value: DocumentCategory) => void
  className?: string
}

export function CategorySelect({ id, value, onChange, className = '' }: CategorySelectProps) {
  return (
    <SelectInput
      id={id}
      size="sm"
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value as DocumentCategory)}
    >
      {CATEGORY_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </SelectInput>
  )
}
