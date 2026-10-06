import { useState, type FormEvent } from 'react'
import type { DocumentCategory, MortgageDocument } from '@/domain/types'
import { useData } from '@/hooks/useData'
import { validateFileName } from '@/lib/documents'
import { messageOf } from '@/lib/errors'
import { Button } from '../ui/Button'
import { Field, FormError, TextInput } from '../ui/Field'
import { Modal } from '../ui/Modal'
import { CategorySelect } from './CategorySelect'

export function DocumentEditDialog({
  document,
  onClose,
}: {
  document: MortgageDocument
  onClose: () => void
}) {
  const { updateDocument } = useData()
  const [fileName, setFileName] = useState(document.fileName)
  const [category, setCategory] = useState<DocumentCategory>(document.category)
  const [description, setDescription] = useState(document.description ?? '')
  const [errors, setErrors] = useState<{ fileName?: string; form?: string }>({})
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const nameError = validateFileName(fileName, document.fileName)
    if (nameError) return setErrors({ fileName: nameError })
    setErrors({})
    setSaving(true)
    try {
      await updateDocument(document.id, {
        fileName: fileName.trim(),
        category,
        description: description.trim() || null,
      })
      onClose()
    } catch (error) {
      setErrors({ form: messageOf(error) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      size="sm"
      title="Document bewerken"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Annuleren</Button>
          <Button variant="primary" type="submit" form="document-form" disabled={saving}>
            Opslaan
          </Button>
        </>
      }
    >
      <form id="document-form" onSubmit={submit} noValidate className="space-y-4">
        <FormError message={errors.form} />
        <Field label="Bestandsnaam" error={errors.fileName}>
          {(p) => (
            <TextInput
              {...p}
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              autoFocus
            />
          )}
        </Field>
        <Field label="Categorie">
          {(p) => (
            <CategorySelect id={p.id} value={category} onChange={setCategory} className="w-full" />
          )}
        </Field>
        <Field label="Omschrijving" optional>
          {(p) => (
            <TextInput
              {...p}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          )}
        </Field>
      </form>
    </Modal>
  )
}
