import type { FieldErrors, LoanPartField, LoanPartFormValues } from '@/lib/validation'
import { Field, MoneyInput, PercentInput, TextInput } from '../ui/Field'

interface LoanPartFieldsProps {
  values: LoanPartFormValues
  errors?: FieldErrors<LoanPartField>
  onChange: (values: LoanPartFormValues) => void
  /** Startrente tonen (alleen bij een nieuw leningdeel). */
  withRate: boolean
  autoFocus?: boolean
}

/** Velden van één leningdeel; gebruikt in "Hypotheek toevoegen" en "Leningdeel toevoegen/bewerken". */
export function LoanPartFields({
  values,
  errors = {},
  onChange,
  withRate,
  autoFocus,
}: LoanPartFieldsProps) {
  const set = (field: LoanPartField) => (e: { target: { value: string } }) =>
    onChange({ ...values, [field]: e.target.value })
  return (
    <div className="space-y-4">
      <Field label="Naam leningdeel" error={errors.name}>
        {(p) => (
          <TextInput
            {...p}
            value={values.name}
            onChange={set('name')}
            placeholder="Bijv. Deel 1 – annuïtair"
            autoFocus={autoFocus}
          />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Bedrag" error={errors.principal}>
          {(p) => (
            <MoneyInput
              {...p}
              value={values.principal}
              onChange={set('principal')}
              placeholder="250.000,00"
            />
          )}
        </Field>
        {withRate && (
          <Field label="Rente vanaf start" error={errors.initialRate}>
            {(p) => (
              <PercentInput {...p} value={values.initialRate ?? ''} onChange={set('initialRate')} />
            )}
          </Field>
        )}
      </div>
      <Field
        label="Afgesproken aflossing per maand"
        optional
        error={errors.agreedRepayment}
        hint="Leeg of € 0 = aflossingsvrij of niets afgesproken. Wordt vooraf ingevuld bij een nieuwe betaling."
      >
        {(p) => (
          <MoneyInput {...p} value={values.agreedRepayment} onChange={set('agreedRepayment')} />
        )}
      </Field>
    </div>
  )
}
