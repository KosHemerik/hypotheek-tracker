import { useMemo, useState, type FormEvent } from 'react'
import type {
  BankTransaction,
  InterestRatePeriod,
  LoanPart,
  Mortgage,
  Payment,
} from '@/domain/types'
import { useData } from '@/hooks/useData'
import { dueInterestForPaymentDate, interestStatus, rateAt, ratesForPart } from '@/lib/calculations'
import { isValidISODate, maxDate, todayISO } from '@/lib/dates'
import { messageOf } from '@/lib/errors'
import { formatCurrency, formatDate, formatRate } from '@/lib/format'
import { centsToInput, parseAmountToCents } from '@/lib/money'
import {
  copyPaymentFormValues,
  maxRepayment,
  newPaymentFormValues,
  paymentToFormValues,
  validatePayment,
  type PaymentErrors,
  type PaymentFormValues,
  type PaymentLineValues,
} from '@/lib/validation'
import { Button } from '../ui/Button'
import { Field, FormError, MoneyInput, TextInput } from '../ui/Field'
import { Modal } from '../ui/Modal'
import { InterestDiff } from './InterestDiff'

interface PaymentFormProps {
  mortgage: Mortgage
  rates: InterestRatePeriod[]
  payments: Payment[]
  payment?: Payment
  /** Nieuwe betaling, vooraf ingevuld op basis van deze betaling. */
  copyFrom?: Payment
  /** Nieuwe betaling vanuit een banktransactie (met vooraf ingevulde waarden). */
  bankTransaction?: BankTransaction
  /** Waarschuwing bij de banktransactie, bijv. dat er nog een oudere openstaat. */
  bankWarning?: string
  initialValues?: PaymentFormValues
  /** Na opslaan, vóór sluiten (bijv. om een banktransactie te koppelen). */
  onSaved?: (payment: Payment | null) => void | Promise<void>
  onClose: () => void
}

const DESCRIPTIONS = ['Maandtermijn', 'Extra aflossing', 'Extra aflossing (boetevrij)', 'Correctie']

const amount = (value: string) => (value.trim() === '' ? 0 : parseAmountToCents(value))

const linkButton =
  'cursor-pointer font-medium text-slate-900 underline underline-offset-2 hover:text-slate-600'

/**
 * Betaling invoeren of bewerken. Per leningdeel rente en aflossing, zoals op het
 * afschrift van de bank. Bij één leningdeel ziet het formulier er "plat" uit.
 */
export function PaymentForm({
  mortgage,
  rates,
  payments,
  payment,
  copyFrom,
  bankTransaction,
  bankWarning,
  initialValues,
  onSaved,
  onClose,
}: PaymentFormProps) {
  const { createPayment, updatePayment } = useData()
  const [values, setValues] = useState<PaymentFormValues>(() =>
    payment
      ? paymentToFormValues(payment, mortgage.parts)
      : initialValues
        ? initialValues
        : copyFrom
          ? copyPaymentFormValues(copyFrom, mortgage.parts)
          : newPaymentFormValues(mortgage.parts, maxDate(todayISO(), mortgage.startDate)),
  )
  const [errors, setErrors] = useState<PaymentErrors>({ lines: {} })
  const [saving, setSaving] = useState(false)
  const editingId = payment?.id ?? null
  const multi = mortgage.parts.length > 1

  const due = useMemo(() => {
    if (!isValidISODate(values.date) || values.date < mortgage.startDate) return null
    const result = dueInterestForPaymentDate(mortgage, rates, payments, values.date, editingId)
    return result.to >= result.from ? result : null
  }, [values.date, mortgage, payments, rates, editingId])

  const setLine = (partId: string, field: 'interest' | 'principal', value: string) =>
    setValues((v) => ({
      ...v,
      lines: v.lines.map((l) => (l.loanPartId === partId ? { ...l, [field]: value } : l)),
    }))

  const takeAllInterest = () =>
    due &&
    setValues((v) => ({
      ...v,
      lines: v.lines.map((l) => {
        const d = due.parts.find((p) => p.loanPartId === l.loanPartId)?.dueCents ?? 0
        return { ...l, interest: d ? centsToInput(d) : '' }
      }),
    }))

  const total = values.lines.reduce(
    (sum, l) => sum + (amount(l.interest) ?? 0) + (amount(l.principal) ?? 0),
    0,
  )

  async function submit(e: FormEvent) {
    e.preventDefault()
    const result = validatePayment(values, mortgage, payments, editingId)
    if (!result.ok) return setErrors(result.errors)
    setErrors({ lines: {} })
    setSaving(true)
    try {
      const input = { mortgageId: mortgage.id, ...result.value }
      if (payment) {
        await updatePayment(payment.id, input)
        await onSaved?.(null)
      } else {
        await onSaved?.(await createPayment(input))
      }
      onClose()
    } catch (error) {
      setErrors({ lines: {}, form: messageOf(error) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      title={
        payment
          ? 'Betaling bewerken'
          : bankTransaction
            ? 'Banktransactie vastleggen'
            : copyFrom
              ? 'Betaling kopiëren'
              : 'Betaling toevoegen'
      }
      description={
        copyFrom
          ? `${mortgage.name} · kopie van ${formatDate(copyFrom.date)}, controleer de datum en bedragen`
          : mortgage.name
      }
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
        {bankTransaction && (
          <BankBanner transaction={bankTransaction} enteredCents={total} warning={bankWarning} />
        )}
        <Field label="Datum" error={errors.date}>
          {(p) => (
            <TextInput
              {...p}
              type="date"
              min={mortgage.startDate}
              value={values.date}
              onChange={(e) => setValues((v) => ({ ...v, date: e.target.value }))}
              autoFocus
            />
          )}
        </Field>

        {due && (
          <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs text-slate-500">
            <span>
              Renteperiode <span className="whitespace-nowrap">{formatDate(due.from)}</span> t/m{' '}
              <span className="whitespace-nowrap">{formatDate(due.to)}</span>
              {multi && (
                <>
                  : verschuldigd{' '}
                  <strong className="font-medium text-slate-700">
                    {formatCurrency(due.dueCents)}
                  </strong>
                </>
              )}
            </span>
            {multi && (
              <button type="button" onClick={takeAllInterest} className={linkButton}>
                Rente van alle delen overnemen
              </button>
            )}
          </p>
        )}

        <div className={multi ? 'space-y-3' : ''}>
          {mortgage.parts.map((part) => (
            <PartLine
              key={part.id}
              part={part}
              line={values.lines.find((l) => l.loanPartId === part.id)!}
              errors={errors.lines[part.id]}
              dueCents={due?.parts.find((p) => p.loanPartId === part.id)?.dueCents ?? null}
              maxCents={maxRepayment(part, payments, editingId)}
              rateMilliPct={
                isValidISODate(values.date)
                  ? (rateAt(ratesForPart(rates, part.id), values.date)?.rateMilliPct ?? null)
                  : null
              }
              framed={multi}
              onChange={(field, value) => setLine(part.id, field, value)}
            />
          ))}
        </div>

        <Field label="Omschrijving" optional>
          {(p) => (
            <>
              <TextInput
                {...p}
                list="payment-descriptions"
                value={values.description}
                onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
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

interface PartLineProps {
  part: LoanPart
  line: PaymentLineValues
  errors?: { interest?: string; principal?: string }
  dueCents: number | null
  maxCents: number
  rateMilliPct: number | null
  /** Bij meerdere delen: in een kader met de naam van het deel. */
  framed: boolean
  onChange: (field: 'interest' | 'principal', value: string) => void
}

/** Rente en aflossing van één leningdeel, met verschuldigde rente en de aflossingsafspraak. */
function PartLine({
  part,
  line,
  errors = {},
  dueCents,
  maxCents,
  rateMilliPct,
  framed,
  onChange,
}: PartLineProps) {
  const interest = amount(line.interest)
  const principal = amount(line.principal)
  const agreed = part.agreedRepaymentCents

  const interestHint =
    dueCents === null ? undefined : (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span>
          Verschuldigd:{' '}
          <strong className="font-medium text-slate-700">{formatCurrency(dueCents)}</strong>
        </span>
        {interest !== null && interest > 0 ? (
          <InterestDiff
            differenceCents={interest - dueCents}
            status={interestStatus(interest - dueCents)}
          />
        ) : (
          dueCents > 0 && (
            <button
              type="button"
              onClick={() => onChange('interest', centsToInput(dueCents))}
              className={linkButton}
            >
              Overnemen
            </button>
          )
        )}
      </span>
    )

  const principalHint = (
    <span className="flex flex-col gap-0.5">
      <span>
        {agreed > 0 ? (
          <>
            Afgesproken: {formatCurrency(agreed)} p/m
            {principal !== null && principal !== agreed && (
              <>
                {' · '}
                <button
                  type="button"
                  onClick={() => onChange('principal', centsToInput(agreed))}
                  className={linkButton}
                >
                  Afspraak invullen
                </button>
              </>
            )}
          </>
        ) : (
          'Aflossingsvrij / niets afgesproken'
        )}
      </span>
      <span>Maximaal {formatCurrency(maxCents)}</span>
    </span>
  )

  const fields = (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Rentebedrag" error={errors.interest} hint={interestHint}>
        {(p) => (
          <MoneyInput
            {...p}
            value={line.interest}
            onChange={(e) => onChange('interest', e.target.value)}
          />
        )}
      </Field>
      <Field label="Aflossingsbedrag" error={errors.principal} hint={principalHint}>
        {(p) => (
          <MoneyInput
            {...p}
            value={line.principal}
            onChange={(e) => onChange('principal', e.target.value)}
          />
        )}
      </Field>
    </div>
  )

  if (!framed) return fields
  return (
    <fieldset className="rounded-lg p-3 ring-1 ring-slate-200 ring-inset sm:p-4">
      <legend className="sr-only">{part.name}</legend>
      <div className="mb-3 flex items-baseline justify-between gap-2" aria-hidden="true">
        <p className="text-sm font-medium text-slate-900">{part.name}</p>
        {rateMilliPct !== null && (
          <p className="tabular text-xs text-slate-500">{formatRate(rateMilliPct)}</p>
        )}
      </div>
      {fields}
    </fieldset>
  )
}

/** Toont de banktransactie en of de ingevulde bedragen optellen tot het bankbedrag. */
function BankBanner({
  transaction,
  enteredCents,
  warning,
}: {
  transaction: BankTransaction
  enteredCents: number
  warning?: string
}) {
  const bankCents = Math.abs(transaction.amountCents)
  const difference = enteredCents - bankCents
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm ring-1 ring-slate-200 ring-inset">
      <p className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-medium text-slate-900">
          {transaction.counterpartyName ?? 'Banktransactie'}
        </span>
        <span className="tabular font-medium">{formatCurrency(bankCents)}</span>
      </p>
      <p className="mt-0.5 text-xs text-slate-500">
        {formatDate(transaction.bookingDate)}
        {transaction.description && ` · ${transaction.description}`}
      </p>
      <p
        className={`mt-1.5 text-xs font-medium ${difference === 0 ? 'text-emerald-700' : 'text-amber-700'}`}
      >
        {difference === 0
          ? '✓ Rente + aflossing is gelijk aan het bedrag van de bank.'
          : `Ingevuld ${formatCurrency(enteredCents)}: ${formatCurrency(Math.abs(difference))} ${difference > 0 ? 'meer' : 'minder'} dan het bedrag van de bank.`}
      </p>
      {warning && (
        <p role="alert" className="mt-1.5 text-xs font-medium text-red-700">
          {warning}
        </p>
      )}
    </div>
  )
}
