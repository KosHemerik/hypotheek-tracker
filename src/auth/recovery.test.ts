import { describe, expect, it } from 'vitest'
import { parseRecoveryLink } from './recovery'

const base = 'https://app.example.nl'

describe('parseRecoveryLink', () => {
  it('herkent de token_hash-link (aanbevolen template)', () => {
    expect(
      parseRecoveryLink(`${base}/wachtwoord-herstellen?token_hash=abc123&type=recovery`),
    ).toEqual({ kind: 'token-hash', tokenHash: 'abc123' })
  })

  it('herkent de sessie in de hash (standaardtemplate)', () => {
    expect(
      parseRecoveryLink(
        `${base}/wachtwoord-herstellen#access_token=at&expires_in=3600&refresh_token=rt&token_type=bearer&type=recovery`,
      ),
    ).toEqual({ kind: 'session', accessToken: 'at', refreshToken: 'rt' })
  })

  it('werkt ook als Supabase terugvalt op de Site URL', () => {
    expect(parseRecoveryLink(`${base}/?token_hash=x&type=recovery`)?.kind).toBe('token-hash')
  })

  it('geeft een duidelijke melding bij een verlopen link', () => {
    const link = parseRecoveryLink(
      `${base}/wachtwoord-herstellen#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`,
    )
    expect(link).toEqual({ kind: 'error', message: expect.stringMatching(/verlopen/) })
  })

  it('negeert gewone URLs en andere linktypes', () => {
    expect(parseRecoveryLink(`${base}/`)).toBeNull()
    expect(parseRecoveryLink(`${base}/hypotheek/1?type=recovery`)).toBeNull()
    expect(parseRecoveryLink(`${base}/?token_hash=x&type=signup`)).toBeNull()
    expect(parseRecoveryLink(`${base}/bank/callback?code=abc&state=xyz`)).toBeNull()
  })
})
