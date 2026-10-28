import { describe, expect, it } from 'vitest'
import {
  loginErrorMessage,
  newPasswordErrorMessage,
  resetRequestErrorMessage,
  validateLogin,
  validateNewPassword,
  validateResetEmail,
} from './authErrors'

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

describe('resetRequestErrorMessage', () => {
  it.each([
    [{ code: 'over_email_send_rate_limit', status: 429 }, /Wacht even/],
    [{ status: 429 }, /Wacht even/],
    [{ name: 'AuthRetryableFetchError', status: 0 }, /Geen verbinding/],
    [{ message: 'iets onbekends' }, /niet worden verstuurd/],
  ])('%o', (error, expected) => {
    expect(resetRequestErrorMessage(error)).toMatch(expected)
  })
})

describe('newPasswordErrorMessage', () => {
  it.each([
    [{ code: 'same_password' }, /ander wachtwoord/],
    [{ code: 'weak_password' }, /te zwak/],
    [{ code: 'session_not_found' }, /verlopen/],
    [{ message: 'iets onbekends' }, /niet worden opgeslagen/],
  ])('%o', (error, expected) => {
    expect(newPasswordErrorMessage(error)).toMatch(expected)
  })
})

describe('validateResetEmail', () => {
  it('vereist een geldig e-mailadres', () => {
    expect(validateResetEmail('ik@voorbeeld.nl')).toEqual({})
    expect(validateResetEmail(' ').email).toMatch(/Vul je e-mailadres in/)
    expect(validateResetEmail('ik@').email).toMatch(/geldig/)
  })
})

describe('validateNewPassword', () => {
  it('vereist een lang genoeg wachtwoord dat twee keer gelijk is ingevuld', () => {
    expect(validateNewPassword('lang-genoeg', 'lang-genoeg')).toEqual({})
    expect(validateNewPassword('', '').password).toMatch(/Vul een nieuw/)
    expect(validateNewPassword('kort', 'kort').password).toMatch(/minstens 8/)
    expect(validateNewPassword('lang-genoeg', 'anders')).toEqual({
      confirm: 'De wachtwoorden zijn niet gelijk.',
    })
  })
})
