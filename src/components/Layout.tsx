import { Link, Outlet, ScrollRestoration } from 'react-router'
import { useAuth } from '@/hooks/useAuth'
import { useData } from '@/hooks/useData'
import { EntitySwitcher } from './entities/EntitySwitcher'
import { Button } from './ui/Button'
import { HouseIcon, LogoutIcon } from './ui/icons'

export function Layout() {
  const { status, error } = useData()
  const { state: auth, signOut } = useAuth()
  return (
    <div className="min-h-dvh">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Link
              to="/"
              className="flex shrink-0 items-center gap-2 font-semibold text-slate-900"
              aria-label="Hypotheek Tracker, naar overzicht"
            >
              <span className="flex size-7 items-center justify-center rounded-lg bg-slate-900 text-white">
                <HouseIcon className="size-4" />
              </span>
              <span className="hidden md:inline">Hypotheek Tracker</span>
            </Link>
            {status === 'ready' && (
              <>
                <span aria-hidden="true" className="hidden h-5 w-px bg-slate-200 md:block" />
                <EntitySwitcher />
              </>
            )}
          </div>
          {auth.status === 'signed-in' ? (
            <div className="flex shrink-0 items-center gap-2">
              <span
                className="hidden truncate text-sm text-slate-500 lg:inline"
                title={auth.user.email}
              >
                {auth.user.email}
              </span>
              <Button
                size="sm"
                variant="ghost"
                icon={<LogoutIcon />}
                onClick={() => void signOut()}
                aria-label="Uitloggen"
              >
                <span className="hidden sm:inline">Uitloggen</span>
              </Button>
            </div>
          ) : auth.status === 'local' ? (
            <span
              className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200 ring-inset"
              title="Supabase is niet geconfigureerd: data staat alleen in deze browser en er is geen login."
            >
              Lokale modus
            </span>
          ) : null}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {status === 'loading' ? (
          <p className="py-20 text-center text-sm text-slate-500">Gegevens laden…</p>
        ) : status === 'error' ? (
          <div
            role="alert"
            className="rounded-xl bg-red-50 p-4 text-sm text-red-700 ring-1 ring-red-200"
          >
            De gegevens konden niet worden geladen: {error}
          </div>
        ) : (
          <Outlet />
        )}
      </main>
      <ScrollRestoration />
    </div>
  )
}
