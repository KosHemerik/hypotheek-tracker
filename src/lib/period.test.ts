import { describe, expect, it } from 'vitest'
import { addMonths, monthsBetween, monthsDiff } from './dates'
import { availableYears, isPeriodKey, periodRange } from './period'

describe('periodRange', () => {
  const today = '2025-05-15'

  it.each([
    ['3M', { from: '2025-02-16', to: today }],
    ['6M', { from: '2024-11-16', to: today }],
    ['1J', { from: '2024-05-16', to: today }],
    ['YTD', { from: '2025-01-01', to: today }],
    ['ALL', { from: null, to: null }],
    ['2024', { from: '2024-01-01', to: '2024-12-31' }],
  ] as const)('%s', (key, expected) => {
    expect(periodRange(key, today)).toEqual(expected)
  })
})

describe('isPeriodKey', () => {
  it('herkent geldige sleutels', () => {
    expect(isPeriodKey('3M')).toBe(true)
    expect(isPeriodKey('2025')).toBe(true)
    expect(isPeriodKey('25')).toBe(false)
    expect(isPeriodKey('2M')).toBe(false)
    expect(isPeriodKey(null)).toBe(false)
  })
})

describe('availableYears', () => {
  it('geeft alle jaren van het vroegste jaar t/m nu, nieuwste eerst', () => {
    expect(availableYears(['2022-06-01', '2024-01-01'], '2025-03-01')).toEqual([
      2025, 2024, 2023, 2022,
    ])
    expect(availableYears([], '2025-03-01')).toEqual([2025])
  })
})

describe('datumhulpjes', () => {
  it('addMonths begrenst op het einde van de maand', () => {
    expect(addMonths('2025-03-31', -1)).toBe('2025-02-28')
    expect(addMonths('2024-03-31', -1)).toBe('2024-02-29')
    expect(addMonths('2024-11-30', 3)).toBe('2025-02-28')
    expect(addMonths('2025-01-15', -13)).toBe('2023-12-15')
  })

  it('monthsBetween is inclusief', () => {
    expect(monthsBetween('2024-11', '2025-02')).toEqual([
      '2024-11',
      '2024-12',
      '2025-01',
      '2025-02',
    ])
  })

  it('monthsDiff telt hele maanden', () => {
    expect(monthsDiff('2025-01-15', '2055-01-15')).toBe(360)
    expect(monthsDiff('2025-01-15', '2025-02-14')).toBe(0)
  })
})
