import { useEffect, useState } from 'react'
import type { BankPsuType, Entity } from '@/domain/types'
import { useData } from '@/hooks/useData'
import { defaultPsuType } from '@/lib/bank'
import { messageOf } from '@/lib/errors'
import { Button } from '../ui/Button'
import { FormError, SelectInput } from '../ui/Field'
import { Modal } from '../ui/Modal'

/** Kiest bank en particulier/zakelijk en stuurt de gebruiker naar de bank om toestemming te geven. */
export function ConnectBankDialog({
  entity,
  renew = false,
  onClose,
}: {
  entity: Entity
  /** Toestemming verlengen van een bestaande koppeling. */
  renew?: boolean
  onClose: () => void
}) {
  const { startBankLink, listBanks, bankConnection } = useData()
  const [psuType, setPsuType] = useState<BankPsuType>(
    () => bankConnection?.psuType ?? defaultPsuType(entity.name),
  )
  // Bij verlengen: dezelfde bank als nu; anders Rabobank als die er is.
  const [bank, setBank] = useState(bankConnection?.aspspName ?? 'Rabobank')
  const [banks, setBanks] = useState<{ psuType: BankPsuType; names: string[] } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Beschikbare banken (live bij Enable Banking) voor het gekozen type rekening.
  useEffect(() => {
    let cancelled = false
    listBanks(psuType)
      .then((names) => {
        if (cancelled) return
        setLoadError(null)
        setBanks({ psuType, names })
        setBank((current) =>
          names.includes(current)
            ? current
            : (names.find((n) => n.toLowerCase().startsWith('rabobank')) ?? names[0] ?? ''),
        )
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(messageOf(e))
      })
    return () => {
      cancelled = true
    }
  }, [psuType, listBanks])

  const loading = !loadError && banks?.psuType !== psuType
  const options = banks?.psuType === psuType ? banks.names : []

  async function go() {
    setError(null)
    setBusy(true)
    try {
      const url = await startBankLink({
        entityId: entity.id,
        psuType,
        bank,
        redirectUrl: `${window.location.origin}/bank/callback`,
      })
      // Naar de bank; na toestemming komt de gebruiker terug op /bank/callback.
      window.location.assign(url)
    } catch (e) {
      setError(messageOf(e))
      setBusy(false)
    }
  }

  const option = (value: BankPsuType, title: string, text: string) => (
    <label
      className={`flex cursor-pointer gap-3 rounded-lg p-3 ring-1 ring-inset ${psuType === value ? 'bg-slate-50 ring-slate-900' : 'ring-slate-200 hover:bg-slate-50'}`}
    >
      <input
        type="radio"
        name="psu-type"
        value={value}
        checked={psuType === value}
        onChange={() => setPsuType(value)}
        className="mt-0.5 accent-slate-900"
      />
      <span>
        <span className="block text-sm font-medium text-slate-900">{title}</span>
        <span className="block text-xs text-slate-500">{text}</span>
      </span>
    </label>
  )

  return (
    <Modal
      open
      size="sm"
      title={renew ? 'Toestemming verlengen' : 'Bankrekening koppelen'}
      description={entity.name}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Annuleren</Button>
          <Button
            variant="primary"
            onClick={() => void go()}
            disabled={busy || loading || !bank || options.length === 0}
          >
            {busy ? 'Doorsturen…' : bank ? `Doorgaan naar ${bank}` : 'Doorgaan'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <FormError message={error ?? loadError ?? undefined} />
        <fieldset className="space-y-2">
          <legend className="mb-1.5 font-medium text-slate-700">Soort rekening</legend>
          {option('personal', 'Particulier', 'Privérekening.')}
          {option('business', 'Zakelijk', 'Rekening van een BV of onderneming.')}
        </fieldset>
        <div className="space-y-1.5">
          <label htmlFor="bank-choice" className="block font-medium text-slate-700">
            Bank
          </label>
          <SelectInput
            id="bank-choice"
            value={bank}
            onChange={(e) => setBank(e.target.value)}
            disabled={loading || options.length === 0}
          >
            {loading && <option>Banken laden…</option>}
            {options.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </SelectInput>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-slate-600">
          <li>Je logt in bij je bank zelf; je wachtwoord komt nooit in deze app.</li>
          <li>Alleen lezen: saldo en transacties. Er kunnen geen betalingen gedaan worden.</li>
          <li>De toestemming geldt maximaal 180 dagen; daarna verleng je hem met één klik.</li>
          <li>Per entiteit koppel je één rekening.</li>
        </ul>
        <p className="text-xs text-slate-500">
          De koppeling loopt via Enable Banking, een partij met een vergunning voor
          rekeninginformatie. Alleen rekeningen die je in het Enable Banking Control Panel hebt
          gekoppeld zijn bereikbaar.
        </p>
      </div>
    </Modal>
  )
}
