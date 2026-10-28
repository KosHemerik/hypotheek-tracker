/** Pad waar de resetlink naartoe gaat. Moet in Supabase bij de Redirect URLs staan (zie README). */
export const RECOVERY_PATH = '/wachtwoord-herstellen'

export type RecoveryLink =
  /** Aanbevolen e-mailtemplate: `?token_hash=…&type=recovery`, wordt via `verifyOtp` ingewisseld. */
  | { kind: 'token-hash'; tokenHash: string }
  /** Standaardtemplate van Supabase: na de redirect staat de sessie in de hash (`#access_token=…`). */
  | { kind: 'session'; accessToken: string; refreshToken: string }
  /** Supabase stuurde een fout terug, bijv. een verlopen of al gebruikte link. */
  | { kind: 'error'; message: string }

/**
 * Herkent een wachtwoord-resetlink in de URL. Kijkt niet naar het pad, zodat het ook werkt
 * als Supabase terugvalt op de Site URL. Geeft `null` voor een gewone URL.
 */
export function parseRecoveryLink(href: string): RecoveryLink | null {
  const url = new URL(href)
  const query = url.searchParams
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))

  const tokenHash = query.get('token_hash')
  if (tokenHash && query.get('type') === 'recovery') return { kind: 'token-hash', tokenHash }

  const accessToken = hash.get('access_token')
  const refreshToken = hash.get('refresh_token')
  if (accessToken && refreshToken && hash.get('type') === 'recovery') {
    return { kind: 'session', accessToken, refreshToken }
  }

  // Supabase zet fouten in de hash. Een `?error=` in de query alleen op ons eigen pad
  // meetellen: de bank stuurt bij /bank/callback ook een `error` terug.
  const onRecoveryPath = url.pathname === RECOVERY_PATH
  if (hash.get('error_code') || (onRecoveryPath && (hash.get('error') || query.get('error')))) {
    return {
      kind: 'error',
      message: recoveryLinkErrorMessage(hash.get('error_code') ?? query.get('error_code')),
    }
  }
  return null
}

export function recoveryLinkErrorMessage(code?: string | null): string {
  if (code === 'otp_expired')
    return 'Deze resetlink is verlopen of al gebruikt. Vraag een nieuwe aan.'
  return 'Deze resetlink werkt niet (meer). Vraag een nieuwe aan.'
}

/** Haalt de tokens uit de adresbalk, zodat ze niet in de geschiedenis of bij een refresh blijven. */
export function clearRecoveryFromUrl() {
  window.history.replaceState(null, '', '/')
}
