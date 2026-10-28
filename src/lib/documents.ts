import { DOCUMENT_CATEGORIES, type DocumentCategory } from '@/domain/types'

export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024
export const MAX_FILES_PER_UPLOAD = 10

export const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  offer: 'Offerte',
  deed: 'Hypotheekakte',
  valuation: 'Taxatierapport',
  annual_statement: 'Jaaroverzicht',
  rate_change: 'Rentewijziging',
  other: 'Overig',
}

export const CATEGORY_OPTIONS = DOCUMENT_CATEGORIES.map((value) => ({
  value,
  label: CATEGORY_LABELS[value],
}))

/** 1536 → "1,5 kB", 2_500_000 → "2,4 MB" */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['kB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  const formatted = new Intl.NumberFormat('nl-NL', {
    maximumFractionDigits: value < 10 ? 1 : 0,
  }).format(value)
  return `${formatted} ${units[unit]}`
}

/** Raadt een categorie op basis van de bestandsnaam; valt terug op 'other'. */
export function guessCategory(fileName: string): DocumentCategory {
  const name = fileName.toLowerCase()
  if (/jaaroverzicht|jaaropgave|annual/.test(name)) return 'annual_statement'
  if (/taxatie|valuation/.test(name)) return 'valuation'
  if (/akte|notari/.test(name)) return 'deed'
  if (/offerte|aanbod|offer/.test(name)) return 'offer'
  if (/rente(wijziging|herziening|voorstel)|rate/.test(name)) return 'rate_change'
  return 'other'
}

export type FileKind = 'pdf' | 'image' | 'spreadsheet' | 'text' | 'other'

export function fileKind(mimeType: string, fileName: string): FileKind {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  if (mimeType === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (mimeType.startsWith('image/')) return 'image'
  if (/sheet|excel|csv|numbers/.test(mimeType) || ['xls', 'xlsx', 'csv', 'numbers'].includes(ext)) {
    return 'spreadsheet'
  }
  if (
    mimeType.startsWith('text/') ||
    /word|document/.test(mimeType) ||
    ['doc', 'docx', 'txt', 'pages'].includes(ext)
  ) {
    return 'text'
  }
  return 'other'
}

/** Kan de browser dit bestand zelf tonen (in een nieuw tabblad)? */
export function isPreviewable(mimeType: string): boolean {
  return (
    mimeType === 'application/pdf' || mimeType.startsWith('image/') || mimeType === 'text/plain'
  )
}

export interface FileLike {
  name: string
  size: number
}

/** Controleert een selectie bestanden; geeft per probleem een leesbare melding. */
export function validateFiles(files: readonly FileLike[]): string[] {
  const errors: string[] = []
  if (files.length === 0) errors.push('Kies minimaal één bestand.')
  if (files.length > MAX_FILES_PER_UPLOAD) {
    errors.push(`Upload maximaal ${MAX_FILES_PER_UPLOAD} bestanden tegelijk.`)
  }
  for (const file of files) {
    if (file.size === 0 && isApplePackageName(file.name))
      errors.push(applePackageMessage(file.name))
    else if (file.size === 0) errors.push(`"${file.name}" is leeg.`)
    else if (file.size > MAX_FILE_SIZE_BYTES) {
      errors.push(
        `"${file.name}" is te groot (${formatFileSize(file.size)}); maximaal ${formatFileSize(MAX_FILE_SIZE_BYTES)}.`,
      )
    }
  }
  return errors
}

/** Valideert een nieuwe bestandsnaam bij het hernoemen; houdt de extensie verplicht gelijk. */
export function validateFileName(name: string, original: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return 'Vul een bestandsnaam in.'
  if (/[\\/]/.test(trimmed)) return 'Een bestandsnaam mag geen / of \\ bevatten.'
  const ext = extension(original)
  if (ext && extension(trimmed) !== ext) return `De bestandsnaam moet eindigen op .${ext}.`
  return null
}

function extension(name: string): string {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(i + 1).toLowerCase() : ''
}

/** Apple iWork-bestanden (Numbers, Pages, Keynote). */
const APPLE_IWORK_EXTENSIONS = ['numbers', 'pages', 'key']

export function isApplePackageName(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return APPLE_IWORK_EXTENSIONS.includes(ext)
}

/**
 * iWork-bestanden kunnen als "pakket" bewaard zijn: dat is eigenlijk een map, en een
 * browser kan een map niet als één bestand uploaden (hij komt leeg of helemaal niet door).
 */
export function applePackageMessage(name: string): string {
  return (
    `"${name}" is als pakket (map) bewaard en kan zo niet worden geüpload. ` +
    'Zet het in Numbers/Pages/Keynote om naar één bestand via Archief → Geavanceerd → ' +
    'Wijzig bestandstype → Eén bestand, of exporteer het naar Excel of PDF.'
  )
}
