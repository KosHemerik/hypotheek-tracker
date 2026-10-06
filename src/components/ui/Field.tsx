import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'

interface FieldProps {
  label: string
  error?: string
  hint?: ReactNode
  optional?: boolean
  children: (props: {
    id: string
    'aria-invalid': boolean
    'aria-describedby'?: string
  }) => ReactNode
}

export function Field({ label, error, hint, optional, children }: FieldProps) {
  const id = useId()
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
        {optional && <span className="ml-1 font-normal text-slate-400">(optioneel)</span>}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

const inputClass =
  'block w-full rounded-lg border-0 bg-white px-3 py-2 text-base text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900 focus:outline-none aria-invalid:ring-red-400 sm:text-sm'

export function TextInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${inputClass} ${className}`} {...props} />
}

export function TextArea({
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} className={`${inputClass} ${className}`} {...props} />
}

/** Bedragveld met €-prefix; accepteert Nederlandse notatie (parse in `lib/money.ts`). */
export function MoneyInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">
        €
      </span>
      <TextInput
        inputMode="decimal"
        autoComplete="off"
        placeholder="0,00"
        className="tabular pl-7"
        {...props}
      />
    </div>
  )
}

export function PercentInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <TextInput
        inputMode="decimal"
        autoComplete="off"
        placeholder="3,85"
        className="tabular pr-8"
        {...props}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-400">
        %
      </span>
    </div>
  )
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <div
      role="alert"
      className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200 ring-inset"
    >
      {message}
    </div>
  )
}
