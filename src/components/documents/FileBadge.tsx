import { fileKind } from '@/lib/documents'

const STYLES = {
  pdf: 'bg-red-50 text-red-700 ring-red-200',
  image: 'bg-violet-50 text-violet-700 ring-violet-200',
  spreadsheet: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  text: 'bg-blue-50 text-blue-700 ring-blue-200',
  other: 'bg-slate-50 text-slate-600 ring-slate-200',
} as const

/** Klein bestandsicoon met de extensie als tekst (soort is dus niet alleen aan kleur af te lezen). */
export function FileBadge({ mimeType, fileName }: { mimeType: string; fileName: string }) {
  const kind = fileKind(mimeType, fileName)
  const dot = fileName.lastIndexOf('.')
  const ext = dot > 0 ? fileName.slice(dot + 1, dot + 5).toUpperCase() : 'FILE'
  return (
    <span
      aria-hidden="true"
      className={`flex h-10 w-9 shrink-0 items-end justify-center rounded-md pb-1.5 text-[10px] font-semibold tracking-wide ring-1 ring-inset ${STYLES[kind]}`}
    >
      {ext}
    </span>
  )
}
