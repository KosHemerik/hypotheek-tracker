import type { SupabaseClient } from '@supabase/supabase-js'
import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getSupabase, isSupabaseConfigured } from './supabaseClient'

export interface AuthUser {
  id: string
  email: string
}

export type AuthState =
  | { status: 'loading' }
  /** Geen Supabase geconfigureerd: lokale opslag, geen login (alleen voor ontwikkelen). */
  | { status: 'local' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; user: AuthUser; client: SupabaseClient }
  | { status: 'error'; message: string }

export interface AuthContextValue {
  state: AuthState
  /** Gooit de originele fout bij mislukken; de UI vertaalt die via `loginErrorMessage`. */
  signIn(email: string, password: string): Promise<void>
  signOut(): Promise<void>
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(
    isSupabaseConfigured ? { status: 'loading' } : { status: 'local' },
  )

  useEffect(() => {
    if (!isSupabaseConfigured) return
    let unsubscribe: (() => void) | undefined
    let cancelled = false

    getSupabase()
      .then((client) => {
        if (cancelled) return
        // Wordt direct aangeroepen met INITIAL_SESSION en daarna bij elke wijziging
        // (inloggen, uitloggen, token ververst of verlopen). Geen async werk in deze
        // callback: dat kan supabase-js laten vastlopen.
        const { data } = client.auth.onAuthStateChange((_event, session) => {
          setState((prev) => {
            if (!session) return { status: 'signed-out' }
            // Zelfde gebruiker (bijv. token ververst): state niet vervangen, zodat de
            // data niet opnieuw geladen wordt.
            if (prev.status === 'signed-in' && prev.user.id === session.user.id) return prev
            return {
              status: 'signed-in',
              user: { id: session.user.id, email: session.user.email ?? '' },
              client,
            }
          })
        })
        unsubscribe = () => data.subscription.unsubscribe()
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', message: 'Supabase kon niet worden geladen.' })
      })

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const client = await getSupabase()
    const { error } = await client.auth.signInWithPassword({ email: email.trim(), password })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured) return
    const client = await getSupabase()
    // 'local' = alleen deze browser; ook als de server onbereikbaar is ben je uitgelogd.
    await client.auth.signOut({ scope: 'local' })
    setState({ status: 'signed-out' })
  }, [])

  const value = useMemo(() => ({ state, signIn, signOut }), [state, signIn, signOut])
  return <AuthContext value={value}>{children}</AuthContext>
}
