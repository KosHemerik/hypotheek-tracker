import { useState, type FormEvent } from 'react'
import { messageOf } from '@/lib/errors'
import type { Mortgage } from '@/domain/types'
import { useData, useMortgage } from '@/hooks/useData'
import { todayISO } from '@/lib/dates'
import { formatIban } from '@/lib/bank'
import { formatCurrency } from '@/lib/format'
import { parseAmountToCents } from '@/lib/money'
import {
  validateMortgage,
  validateNewLoanParts,
  type FieldErrors,
  type LoanPartField,
  type LoanPartFormValues,
  type MortgageField,
  type MortgageFormValues,
} from '@/lib/validation'
import { Button } from '../ui/Button'
import { Field, FormError, SelectInput, TextArea, TextInput } from '../ui/Field'
import { PlusIcon, TrashIcon } from '../ui/icons'
import { Modal } from '../ui/Modal'
import { LoanPartFields } from './LoanPartFields'

const emptyPart = (n: number): LoanPartFormValues => ({
  name: `Leningdeel ${n}`,
  principal: '',
  agreedRepayment: '',
  initialRate: '',
})

interface MortgageFormProps {
  /** Leeg = nieuwe hypotheek. */
  mortgage?: Mortgage
  onClose: () => void
  onSaved?: (mortgage: Mortgage | null) => void
}

export function MortgageForm({ mortgage, onClose, onSaved }: MortgageFormProps) {
  const { createMortgage, updateMortgage, entities, currentEntity, selectEntity } = useData()
  const { payments, rates } = useMortgage(mortgage?.id)
  const isEdit = Boolean(mortgage)

  const [values, setValues] = useState<MortgageFormValues>(() =>
    mortgage
      ? {
          entityId: mortgage.entityId,
          name: mortgage.name,
          mortgageNumber: mortgage.mortgageNumber,
          startDate: mortgage.startDate,
          endDate: mortgage.endDate ?? '',
          notes: mortgage.notes ?? '',
          counterpartyIban: formatIban(mortgage.counterpartyIban),
          interestMethod: mortgage.interestMethod,
          dueDay: mortgage.dueDay ? String(mortgage.dueDay) : '',
        }
      : {
          entityId: currentEntity?.id ?? '',
          name: '',
          mortgageNumber: '',
          startDate: todayISO(),
          endDate: '',
          notes: '',
          counterpartyIban: '',
          interestMethod: 'actual',
          dueDay: '',
        },
  )
  const [parts, setParts] = useState<LoanPartFormValues[]>([emptyPart(1)])
  const [partErrors, setPartErrors] = useState<FieldErrors<LoanPartField>[]>([])
  const [errors, setErrors] = useState<FieldErrors<MortgageField>>({})
  const [saving, setSaving] = useState(false)

  const totalCents = parts.reduce(
    (sum, p) => sum + Math.max(0, parseAmountToCents(p.principal || '0') ?? 0),
    0,
  )

  const set = (field: MortgageField) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [field]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    const result = validateMortgage(values, { payments, rates })
    const partsResult = isEdit ? null : validateNewLoanParts(parts)
    setErrors(result.ok ? {} : result.errors)
    setPartErrors(partsResult && !partsResult.ok ? partsResult.errors : [])
    if (partsResult && !partsResult.ok && partsResult.form) {
      setErrors((e) => ({ ...e, form: partsResult.form }))
    }
    if (!result.ok || (partsResult && !partsResult.ok)) return
    setSaving(true)
    try {
      const input = result.value
      if (mortgage) {
        await updateMortgage(mortgage.id, input)
        // Verplaatst naar een andere entiteit: daar gaan we mee naartoe.
        if (input.entityId !== mortgage.entityId) selectEntity(input.entityId)
        onSaved?.(null)
      } else {
        const created = await createMortgage({
          ...input,
          parts: partsResult!.ok
            ? partsResult!.value.map((p) => ({
                name: p.name,
                principalCents: p.principalCents,
                agreedRepaymentCents: p.agreedRepaymentCents,
                initialRateMilliPct: p.initialRateMilliPct,
              }))
            : [],
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
          : 'Heeft een deel van de hypotheek een andere rente? Voeg dan meerdere leningdelen toe.'
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
        <Field
          label="Entiteit"
          error={errors.entityId}
          hint={
            isEdit && values.entityId !== mortgage?.entityId
              ? 'De hypotheek verhuist met alle betalingen, rente en documenten naar deze entiteit.'
              : undefined
          }
        >
          {(p) => (
            <SelectInput {...p} value={values.entityId} onChange={set('entityId')}>
              {!values.entityId && <option value="">Kies een entiteit…</option>}
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        <Field label="Naam" error={errors.name}>
          {(p) => (
            <TextInput
              {...p}
              value={values.name}
              onChange={set('name')}
              placeholder="Bijv. Woning Amersfoort"
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
          <Field
            label="Startdatum"
            error={errors.startDate}
            hint={
              isEdit
                ? 'Het eerste rentepercentage van elk leningdeel schuift mee met de startdatum.'
                : undefined
            }
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
        {!isEdit && (
          <fieldset className="space-y-3">
            <legend className="mb-1 flex w-full items-baseline justify-between text-sm font-medium text-slate-700">
              Leningdelen
              <span className="tabular text-xs font-normal text-slate-500">
                Totaal {formatCurrency(totalCents)}
              </span>
            </legend>
            {parts.map((part, i) => (
              <div key={i} className="rounded-lg p-3 ring-1 ring-slate-200 ring-inset sm:p-4">
                {parts.length > 1 && (
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                      Deel {i + 1}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setParts((list) => list.filter((_, j) => j !== i))
                        setPartErrors((list) => list.filter((_, j) => j !== i))
                      }}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-red-50 hover:text-red-600"
                    >
                      <TrashIcon className="size-3.5" /> Verwijderen
                    </button>
                  </div>
                )}
                <LoanPartFields
                  values={part}
                  errors={partErrors[i]}
                  withRate
                  onChange={(next) => setParts((list) => list.map((p, j) => (j === i ? next : p)))}
                />
              </div>
            ))}
            <Button
              size="sm"
              icon={<PlusIcon />}
              onClick={() => setParts((list) => [...list, emptyPart(list.length + 1)])}
            >
              Leningdeel toevoegen
            </Button>
          </fieldset>
        )}
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium text-slate-700">Renteberekening</legend>
          {(
            [
              [
                'actual',
                'Werkelijke dagen',
                'Rente per dag naar rato van de maand, vanaf de vorige betaling tot de betaaldag.',
              ],
              [
                'thirty_360',
                '30/360 met vervaldag',
                'Elke maand telt als 30 dagen; de renteperiode loopt tot en met de vervaldag. Gebruikelijk bij hypotheekverstrekkers (bijv. Build Finance).',
              ],
            ] as const
          ).map(([method, title, text]) => (
            <label
              key={method}
              className={`flex cursor-pointer gap-3 rounded-lg p-3 ring-1 ring-inset ${values.interestMethod === method ? 'bg-slate-50 ring-slate-900' : 'ring-slate-200 hover:bg-slate-50'}`}
            >
              <input
                type="radio"
                name="interest-method"
                value={method}
                checked={values.interestMethod === method}
                onChange={() => setValues((v) => ({ ...v, interestMethod: method }))}
                className="mt-0.5 accent-slate-900"
              />
              <span>
                <span className="block text-sm font-medium text-slate-900">{title}</span>
                <span className="block text-xs text-slate-500">{text}</span>
              </span>
            </label>
          ))}
          {values.interestMethod === 'thirty_360' && (
            <Field
              label="Vervaldag (dag van de maand)"
              error={errors.dueDay}
              hint="De dag waarop de renteperiode eindigt, bijv. 25. Incasso's die door een weekend later vallen, tellen voor die periode."
            >
              {(p) => (
                <div className="w-24">
                  <TextInput
                    {...p}
                    inputMode="numeric"
                    value={values.dueDay}
                    onChange={set('dueDay')}
                    placeholder="25"
                  />
                </div>
              )}
            </Field>
          )}
        </fieldset>
        <Field
          label="Rekeningnummer geldverstrekker (IBAN)"
          optional
          error={errors.counterpartyIban}
          hint="Afschrijvingen naar dit rekeningnummer verschijnen bij deze hypotheek om goed te keuren."
        >
          {(p) => (
            <TextInput
              {...p}
              value={values.counterpartyIban}
              onChange={set('counterpartyIban')}
              placeholder="NL00 BANK 0000 0000 00"
              autoCapitalize="characters"
              spellCheck={false}
              className="tabular"
            />
          )}
        </Field>
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
