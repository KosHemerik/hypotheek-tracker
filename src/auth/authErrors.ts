/** Minimale vorm van een Supabase-autfout (AuthError), zodat dit zonder supabase-js te testen is. */
export interface AuthErrorLike {
  code?: string
  status?: number
  message?: string
  name?: string
}

/** Vertaalt een fout bij inloggen naar een duidelijke Nederlandse melding. */
export function loginErrorMessage(error: unknown): string {
  const e = (typeof error === 'object' && error !== null ? error : {}) as AuthErrorLike

  switch (e.code) {
    case 'invalid_credentials':
      return 'E-mailadres of wachtwoord klopt niet.'
    case 'email_not_confirmed':
      return 'Dit e-mailadres is nog niet bevestigd. Bevestig het account in Supabase (Authentication → Users).'
    case 'over_request_rate_limit':
      return 'Te veel inlogpogingen. Wacht een paar minuten en probeer het opnieuw.'
    case 'user_banned':
      return 'Dit account is geblokkeerd.'
    case 'email_provider_disabled':
    case 'provider_disabled':
      return 'Inloggen met e-mail staat uit in Supabase (Authentication → Sign In / Providers).'
  }

  if (e.status === 429)
    return 'Te veel inlogpogingen. Wacht een paar minuten en probeer het opnieuw.'
  if (e.name === 'AuthRetryableFetchError' || e.status === 0 || e.message === 'Failed to fetch') {
    return 'Geen verbinding met de server. Controleer je internetverbinding.'
  }
  if (e.message === 'Invalid login credentials') return 'E-mailadres of wachtwoord klopt niet.'
  return 'Inloggen is niet gelukt. Probeer het opnieuw.'
}

/** Vertaalt een fout bij het aanvragen van een resetmail. */
export function resetRequestErrorMessage(error: unknown): string {
  const e = (typeof error === 'object' && error !== null ? error : {}) as AuthErrorLike
  if (
    e.code === 'over_email_send_rate_limit' ||
    e.code === 'over_request_rate_limit' ||
    e.status === 429
  ) {
    return 'Er zijn net al resetmails verstuurd. Wacht even en probeer het opnieuw.'
  }
  if (e.name === 'AuthRetryableFetchError' || e.status === 0 || e.message === 'Failed to fetch') {
    return 'Geen verbinding met de server. Controleer je internetverbinding.'
  }
  return 'De resetmail kon niet worden verstuurd. Probeer het opnieuw.'
}

/** Vertaalt een fout bij het opslaan van een nieuw wachtwoord. */
export function newPasswordErrorMessage(error: unknown): string {
  const e = (typeof error === 'object' && error !== null ? error : {}) as AuthErrorLike
  switch (e.code) {
    case 'same_password':
      return 'Kies een ander wachtwoord dan je huidige.'
    case 'weak_password':
      return 'Dit wachtwoord is te zwak of komt voor in een lijst met gelekte wachtwoorden. Kies een sterker wachtwoord.'
    case 'session_not_found':
    case 'session_expired':
      return 'De resetsessie is verlopen. Vraag een nieuwe resetlink aan.'
  }
  if (e.name === 'AuthRetryableFetchError' || e.status === 0 || e.message === 'Failed to fetch') {
    return 'Geen verbinding met de server. Controleer je internetverbinding.'
  }
  return 'Het wachtwoord kon niet worden opgeslagen. Probeer het opnieuw.'
}

function emailError(email: string): string | undefined {
  if (!email.trim()) return 'Vul je e-mailadres in.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Vul een geldig e-mailadres in.'
}

/** Basiscontrole vóór de aanroep, zodat we geen onnodige pogingen verbruiken. */
export function validateLogin(
  email: string,
  password: string,
): { email?: string; password?: string } {
  const errors: { email?: string; password?: string } = {}
  const emailMessage = emailError(email)
  if (emailMessage) errors.email = emailMessage
  if (!password) errors.password = 'Vul je wachtwoord in.'
  return errors
}

export function validateResetEmail(email: string): { email?: string } {
  const emailMessage = emailError(email)
  return emailMessage ? { email: emailMessage } : {}
}

/** Minimale lengte in de app; Supabase kan strenger zijn (Authentication → Providers → Email). */
export const MIN_PASSWORD_LENGTH = 8

export function validateNewPassword(
  password: string,
  confirm: string,
): { password?: string; confirm?: string } {
  const errors: { password?: string; confirm?: string } = {}
  if (!password) errors.password = 'Vul een nieuw wachtwoord in.'
  else if (password.length < MIN_PASSWORD_LENGTH)
    errors.password = `Gebruik minstens ${MIN_PASSWORD_LENGTH} tekens.`
  if (!errors.password && confirm !== password) errors.confirm = 'De wachtwoorden zijn niet gelijk.'
  return errors
}
