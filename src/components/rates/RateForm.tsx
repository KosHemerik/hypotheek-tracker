import { useState, type FormEvent } from 'react'
import { messageOf } from '@/lib/errors'
import type { InterestRatePeriod, Mortgage } from '@/domain/types'
import { useData } from '@/hooks/useData'
import { maxDate, todayISO } from '@/lib/dates'
import { formatDate } from '@/lib/format'
import { milliToInput } from '@/lib/money'
import {
  validateRate,
  type FieldErrors,
  type RateField,
  type RateFormValues,
} from '@/lib/validation'
import { Button } from '../ui/Button'
import { Field, FormError, PercentInput, TextInput } from '../ui/Field'
import { Modal } from '../ui/Modal'

interface RateFormProps {
  mortgage: Mortgage
  rates: InterestRatePeriod[]
  rate?: InterestRatePeriod
  onClose: () => void
}

export function RateForm({ mortgage, rates, rate, onClose }: RateFormProps) {
  const { createRate, updateRate } = useData()
  const [values, setValues] = useState<RateFormValues>(() =>
    rate
      ? { rate: milliToInput(rate.rateMilliPct), effectiveDate: rate.effectiveDate }
      : { rate: '', effectiveDate: maxDate(todayISO(), mortgage.startDate) },
  )
  const [errors, setErrors] = useState<FieldErrors<RateField>>({})
  const [saving, setSaving] = useState(false)
  const isStartRate = rate?.effectiveDate === mortgage.startDate

  const set = (field: RateField) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [field]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    const result = validateRate(values, mortgage, rates, rate?.id ?? null)
    if (!result.ok) return setErrors(result.errors)
    setErrors({})
    setSaving(true)
    try {
      const input = { mortgageId: mortgage.id, ...result.value }
      if (rate) await updateRate(rate.id, input)
      else await createRate(input)
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
      title={rate ? 'Rentepercentage bewerken' : 'Rentewijziging toevoegen'}
      description={
        rate
          ? undefined
          : 'Het nieuwe percentage geldt vanaf de ingangsdatum tot een volgende wijziging.'
      }
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Annuleren</Button>
          <Button variant="primary" type="submit" form="rate-form" disabled={saving}>
            {rate ? 'Opslaan' : 'Toevoegen'}
          </Button>
        </>
      }
    >
      <form id="rate-form" onSubmit={submit} noValidate className="space-y-4">
        <FormError message={errors.form} />
        <Field label="Rentepercentage" error={errors.rate} hint="Maximaal 3 decimalen, bijv. 3,725">
          {(p) => <PercentInput {...p} value={values.rate} onChange={set('rate')} autoFocus />}
        </Field>
        <Field
          label="Ingangsdatum"
          error={errors.effectiveDate}
          hint={
            isStartRate ? `Vast op de startdatum (${formatDate(mortgage.startDate)}).` : undefined
          }
        >
          {(p) => (
            <TextInput
              {...p}
              type="date"
              min={mortgage.startDate}
              value={values.effectiveDate}
              onChange={set('effectiveDate')}
              disabled={isStartRate}
            />
          )}
        </Field>
      </form>
    </Modal>
  )
}
