import { useState, type FormEvent } from 'react'
import type { Entity } from '@/domain/types'
import { useData } from '@/hooks/useData'
import { useSwitchEntity } from '@/hooks/useSwitchEntity'
import { messageOf } from '@/lib/errors'
import { MAX_ENTITY_NAME_LENGTH, validateEntityName } from '@/lib/validation'
import { Button, IconButton } from '../ui/Button'
import { FormError, TextInput } from '../ui/Field'
import { CheckIcon, CloseIcon, PencilIcon, PlusIcon, TrashIcon } from '../ui/icons'
import { ConfirmDialog, Modal } from '../ui/Modal'

/** Entiteiten toevoegen, hernoemen en verwijderen (alleen als er geen hypotheken onder vallen). */
export function EntityManager({
  onClose,
  focusNew = false,
}: {
  onClose: () => void
  /** Open met de focus op "Nieuwe entiteit". */
  focusNew?: boolean
}) {
  const { entities, allMortgages, createEntity, renameEntity, deleteEntity } = useData()
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState<Entity | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const switchEntity = useSwitchEntity()

  const countFor = (id: string) => allMortgages.filter((m) => m.entityId === id).length

  async function run(fn: () => Promise<void>) {
    setError(null)
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }

  function add(e: FormEvent) {
    e.preventDefault()
    const problem = validateEntityName(newName, entities)
    if (problem) return setError(problem)
    void run(async () => {
      const created = await createEntity(newName.trim())
      setNewName('')
      // Na toevoegen direct naar de nieuwe entiteit, dan kun je meteen hypotheken invoeren.
      await switchEntity(created.id)
    })
  }

  function saveRename(e: FormEvent) {
    e.preventDefault()
    if (!editing) return
    const problem = validateEntityName(editing.name, entities, editing.id)
    if (problem) return setError(problem)
    void run(async () => {
      await renameEntity(editing.id, editing.name.trim())
      setEditing(null)
    })
  }

  return (
    <>
      <Modal
        open
        size="sm"
        title="Entiteiten"
        description="Bijvoorbeeld privé en je BV's. Elke hypotheek hoort bij één entiteit."
        onClose={onClose}
        footer={<Button onClick={onClose}>Sluiten</Button>}
      >
        <div className="space-y-4">
          {error && <FormError message={error} />}

          <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
            {entities.map((entity) => {
              const count = countFor(entity.id)
              return (
                <li key={entity.id} className="flex items-center gap-2 px-3 py-2">
                  {editing?.id === entity.id ? (
                    <form onSubmit={saveRename} className="flex flex-1 items-center gap-1">
                      <label className="sr-only" htmlFor={`rename-${entity.id}`}>
                        Nieuwe naam voor {entity.name}
                      </label>
                      <TextInput
                        id={`rename-${entity.id}`}
                        value={editing.name}
                        maxLength={MAX_ENTITY_NAME_LENGTH}
                        onChange={(e) => setEditing({ id: entity.id, name: e.target.value })}
                        onKeyDown={(e) =>
                          e.key === 'Escape' && (e.stopPropagation(), setEditing(null))
                        }
                        autoFocus
                      />
                      <IconButton label="Naam opslaan" type="submit" disabled={busy}>
                        <CheckIcon />
                      </IconButton>
                      <IconButton label="Annuleren" onClick={() => setEditing(null)}>
                        <CloseIcon />
                      </IconButton>
                    </form>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{entity.name}</p>
                        <p className="text-xs text-slate-500">
                          {count === 0
                            ? 'Geen hypotheken'
                            : `${count} ${count === 1 ? 'hypotheek' : 'hypotheken'}`}
                        </p>
                      </div>
                      <IconButton
                        label={`${entity.name} hernoemen`}
                        onClick={() => {
                          setError(null)
                          setEditing({ id: entity.id, name: entity.name })
                        }}
                      >
                        <PencilIcon />
                      </IconButton>
                      <IconButton
                        label={
                          count > 0
                            ? 'Verplaats of verwijder eerst de hypotheken van deze entiteit'
                            : `${entity.name} verwijderen`
                        }
                        disabled={count > 0}
                        onClick={() => setDeleting(entity)}
                        className="hover:text-red-600"
                      >
                        <TrashIcon />
                      </IconButton>
                    </>
                  )}
                </li>
              )
            })}
            {entities.length === 0 && (
              <li className="px-3 py-3 text-sm text-slate-500">Nog geen entiteiten.</li>
            )}
          </ul>

          <form onSubmit={add} className="space-y-1.5">
            <label htmlFor="new-entity" className="block text-sm font-medium text-slate-700">
              Nieuwe entiteit
            </label>
            <div className="flex gap-2">
              <TextInput
                id="new-entity"
                value={newName}
                maxLength={MAX_ENTITY_NAME_LENGTH}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Bijv. Holding B.V."
                autoFocus={focusNew}
              />
              <Button type="submit" variant="primary" icon={<PlusIcon />} disabled={busy}>
                Toevoegen
              </Button>
            </div>
          </form>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title="Entiteit verwijderen?"
        message={
          deleting && (
            <>
              <strong>{deleting.name}</strong> wordt verwijderd. Er vallen geen hypotheken onder.
            </>
          )
        }
        onConfirm={() => (deleting ? run(() => deleteEntity(deleting.id)) : undefined)}
        onClose={() => setDeleting(null)}
      />
    </>
  )
}
