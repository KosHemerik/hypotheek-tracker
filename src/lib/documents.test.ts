import { describe, expect, it } from 'vitest'
import {
  fileKind,
  formatFileSize,
  guessCategory,
  MAX_FILE_SIZE_BYTES,
  validateFileName,
  validateFiles,
} from './documents'

describe('formatFileSize', () => {
  it.each([
    [512, '512 B'],
    [1536, '1,5 kB'],
    [200 * 1024, '200 kB'],
    [2_500_000, '2,4 MB'],
    [20 * 1024 * 1024, '20 MB'],
  ])('%i → %s', (bytes, expected) => {
    expect(formatFileSize(bytes)).toBe(expected)
  })
})

describe('guessCategory', () => {
  it.each([
    ['Jaaroverzicht 2025.pdf', 'annual_statement'],
    ['jaaropgave-hypotheek.pdf', 'annual_statement'],
    ['Taxatierapport.pdf', 'valuation'],
    ['Hypotheekakte notaris.pdf', 'deed'],
    ['Bindend aanbod.pdf', 'offer'],
    ['Rentevoorstel juni.pdf', 'rate_change'],
    ['scan_0012.jpg', 'other'],
  ] as const)('%s → %s', (name, expected) => {
    expect(guessCategory(name)).toBe(expected)
  })
})

describe('fileKind', () => {
  it('herkent soorten op mime-type en extensie', () => {
    expect(fileKind('application/pdf', 'a.pdf')).toBe('pdf')
    expect(fileKind('', 'a.PDF')).toBe('pdf')
    expect(fileKind('image/jpeg', 'a.jpg')).toBe('image')
    expect(fileKind('', 'a.xlsx')).toBe('spreadsheet')
    expect(fileKind('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'a.docx')).toBe('text')
    expect(fileKind('application/zip', 'a.zip')).toBe('other')
  })
})

describe('validateFiles', () => {
  it('accepteert normale bestanden', () => {
    expect(validateFiles([{ name: 'a.pdf', size: 1000 }])).toEqual([])
  })

  it('weigert lege selectie, lege en te grote bestanden', () => {
    expect(validateFiles([])).toEqual(['Kies minimaal één bestand.'])
    const errors = validateFiles([
      { name: 'leeg.pdf', size: 0 },
      { name: 'groot.pdf', size: MAX_FILE_SIZE_BYTES + 1 },
    ])
    expect(errors[0]).toMatch(/"leeg.pdf" is leeg/)
    expect(errors[1]).toMatch(/"groot.pdf" is te groot .* maximaal 20 MB/)
  })

  it('beperkt het aantal bestanden per keer', () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ name: `${i}.pdf`, size: 1 }))
    expect(validateFiles(many)).toEqual(['Upload maximaal 10 bestanden tegelijk.'])
  })
})

describe('validateFileName', () => {
  it('vereist een naam met dezelfde extensie', () => {
    expect(validateFileName('Akte.pdf', 'scan.pdf')).toBeNull()
    expect(validateFileName('Akte.PDF', 'scan.pdf')).toBeNull()
    expect(validateFileName('  ', 'scan.pdf')).toMatch(/Vul een bestandsnaam/)
    expect(validateFileName('Akte', 'scan.pdf')).toMatch(/\.pdf/)
    expect(validateFileName('map/Akte.pdf', 'scan.pdf')).toMatch(/mag geen/)
    expect(validateFileName('notities', 'notities')).toBeNull()
  })
})
