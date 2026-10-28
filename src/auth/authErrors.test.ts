import { describe, expect, it } from 'vitest'
import { loginErrorMessage, validateLogin } from './authErrors'

describe('loginErrorMessage', () => {
  it.each([
    [{ code: 'invalid_credentials', status: 400 }, /klopt niet/],
    [{ message: 'Invalid login credentials', status: 400 }, /klopt niet/],
    [{ code: 'email_not_confirmed' }, /nog niet bevestigd/],
    [{ code: 'over_request_rate_limit' }, /Te veel inlogpogingen/],
    [{ status: 429 }, /Te veel inlogpogingen/],
    [{ name: 'AuthRetryableFetchError', status: 0 }, /Geen verbinding/],
    [{ code: 'email_provider_disabled' }, /staat uit/],
    [{ message: 'iets onbekends' }, /niet gelukt/],
    [null, /niet gelukt/],
  ])('%o', (error, expected) => {
    expect(loginErrorMessage(error)).toMatch(expected)
  })
})

describe('validateLogin', () => {
  it('vereist een geldig e-mailadres en een wachtwoord', () => {
    expect(validateLogin('ik@voorbeeld.nl', 'geheim')).toEqual({})
    expect(validateLogin('', '')).toEqual({
      email: 'Vul je e-mailadres in.',
      password: 'Vul je wachtwoord in.',
    })
    expect(validateLogin('ik@voorbeeld', 'x').email).toMatch(/geldig/)
  })
})
