import { describe, expect, it } from 'vitest'
import { normalizeIban, validateIban } from './iban'

describe('IBAN', () => {
  it('normaliseert spaties en hoofdletters', () => {
    expect(normalizeIban('nl91 abna 0417 1643 00')).toBe('NL91ABNA0417164300')
  })

  it.each([
    'NL91ABNA0417164300',
    'nl91 abna 0417 1643 00',
    'DE89370400440532013000',
    'GB82WEST12345698765432',
  ])('accepteert %s', (iban) => {
    expect(validateIban(iban)).toBeNull()
  })

  it('weigert een fout controlegetal, verkeerde lengte en onzin', () => {
    expect(validateIban('NL92ABNA0417164300')).toMatch(/controlegetal/)
    expect(validateIban('NL91ABNA041716430')).toMatch(/18 tekens/)
    expect(validateIban('12345')).toMatch(/geldig IBAN/)
  })
})
