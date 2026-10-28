import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useData } from '@/hooks/useData'
import { useSwitchEntity } from '@/hooks/useSwitchEntity'
import { BuildingIcon, CheckIcon, ChevronDownIcon, PlusIcon, SettingsIcon } from '../ui/icons'
import { EntityManager } from './EntityManager'

/**
 * Keuzemenu in de bovenbalk. De gekozen entiteit filtert de hele app; bij wisselen ga je
 * naar het overzicht van die entiteit (een open hypotheek hoort bij de vorige).
 */
export function EntitySwitcher() {
  const { entities, currentEntity, allMortgages } = useData()
  const switchEntity = useSwitchEntity()
  const [open, setOpen] = useState(false)
  const [manager, setManager] = useState<null | { focusNew: boolean }>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  // Sluiten bij klik buiten het menu of Escape.
  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Pijltjestoetsen binnen het menu.
  function onMenuKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]')]
    const index = items.indexOf(document.activeElement as HTMLButtonElement)
    const next = e.key === 'ArrowDown' ? index + 1 : index - 1
    items[(next + items.length) % items.length]?.focus()
  }

  const choose = (id: string) => {
    setOpen(false)
    if (id !== currentEntity?.id) {
      void switchEntity(id)
    }
  }

  const count = (id: string) => allMortgages.filter((m) => m.entityId === id).length

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault()
            setOpen(true)
            requestAnimationFrame(() =>
              document
                .getElementById(menuId)
                ?.querySelector<HTMLButtonElement>('[aria-checked="true"], [role^="menuitem"]')
                ?.focus(),
            )
          }
        }}
        className="flex h-9 max-w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg px-2.5 text-sm font-medium text-slate-900 ring-1 ring-slate-200 ring-inset hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-slate-900"
      >
        <BuildingIcon className="size-4 shrink-0 text-slate-500" />
        <span className="sr-only">Entiteit: </span>
        <span className="truncate">{currentEntity?.name ?? 'Kies een entiteit'}</span>
        <ChevronDownIcon
          className={`size-4 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Entiteit kiezen"
          onKeyDown={onMenuKeyDown}
          className="absolute top-full left-0 z-30 mt-1.5 w-72 max-w-[calc(100vw-2rem)] rounded-xl bg-white p-1.5 shadow-lg ring-1 ring-slate-200"
        >
          <p className="px-2.5 pt-1 pb-1.5 text-xs font-medium text-slate-500">Entiteit</p>
          {entities.map((e) => {
            const active = e.id === currentEntity?.id
            const n = count(e.id)
            return (
              <button
                key={e.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => choose(e.id)}
                className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none ${active ? 'font-medium text-slate-900' : 'text-slate-700'}`}
              >
                <span className="flex size-4 shrink-0 items-center justify-center">
                  {active && <CheckIcon className="size-4" />}
                </span>
                <span className="min-w-0 flex-1 truncate">{e.name}</span>
                <span className="tabular shrink-0 text-xs text-slate-400">
                  {n === 0 ? '—' : `${n} ${n === 1 ? 'lening' : 'leningen'}`}
                </span>
              </button>
            )
          })}
          <div className="my-1.5 border-t border-slate-100" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              setManager({ focusNew: true })
            }}
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none"
          >
            <PlusIcon className="size-4 shrink-0" />
            Entiteit toevoegen
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              setManager({ focusNew: false })
            }}
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none"
          >
            <SettingsIcon className="size-4 shrink-0" />
            Entiteiten beheren
          </button>
        </div>
      )}

      {manager && <EntityManager focusNew={manager.focusNew} onClose={() => setManager(null)} />}
    </div>
  )
}
