import { useMemo, useState, type FormEvent } from 'react'
import { messageOf } from '@/lib/errors'
import type { InterestRatePeriod, Mortgage, Payment } from '@/domain/types'
import { useData } from '@/hooks/useData'
import { outstandingBefore, rateAt, theoreticalMonthlyInterest } from '@/lib/calculations'
import { isValidISODate, maxDate, todayISO } from '@/lib/dates'
import { formatCurrency, formatRate } from '@/lib/format'
import { centsToInput, parseAmountToCents } from '@/lib/money'
import {
  maxRepayment,
  validatePayment,
  type FieldErrors,
  type PaymentField,
  type PaymentFormValues,
} from '@/lib/validation'
import { Button } from '../ui/Button'
import { Field, FormError, MoneyInput, TextInput } from '../ui/Field'
import { Modal } from '../ui/Modal'

interface PaymentFormProps {
  mortgage: Mortgage
  rates: InterestRatePeriod[]
  payments: Payment[]
  payment?: Payment
  onClose: () => void
}

const DESCRIPTIONS = ['Maandtermijn', 'Extra aflossing', 'Extra aflossing (boetevrij)', 'Correctie']

export function PaymentForm({ mortgage, rates, payments, payment, onClose }: PaymentFormProps) {
  const { createPayment, updatePayment } = useData()
  const [values, setValues] = useState<PaymentFormValues>(() =>
    payment
      ? {
          date: payment.date,
          interest: centsToInput(payment.interestCents),
          principal: centsToInput(payment.principalCents),
          description: payment.description ?? '',
        }
      : {
          date: maxDate(todayISO(), mortgage.startDate),
          interest: '',
          principal: '',
          description: 'Maandtermijn',
        },
  )
  const [errors, setErrors] = useState<FieldErrors<PaymentField>>({})
  const [saving, setSaving] = useState(false)
  const editingId = payment?.id ?? null

  const set = (field: PaymentField) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [field]: e.target.value }))

  const hint = useMemo(() => {
    if (!isValidISODate(values.date) || values.date < mortgage.startDate) return null
    const others = payments.filter((p) => p.id !== editingId)
    const rate = rateAt(rates, values.date)
    const outstanding = outstandingBefore(mortgage.principalCents, others, values.date)
    return {
      rate,
      theoretical: rate ? theoreticalMonthlyInterest(outstanding, rate.rateMilliPct) : null,
      max: maxRepayment(mortgage, payments, editingId),
    }
  }, [values.date, mortgage, payments, rates, editingId])

  const total =
    (parseAmountToCents(values.interest || '0') ?? 0) +
    (parseAmountToCents(values.principal || '0') ?? 0)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const result = validatePayment(values, mortgage, payments, editingId)
    if (!result.ok) return setErrors(result.errors)
    setErrors({})
    setSaving(true)
    try {
      const input = { mortgageId: mortgage.id, ...result.value }
      if (payment) await updatePayment(payment.id, input)
      else await createPayment(input)
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
      title={payment ? 'Betaling bewerken' : 'Betaling toevoegen'}
      description={mortgage.name}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Annuleren</Button>
          <Button variant="primary" type="submit" form="payment-form" disabled={saving}>
            {payment ? 'Opslaan' : 'Toevoegen'}
          </Button>
        </>
      }
    >
      <form id="payment-form" onSubmit={submit} noValidate className="space-y-4">
        <FormError message={errors.form} />
        <Field label="Datum" error={errors.date}>
          {(p) => (
            <TextInput
              {...p}
              type="date"
              min={mortgage.startDate}
              value={values.date}
              onChange={set('date')}
              autoFocus
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Rentebedrag"
            error={errors.interest}
            hint={
              hint?.theoretical != null && hint.rate
                ? `Indicatie: ${formatCurrency(hint.theoretical)} (${formatRate(hint.rate.rateMilliPct)} / 12)`
                : undefined
            }
          >
            {(p) => <MoneyInput {...p} value={values.interest} onChange={set('interest')} />}
          </Field>
          <Field
            label="Aflossingsbedrag"
            error={errors.principal}
            hint={hint ? `Maximaal ${formatCurrency(hint.max)}` : undefined}
          >
            {(p) => <MoneyInput {...p} value={values.principal} onChange={set('principal')} />}
          </Field>
        </div>
        <Field label="Omschrijving" optional>
          {(p) => (
            <>
              <TextInput
                {...p}
                list="payment-descriptions"
                value={values.description}
                onChange={set('description')}
              />
              <datalist id="payment-descriptions">
                {DESCRIPTIONS.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <span className="text-slate-500">Totaal betaald</span>
          <span className="tabular font-medium">{formatCurrency(total)}</span>
        </div>
      </form>
    </Modal>
  )
}
