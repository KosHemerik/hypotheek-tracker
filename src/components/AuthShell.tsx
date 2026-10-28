import type { ReactNode } from 'react'
import { HouseIcon } from '@/components/ui/icons'

/** Gecentreerd kader met logo en titel voor het inlog- en resetscherm. */
export function AuthShell({
  subtitle,
  footer,
  children,
}: {
  subtitle: string
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-slate-900 text-white">
            <HouseIcon className="size-5" />
          </span>
          <h1 className="mt-4 text-xl font-semibold tracking-tight">Hypotheek Tracker</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        {children}
        {footer && <p className="mt-6 text-center text-xs text-slate-400">{footer}</p>}
      </div>
    </div>
  )
}

export const authCardClass = 'space-y-4 rounded-xl bg-white p-5 ring-1 ring-slate-200 sm:p-6'

/** Neutrale melding (geen fout), bijv. "mail verstuurd". */
export function AuthNotice({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-200 ring-inset"
    >
      {children}
    </div>
  )
}

/** Knop rechts in een wachtwoordveld om het wachtwoord te tonen of te verbergen. */
export function PasswordToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={shown}
      className="absolute inset-y-0 right-0 cursor-pointer rounded-r-lg px-3 text-xs font-medium text-slate-500 hover:text-slate-900"
    >
      {shown ? 'Verbergen' : 'Tonen'}
    </button>
  )
}
