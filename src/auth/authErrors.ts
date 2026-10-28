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

/** Basiscontrole vóór de aanroep, zodat we geen onnodige pogingen verbruiken. */
export function validateLogin(
  email: string,
  password: string,
): { email?: string; password?: string } {
  const errors: { email?: string; password?: string } = {}
  if (!email.trim()) errors.email = 'Vul je e-mailadres in.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    errors.email = 'Vul een geldig e-mailadres in.'
  if (!password) errors.password = 'Vul je wachtwoord in.'
  return errors
}
