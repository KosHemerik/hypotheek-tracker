import { useState, type FormEvent } from 'react'
import type { DocumentCategory, Mortgage } from '@/domain/types'
import { useData } from '@/hooks/useData'
import { formatFileSize, guessCategory, validateFiles } from '@/lib/documents'
import { messageOf } from '@/lib/errors'
import { Button, IconButton } from '../ui/Button'
import { Field, FormError, TextInput } from '../ui/Field'
import { CloseIcon } from '../ui/icons'
import { Modal } from '../ui/Modal'
import { CategorySelect } from './CategorySelect'
import { FileBadge } from './FileBadge'

interface UploadDialogProps {
  mortgage: Mortgage
  initialFiles: File[]
  onClose: () => void
  /** Wordt aangeroepen met eventuele meldingen van mislukte uploads. */
  onDone: (result: { uploaded: number; failed: string[] }) => void
}

interface Pending {
  key: string
  file: File
  category: DocumentCategory
}

let keyCounter = 0
const toPending = (files: File[]): Pending[] =>
  files.map((file) => ({ key: String(++keyCounter), file, category: guessCategory(file.name) }))

export function UploadDialog({ mortgage, initialFiles, onClose, onDone }: UploadDialogProps) {
  const { uploadDocuments } = useData()
  const [pending, setPending] = useState<Pending[]>(() => toPending(initialFiles))
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const setCategory = (key: string, category: DocumentCategory) =>
    setPending((list) => list.map((p) => (p.key === key ? { ...p, category } : p)))

  async function submit(e: FormEvent) {
    e.preventDefault()
    const problems = validateFiles(pending.map((p) => p.file))
    if (problems.length) return setErrors(problems)
    setErrors([])
    setSaving(true)
    try {
      const categories = new Map(pending.map((p) => [p.file, p.category]))
      const result = await uploadDocuments(
        mortgage.id,
        pending.map((p) => p.file),
        {
          category: (file) => categories.get(file) ?? 'other',
          description: description.trim() || null,
        },
      )
      onDone(result)
      onClose()
    } catch (error) {
      setErrors([messageOf(error)])
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      title={pending.length === 1 ? 'Document uploaden' : `${pending.length} documenten uploaden`}
      description={mortgage.name}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Annuleren</Button>
          <Button
            variant="primary"
            type="submit"
            form="upload-form"
            disabled={saving || pending.length === 0}
          >
            {saving ? 'Bezig met uploaden…' : 'Uploaden'}
          </Button>
        </>
      }
    >
      <form id="upload-form" onSubmit={submit} noValidate className="space-y-4">
        {errors.length > 0 && <FormError message={errors.join(' ')} />}

        {pending.length === 0 ? (
          <p className="text-sm text-slate-500">Geen bestanden meer geselecteerd.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
            {pending.map((p) => (
              <li key={p.key} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <FileBadge mimeType={p.file.type} fileName={p.file.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={p.file.name}>
                    {p.file.name}
                  </p>
                  <p className="tabular text-xs text-slate-500">{formatFileSize(p.file.size)}</p>
                </div>
                <label className="sr-only" htmlFor={`cat-${p.key}`}>
                  Categorie voor {p.file.name}
                </label>
                <CategorySelect
                  id={`cat-${p.key}`}
                  value={p.category}
                  onChange={(c) => setCategory(p.key, c)}
                  className="w-40"
                />
                <IconButton
                  label={`${p.file.name} niet uploaden`}
                  onClick={() => setPending((list) => list.filter((x) => x.key !== p.key))}
                >
                  <CloseIcon />
                </IconButton>
              </li>
            ))}
          </ul>
        )}

        <Field label="Omschrijving" optional hint="Geldt voor alle geselecteerde bestanden.">
          {(props) => (
            <TextInput
              {...props}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Bijv. getekend exemplaar"
            />
          )}
        </Field>
      </form>
    </Modal>
  )
}
