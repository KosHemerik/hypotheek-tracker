import { useState, type FormEvent } from 'react'
import { messageOf } from '@/lib/errors'
import type { Mortgage } from '@/domain/types'
import { useData, useMortgage } from '@/hooks/useData'
import { todayISO } from '@/lib/dates'
import { centsToInput } from '@/lib/money'
import {
  validateMortgage,
  type FieldErrors,
  type MortgageField,
  type MortgageFormValues,
} from '@/lib/validation'
import { Button } from '../ui/Button'
import { Field, FormError, MoneyInput, PercentInput, TextArea, TextInput } from '../ui/Field'
import { Modal } from '../ui/Modal'

interface MortgageFormProps {
  /** Leeg = nieuwe hypotheek. */
  mortgage?: Mortgage
  onClose: () => void
  onSaved?: (mortgage: Mortgage | null) => void
}

export function MortgageForm({ mortgage, onClose, onSaved }: MortgageFormProps) {
  const { createMortgage, updateMortgage } = useData()
  const { payments, rates } = useMortgage(mortgage?.id)
  const isEdit = Boolean(mortgage)

  const [values, setValues] = useState<MortgageFormValues>(() =>
    mortgage
      ? {
          name: mortgage.name,
          mortgageNumber: mortgage.mortgageNumber,
          principal: centsToInput(mortgage.principalCents),
          startDate: mortgage.startDate,
          endDate: mortgage.endDate ?? '',
          notes: mortgage.notes ?? '',
        }
      : {
          name: '',
          mortgageNumber: '',
          principal: '',
          startDate: todayISO(),
          endDate: '',
          notes: '',
          initialRate: '',
        },
  )
  const [errors, setErrors] = useState<FieldErrors<MortgageField>>({})
  const [saving, setSaving] = useState(false)

  const set = (field: MortgageField) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [field]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    const result = validateMortgage(values, { payments, rates })
    if (!result.ok) return setErrors(result.errors)
    setErrors({})
    setSaving(true)
    try {
      const { initialRateMilliPct, ...input } = result.value
      if (mortgage) {
        await updateMortgage(mortgage.id, input)
        onSaved?.(null)
      } else {
        const created = await createMortgage({
          ...input,
          initialRateMilliPct: initialRateMilliPct ?? 0,
        })
        onSaved?.(created)
      }
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
      title={isEdit ? 'Hypotheek bewerken' : 'Hypotheek toevoegen'}
      description={
        isEdit
          ? undefined
          : 'Voeg een leningdeel toe. Rentewijzigingen en betalingen voeg je daarna toe.'
      }
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Annuleren</Button>
          <Button variant="primary" type="submit" form="mortgage-form" disabled={saving}>
            {isEdit ? 'Opslaan' : 'Toevoegen'}
          </Button>
        </>
      }
    >
      <form id="mortgage-form" onSubmit={submit} noValidate className="space-y-4">
        <FormError message={errors.form} />
        <Field label="Naam" error={errors.name}>
          {(p) => (
            <TextInput
              {...p}
              value={values.name}
              onChange={set('name')}
              placeholder="Bijv. Woning – annuïtair deel"
              autoFocus
            />
          )}
        </Field>
        <Field label="Hypotheeknummer" error={errors.mortgageNumber}>
          {(p) => (
            <TextInput {...p} value={values.mortgageNumber} onChange={set('mortgageNumber')} />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Oorspronkelijk bedrag (hoofdsom)" error={errors.principal}>
            {(p) => (
              <MoneyInput
                {...p}
                value={values.principal}
                onChange={set('principal')}
                placeholder="250.000,00"
              />
            )}
          </Field>
          {!isEdit && (
            <Field label="Rentepercentage vanaf start" error={errors.initialRate}>
              {(p) => (
                <PercentInput
                  {...p}
                  value={values.initialRate ?? ''}
                  onChange={set('initialRate')}
                />
              )}
            </Field>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Startdatum"
            error={errors.startDate}
            hint={isEdit ? 'Het eerste rentepercentage schuift mee met de startdatum.' : undefined}
          >
            {(p) => (
              <TextInput {...p} type="date" value={values.startDate} onChange={set('startDate')} />
            )}
          </Field>
          <Field label="Einddatum" optional error={errors.endDate}>
            {(p) => (
              <TextInput {...p} type="date" value={values.endDate} onChange={set('endDate')} />
            )}
          </Field>
        </div>
        <Field label="Notities" optional error={errors.notes}>
          {(p) => (
            <TextArea
              {...p}
              value={values.notes}
              onChange={set('notes')}
              placeholder="Bijv. rentevaste periode, voorwaarden"
            />
          )}
        </Field>
      </form>
    </Modal>
  )
}
