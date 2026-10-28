import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '@/hooks/useAuth'
import { useData } from '@/hooks/useData'
import { usePeriod } from '@/hooks/usePeriod'
import { consentState, formatIban, isOpen, transactionsForMortgage } from '@/lib/bank'
import { messageOf } from '@/lib/errors'
import { formatCurrency, formatDate } from '@/lib/format'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { BuildingIcon } from '../ui/icons'
import { ConfirmDialog } from '../ui/Modal'
import { ConnectBankDialog } from './ConnectBankDialog'

const time = new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit' })

/** Bankrekening van de gekozen entiteit: koppelen, vernieuwen, verlengen, ontkoppelen. */
export function BankAccountCard() {
  const { currentEntity, bankConnection, bankTransactions, mortgages, syncBank, disconnectBank } =
    useData()
  const { state: auth } = useAuth()
  const { search } = usePeriod()
  const [dialog, setDialog] = useState<null | 'connect' | 'renew' | 'disconnect'>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  if (!currentEntity) return null
  const consent = consentState(bankConnection)
  // Per hypotheek: aantal afschrijvingen naar de geldverstrekker dat nog verwerkt moet worden.
  const perMortgage = mortgages
    .filter((m) => !m.archivedAt)
    .map((m) => ({
      mortgage: m,
      open: transactionsForMortgage(bankTransactions, m).filter(isOpen).length,
    }))
  const withoutIban = mortgages.filter((m) => !m.archivedAt && !m.counterpartyIban).length

  async function refresh() {
    if (!currentEntity) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await syncBank(currentEntity.id)
      setMessage({
        tone: 'ok',
        text:
          result.added === 0
            ? 'Bijgewerkt: geen nieuwe transacties.'
            : `${result.added} nieuwe ${result.added === 1 ? 'transactie' : 'transacties'} opgehaald.`,
      })
    } catch (e) {
      setMessage({ tone: 'error', text: messageOf(e) })
    } finally {
      setBusy(false)
    }
  }

  let body
  if (auth.status === 'local') {
    body = (
      <p className="text-sm text-slate-500">
        De bankkoppeling werkt alleen online (ingelogd met Supabase), niet in de lokale modus.
      </p>
    )
  } else if (bankConnection?.status === 'choose_account') {
    body = (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Je hebt toestemming gegeven voor meerdere rekeningen. Kies welke je wilt koppelen.
        </p>
        <Link to={`/bank/callback?kies=${bankConnection.id}`}>
          <Button size="sm" variant="primary">
            Rekening kiezen
          </Button>
        </Link>
      </div>
    )
  } else if (consent === 'none') {
    body = (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-600">
            Koppel de bankrekening van {currentEntity.name} om afschrijvingen naar je
            geldverstrekkers direct als betaling vast te leggen.
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Rabobank of ING; je kiest de bank bij het koppelen.
          </p>
        </div>
        <Button size="sm" variant="primary" onClick={() => setDialog('connect')}>
          Bankrekening koppelen
        </Button>
      </div>
    )
  } else {
    const c = bankConnection!
    body = (
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900">
              {c.aspspName} · <span className="tabular">{formatIban(c.iban)}</span>
            </p>
            <p className="text-xs text-slate-500">
              {c.accountName && `${c.accountName} · `}
              {c.psuType === 'business' ? 'Zakelijk' : 'Particulier'}
              {c.lastSyncedAt &&
                ` · bijgewerkt ${formatDate(c.lastSyncedAt.slice(0, 10))} ${time.format(new Date(c.lastSyncedAt))}`}
            </p>
          </div>
          {c.balanceCents !== null && (
            <div className="text-right">
              <p className="text-xs text-slate-500">Saldo</p>
              <p className="tabular font-semibold">{formatCurrency(c.balanceCents)}</p>
            </div>
          )}
        </div>

        {consent === 'expired' ? (
          <p
            role="alert"
            className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200 ring-inset"
          >
            {c.lastError ?? 'De toestemming van de bank is verlopen.'} Opgehaalde transacties
            blijven bewaard.
          </p>
        ) : consent === 'expiring' && c.validUntil ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200 ring-inset">
            De toestemming verloopt op {formatDate(c.validUntil.slice(0, 10))}. Verleng hem om
            transacties te blijven ophalen.
          </p>
        ) : null}

        {perMortgage.length > 0 && (
          <ul className="space-y-1 text-sm">
            {perMortgage.map(({ mortgage, open }) => (
              <li key={mortgage.id} className="flex items-center justify-between gap-3">
                <Link
                  to={`/hypotheek/${mortgage.id}${search}`}
                  className="truncate text-slate-700 hover:text-slate-900 hover:underline"
                >
                  {mortgage.name}
                </Link>
                <span
                  className={`shrink-0 text-xs ${open > 0 ? 'font-medium text-slate-900' : 'text-slate-400'}`}
                >
                  {!mortgage.counterpartyIban
                    ? 'geen rekeningnummer'
                    : open > 0
                      ? `${open} te verwerken`
                      : 'bijgewerkt'}
                </span>
              </li>
            ))}
          </ul>
        )}
        {withoutIban > 0 && (
          <p className="text-xs text-slate-500">
            Vul bij een hypotheek het rekeningnummer van de geldverstrekker in (Hypotheek bewerken)
            om de bijbehorende afschrijvingen te zien.
          </p>
        )}

        {message && (
          <p className={`text-sm ${message.tone === 'ok' ? 'text-emerald-700' : 'text-red-700'}`}>
            {message.text}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {consent === 'expired' ? (
            <Button size="sm" variant="primary" onClick={() => setDialog('renew')}>
              Opnieuw koppelen
            </Button>
          ) : (
            <Button size="sm" variant="primary" onClick={() => void refresh()} disabled={busy}>
              {busy ? 'Ophalen…' : 'Vernieuwen'}
            </Button>
          )}
          {consent !== 'expired' && (
            <Button size="sm" variant="ghost" onClick={() => setDialog('renew')}>
              Toestemming verlengen
              {c.validUntil && consent === 'ok' && (
                <span className="font-normal text-slate-400">
                  {' '}
                  (tot {formatDate(c.validUntil.slice(0, 10))})
                </span>
              )}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDialog('disconnect')}
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            Ontkoppelen
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Card className="px-4 py-3.5 sm:px-5">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
        <BuildingIcon className="size-4 text-slate-500" />
        Bankrekening
      </div>
      {body}

      {(dialog === 'connect' || dialog === 'renew') && (
        <ConnectBankDialog
          entity={currentEntity}
          renew={dialog === 'renew'}
          onClose={() => setDialog(null)}
        />
      )}
      <ConfirmDialog
        open={dialog === 'disconnect'}
        title="Bankrekening ontkoppelen?"
        message="De toestemming bij de bank wordt ingetrokken. Opgehaalde transacties en vastgelegde betalingen blijven bewaard."
        confirmLabel="Ontkoppelen"
        onConfirm={() => disconnectBank(currentEntity.id)}
        onClose={() => setDialog(null)}
      />
    </Card>
  )
}
