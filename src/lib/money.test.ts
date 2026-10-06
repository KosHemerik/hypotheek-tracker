import { describe, expect, it } from 'vitest'
import { centsToInput, milliToInput, parseAmountToCents, parseRateToMilli, roundDiv } from './money'
import { formatCurrency, formatDate, formatRate } from './format'
import { milliToRatePercentage, ratePercentageToMilli } from '@/domain/mappers'

describe('roundDiv', () => {
  it('rondt half weg van nul af', () => {
    expect(roundDiv(5, 2)).toBe(3)
    expect(roundDiv(4, 3)).toBe(1)
    expect(roundDiv(-5, 2)).toBe(-3)
    expect(roundDiv(0, 7)).toBe(0)
    expect(Object.is(roundDiv(-1, 7), -0)).toBe(false)
  })
})

describe('parseAmountToCents', () => {
  it.each([
    ['250.000,00', 250_000_00],
    ['250000', 250_000_00],
    ['250.000', 250_000_00],
    ['1.234,5', 1_234_50],
    ['1234,56', 1_234_56],
    ['1234.56', 1_234_56],
    ['€ 12,-', 12_00],
    ['0,10', 10],
    [',5', 50],
    ['  812,50 ', 812_50],
  ])('%s → %i cent', (input, expected) => {
    expect(parseAmountToCents(input)).toBe(expected)
  })

  it.each(['', 'abc', '1,234,56', '12,345', '1.23.4', '12.3456'])('weigert "%s"', (input) => {
    expect(parseAmountToCents(input)).toBeNull()
  })

  it('herkent negatieve bedragen (zodat validatie een duidelijke melding kan geven)', () => {
    expect(parseAmountToCents('-10,00')).toBe(-10_00)
  })
})

describe('parseRateToMilli', () => {
  it.each([
    ['3,85', 3850],
    ['3.85', 3850],
    ['3,855%', 3855],
    ['4', 4000],
    ['0', 0],
  ])('%s → %i', (input, expected) => {
    expect(parseRateToMilli(input)).toBe(expected)
  })

  it.each(['', 'x', '3,8555', '-1'])('weigert "%s"', (input) => {
    expect(parseRateToMilli(input)).toBeNull()
  })
})

describe('invoer-roundtrip', () => {
  it('centsToInput en milliToInput zijn terug te parsen', () => {
    expect(centsToInput(250_000_05)).toBe('250000,05')
    expect(parseAmountToCents(centsToInput(250_000_05))).toBe(250_000_05)
    expect(milliToInput(3850)).toBe('3,85')
    expect(milliToInput(3855)).toBe('3,855')
    expect(milliToInput(4000)).toBe('4,00')
    expect(parseRateToMilli(milliToInput(3805))).toBe(3805)
  })
})

describe('database-mapping rentepercentage', () => {
  it('vertaalt numeric ↔ duizendsten procent exact', () => {
    expect(ratePercentageToMilli('3.850')).toBe(3850)
    expect(ratePercentageToMilli(3.85)).toBe(3850)
    expect(ratePercentageToMilli(0.1)).toBe(100)
    expect(milliToRatePercentage(3850)).toBe('3.850')
    expect(milliToRatePercentage(5)).toBe('0.005')
  })
})

describe('formattering', () => {
  it('toont bedragen, percentages en datums in Nederlandse notatie', () => {
    expect(formatCurrency(250_000_00).replace(/\s/g, ' ')).toBe('€ 250.000,00')
    expect(formatCurrency(-12_34).replace(/\s/g, ' ')).toBe('€ -12,34')
    expect(formatRate(3850)).toBe('3,85%')
    expect(formatRate(3855)).toBe('3,855%')
    expect(formatDate('2025-03-01')).toBe('01-03-2025')
  })
})
