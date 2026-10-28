import { useState, type FormEvent } from 'react'
import { messageOf } from '@/lib/errors'
import type { InterestRatePeriod, Mortgage } from '@/domain/types'
import { useData } from '@/hooks/useData'
import { ratesForPart } from '@/lib/calculations'
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
import { Field, FormError, PercentInput, SelectInput, TextInput } from '../ui/Field'
import { Modal } from '../ui/Modal'

interface RateFormProps {
  mortgage: Mortgage
  /** Alle rentepercentages van de hypotheek (alle delen). */
  rates: InterestRatePeriod[]
  rate?: InterestRatePeriod
  /** Voorgeselecteerd leningdeel bij een nieuwe rentewijziging. */
  loanPartId?: string
  onClose: () => void
}

export function RateForm({ mortgage, rates, rate, loanPartId, onClose }: RateFormProps) {
  const { createRate, updateRate } = useData()
  const [partId, setPartId] = useState(
    rate?.loanPartId ?? loanPartId ?? mortgage.parts[0]?.id ?? '',
  )
  const partRates = ratesForPart(rates, partId)
  const partName = mortgage.parts.find((p) => p.id === partId)?.name
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
    const result = validateRate(values, mortgage, partRates, rate?.id ?? null)
    if (!result.ok) return setErrors(result.errors)
    setErrors({})
    setSaving(true)
    try {
      const input = { mortgageId: mortgage.id, loanPartId: partId, ...result.value }
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
          ? mortgage.parts.length > 1
            ? partName
            : undefined
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
        {!rate && mortgage.parts.length > 1 && (
          <Field label="Leningdeel">
            {(p) => (
              <SelectInput {...p} value={partId} onChange={(e) => setPartId(e.target.value)}>
                {mortgage.parts.map((part) => (
                  <option key={part.id} value={part.id}>
                    {part.name}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
        )}
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
