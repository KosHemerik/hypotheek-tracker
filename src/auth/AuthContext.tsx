import type { SupabaseClient } from '@supabase/supabase-js'
import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  clearRecoveryFromUrl,
  parseRecoveryLink,
  RECOVERY_PATH,
  recoveryLinkErrorMessage,
} from './recovery'
import { getSupabase, isSupabaseConfigured } from './supabaseClient'

export interface AuthUser {
  id: string
  email: string
}

export type AuthState =
  | { status: 'loading' }
  /** Geen Supabase geconfigureerd: lokale opslag, geen login (alleen voor ontwikkelen). */
  | { status: 'local' }
  /** `notice`: melding voor het inlogscherm, bijv. een verlopen resetlink. */
  | { status: 'signed-out'; notice?: string }
  | { status: 'signed-in'; user: AuthUser; client: SupabaseClient }
  /** Via een resetlink ingelogd: eerst een nieuw wachtwoord kiezen, dan pas de app. */
  | { status: 'recovery'; user: AuthUser; client: SupabaseClient }
  | { status: 'error'; message: string }

export interface AuthContextValue {
  state: AuthState
  /** Gooit de originele fout bij mislukken; de UI vertaalt die via `loginErrorMessage`. */
  signIn(email: string, password: string): Promise<void>
  /** Stuurt een resetmail. Lukt ook voor onbekende adressen (Supabase verklapt niet wie bestaat). */
  requestPasswordReset(email: string): Promise<void>
  /** Slaat het nieuwe wachtwoord op en gaat daarna door naar de app. */
  updatePassword(password: string): Promise<void>
  signOut(): Promise<void>
}

type RecoveryOutcome = { recovering: boolean; notice?: string }

let recoveryOutcome: Promise<RecoveryOutcome> | null = null

/**
 * Wisselt een resetlink in de URL in voor een sessie. Eén keer per paginalading: de token
 * werkt maar één keer, en StrictMode draait het effect in development twee keer.
 */
function handleRecoveryLink(client: SupabaseClient): Promise<RecoveryOutcome> {
  recoveryOutcome ??= (async () => {
    const link = parseRecoveryLink(window.location.href)
    if (!link) return { recovering: false }
    clearRecoveryFromUrl()
    if (link.kind === 'error') return { recovering: false, notice: link.message }

    const { data, error } =
      link.kind === 'token-hash'
        ? await client.auth.verifyOtp({ token_hash: link.tokenHash, type: 'recovery' })
        : await client.auth.setSession({
            access_token: link.accessToken,
            refresh_token: link.refreshToken,
          })
    if (error || !data.session) {
      return { recovering: false, notice: recoveryLinkErrorMessage(error?.code) }
    }
    return { recovering: true }
  })()
  return recoveryOutcome
}

function toUser(user: { id: string; email?: string }): AuthUser {
  return { id: user.id, email: user.email ?? '' }
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
      .then(async (client) => {
        // Eerst een eventuele resetlink inwisselen, zodat INITIAL_SESSION die sessie al ziet.
        const { recovering, notice } = await handleRecoveryLink(client)
        if (cancelled) return
        // Wordt direct aangeroepen met INITIAL_SESSION en daarna bij elke wijziging
        // (inloggen, uitloggen, token ververst of verlopen). Geen async werk in deze
        // callback: dat kan supabase-js laten vastlopen.
        const { data } = client.auth.onAuthStateChange((_event, session) => {
          setState((prev) => {
            if (!session)
              return {
                status: 'signed-out',
                notice: prev.status === 'loading' ? notice : undefined,
              }
            // Na een resetlink blijft de app dicht tot er een nieuw wachtwoord is.
            if (prev.status === 'recovery') return prev
            if (prev.status === 'loading' && recovering) {
              return { status: 'recovery', user: toUser(session.user), client }
            }
            // Zelfde gebruiker (bijv. token ververst): state niet vervangen, zodat de
            // data niet opnieuw geladen wordt.
            if (prev.status === 'signed-in' && prev.user.id === session.user.id) return prev
            return { status: 'signed-in', user: toUser(session.user), client }
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

  const requestPasswordReset = useCallback(async (email: string) => {
    const client = await getSupabase()
    const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
      // Werkt lokaal en op Vercel, mits beide adressen bij de Redirect URLs staan.
      redirectTo: `${window.location.origin}${RECOVERY_PATH}`,
    })
    if (error) throw error
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    const client = await getSupabase()
    const { data, error } = await client.auth.updateUser({ password })
    if (error) throw error
    setState({ status: 'signed-in', user: toUser(data.user), client })
  }, [])

  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured) return
    const client = await getSupabase()
    // 'local' = alleen deze browser; ook als de server onbereikbaar is ben je uitgelogd.
    await client.auth.signOut({ scope: 'local' })
    setState({ status: 'signed-out' })
  }, [])

  const value = useMemo(
    () => ({ state, signIn, requestPasswordReset, updatePassword, signOut }),
    [state, signIn, requestPasswordReset, updatePassword, signOut],
  )
  return <AuthContext value={value}>{children}</AuthContext>
}
