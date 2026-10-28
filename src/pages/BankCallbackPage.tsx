import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Card, EmptyState } from '@/components/ui/Card'
import type { BankAccountOption } from '@/domain/types'
import { useData } from '@/hooks/useData'
import { formatIban } from '@/lib/bank'
import { messageOf } from '@/lib/errors'

/**
 * Terugkeer van de bank na het geven (of weigeren) van toestemming. Rondt de koppeling af
 * en laat zo nodig kiezen welke rekening bij de entiteit hoort.
 */
export function BankCallbackPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { completeBankLink, selectBankAccount, selectEntity, bankConnections } = useData()
  // Beginstatus direct uit de URL bepalen (zonder effect).
  const [initial] = useState(() => {
    const pending = params.get('kies')
    if (pending) {
      // Vanaf de bankkaart: alleen nog een rekening kiezen.
      const connection = bankConnections.find((c) => c.id === pending)
      return connection?.availableAccounts.length
        ? {
            phase: 'choose' as const,
            message: null,
            choice: { connectionId: connection.id, accounts: connection.availableAccounts },
          }
        : {
            phase: 'error' as const,
            message: 'Er is geen rekening om te kiezen. Koppel de rekening opnieuw.',
            choice: null,
          }
    }
    const error = params.get('error')
    if (error || !params.get('code') || !params.get('state')) {
      return {
        phase: 'error' as const,
        message:
          error === 'access_denied'
            ? 'Je hebt de toestemming bij de bank geannuleerd. Er is niets gekoppeld.'
            : 'De bank heeft geen toestemming teruggegeven. Probeer het opnieuw.',
        choice: null,
      }
    }
    return { phase: 'working' as const, message: null, choice: null }
  })
  const [phase, setPhase] = useState<'working' | 'choose' | 'done' | 'error'>(initial.phase)
  const [message, setMessage] = useState<string | null>(initial.message)
  const [choice, setChoice] = useState<{
    connectionId: string
    accounts: BankAccountOption[]
  } | null>(initial.choice)
  const [busy, setBusy] = useState(false)
  const started = useRef(false)

  const finish = (entityId: string, added?: number) => {
    selectEntity(entityId)
    setPhase('done')
    setMessage(
      added === undefined
        ? 'De rekening is gekoppeld.'
        : `De rekening is gekoppeld en ${added} ${added === 1 ? 'transactie is' : 'transacties zijn'} opgehaald.`,
    )
  }

  useEffect(() => {
    if (started.current || initial.phase !== 'working') return
    started.current = true
    const code = params.get('code')!
    const state = params.get('state')!
    // Code niet in de adresbalk laten staan.
    window.history.replaceState(null, '', '/bank/callback')
    completeBankLink({ code, state })
      .then((result) => {
        if (result.status === 'choose_account' && result.accounts) {
          const connection = bankConnections.find((c) => c.entityId === result.entityId)
          setChoice({ connectionId: connection?.id ?? '', accounts: result.accounts })
          selectEntity(result.entityId)
          setPhase('choose')
        } else finish(result.entityId, result.added)
      })
      .catch((e: unknown) => {
        setPhase('error')
        setMessage(messageOf(e))
      })
    // Alleen bij binnenkomst uitvoeren.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Na "complete" kent de data het connection-id pas na herladen.
  const connectionId =
    choice?.connectionId || bankConnections.find((c) => c.status === 'choose_account')?.id || ''

  async function choose(uid: string) {
    setBusy(true)
    try {
      const result = await selectBankAccount(connectionId, uid)
      finish(result.entityId, result.added)
    } catch (e) {
      setPhase('error')
      setMessage(messageOf(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <Card>
        {phase === 'working' && (
          <EmptyState title="Koppeling afronden…" description="Rekening en transacties ophalen." />
        )}
        {phase === 'choose' && choice && (
          <div className="p-5">
            <h1 className="font-semibold text-slate-900">Kies de rekening</h1>
            <p className="mt-1 text-sm text-slate-500">
              Per entiteit koppel je één rekening. Welke hoort hierbij?
            </p>
            <ul className="mt-4 space-y-2">
              {choice.accounts.map((a) => (
                <li key={a.uid}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void choose(a.uid)}
                    className="w-full cursor-pointer rounded-lg px-4 py-3 text-left ring-1 ring-slate-200 ring-inset hover:bg-slate-50 disabled:opacity-50"
                  >
                    <span className="tabular block text-sm font-medium">{formatIban(a.iban)}</span>
                    {a.name && <span className="block text-xs text-slate-500">{a.name}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {(phase === 'done' || phase === 'error') && (
          <EmptyState
            title={phase === 'done' ? 'Bankrekening gekoppeld' : 'Koppelen is niet gelukt'}
            description={message ?? undefined}
            action={
              phase === 'done' ? (
                <Button variant="primary" onClick={() => navigate('/')}>
                  Naar het overzicht
                </Button>
              ) : (
                <Link to="/" className="text-sm font-medium text-slate-900 underline">
                  Terug naar het overzicht
                </Link>
              )
            }
          />
        )}
      </Card>
    </div>
  )
}
