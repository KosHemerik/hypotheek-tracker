import { useState, type FormEvent } from 'react'
import type { LoanPart, Mortgage, Payment } from '@/domain/types'
import { useData } from '@/hooks/useData'
import { paymentsForPart, totalRepaidUpTo } from '@/lib/calculations'
import { messageOf } from '@/lib/errors'
import { centsToInput } from '@/lib/money'
import {
  validateLoanPart,
  type FieldErrors,
  type LoanPartField,
  type LoanPartFormValues,
} from '@/lib/validation'
import { LoanPartFields } from '../mortgage/LoanPartFields'
import { Button } from '../ui/Button'
import { FormError } from '../ui/Field'
import { Modal } from '../ui/Modal'

interface LoanPartFormProps {
  mortgage: Mortgage
  payments: Payment[]
  /** Leeg = nieuw leningdeel. */
  part?: LoanPart
  onClose: () => void
}

export function LoanPartForm({ mortgage, payments, part, onClose }: LoanPartFormProps) {
  const { createLoanPart, updateLoanPart } = useData()
  const [values, setValues] = useState<LoanPartFormValues>(() =>
    part
      ? {
          name: part.name,
          principal: centsToInput(part.principalCents),
          agreedRepayment: part.agreedRepaymentCents ? centsToInput(part.agreedRepaymentCents) : '',
        }
      : {
          name: `Leningdeel ${mortgage.parts.length + 1}`,
          principal: '',
          agreedRepayment: '',
          initialRate: '',
        },
  )
  const [errors, setErrors] = useState<FieldErrors<LoanPartField>>({})
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const result = validateLoanPart(values, {
      otherNames: mortgage.parts.filter((p) => p.id !== part?.id).map((p) => p.name),
      repaidCents: part ? totalRepaidUpTo(paymentsForPart(payments, part.id)) : 0,
    })
    if (!result.ok) return setErrors(result.errors)
    setErrors({})
    setSaving(true)
    try {
      const input = {
        mortgageId: mortgage.id,
        name: result.value.name,
        principalCents: result.value.principalCents,
        agreedRepaymentCents: result.value.agreedRepaymentCents,
      }
      if (part) await updateLoanPart(part.id, input)
      else
        await createLoanPart({
          ...input,
          initialRateMilliPct: result.value.initialRateMilliPct ?? 0,
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
      title={part ? 'Leningdeel bewerken' : 'Leningdeel toevoegen'}
      description={
        part
          ? mortgage.name
          : `${mortgage.name}. Het nieuwe deel loopt vanaf de startdatum van de hypotheek.`
      }
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Annuleren</Button>
          <Button variant="primary" type="submit" form="loan-part-form" disabled={saving}>
            {part ? 'Opslaan' : 'Toevoegen'}
          </Button>
        </>
      }
    >
      <form id="loan-part-form" onSubmit={submit} noValidate className="space-y-4">
        <FormError message={errors.form} />
        <LoanPartFields
          values={values}
          errors={errors}
          onChange={setValues}
          withRate={!part}
          autoFocus
        />
        {part && (
          <p className="text-xs text-slate-500">
            De rente van dit deel pas je aan via de rentehistorie (rentewijziging toevoegen).
          </p>
        )}
      </form>
    </Modal>
  )
}
