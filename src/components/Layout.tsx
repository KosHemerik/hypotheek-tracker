import { Link, Outlet, ScrollRestoration } from 'react-router'
import { useData } from '@/hooks/useData'
import { HouseIcon } from './ui/icons'

export function Layout() {
  const { status, error } = useData()
  return (
    <div className="min-h-dvh">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold text-slate-900">
            <span className="flex size-7 items-center justify-center rounded-lg bg-slate-900 text-white">
              <HouseIcon className="size-4" />
            </span>
            Hypotheek Tracker
          </Link>
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
