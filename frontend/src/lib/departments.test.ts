import { describe, expect, it } from 'vitest'
import type { Case } from '../types/cases'
import { DEFAULT_DEPARTMENT, departmentAdvisors, matchesDepartment } from './departments'

const fixtures: Case[] = [
  { id: '1', department: 'Bygninger Vest', advisor: 'Vest-rådgiver', address_raw: '', geocode_status: 'fejlet', source_row: 2 },
  { id: '2', department: 'Bygninger Øst', advisor: 'Øst-rådgiver', address_raw: '', geocode_status: 'fejlet', source_row: 3 },
  { id: '3', department: 'Bygninger', advisor: 'Vest-rådgiver', address_raw: '', geocode_status: 'fejlet', source_row: 4 },
  { id: '4', department: 'Industri', advisor: 'Industri-rådgiver', address_raw: '', geocode_status: 'fejlet', source_row: 5 },
  { id: '5', department: 'ESG', advisor: 'ESG-rådgiver', address_raw: '', geocode_status: 'fejlet', source_row: 6 },
  { id: '6', address_raw: '', geocode_status: 'fejlet', source_row: 7 },
]

describe('Bygninger default scope', () => {
  it('includes Bygninger and its regional departments, not Industri or ESG', () => {
    expect(fixtures.filter(c => matchesDepartment(c, DEFAULT_DEPARTMENT)).map(c => c.id)).toEqual(['1', '2', '3'])
  })
  it('lists only advisors in the selected scope and removes duplicates', () => {
    const scope = fixtures.filter(c => matchesDepartment(c, DEFAULT_DEPARTMENT))
    expect(departmentAdvisors(scope)).toEqual(['Vest-rådgiver', 'Øst-rådgiver'])
    expect(departmentAdvisors(fixtures.filter(c => matchesDepartment(c, 'Bygninger Øst')))).toEqual(['Øst-rådgiver'])
  })
  it('retains explicit all-department and missing-department views', () => {
    expect(fixtures.filter(c => matchesDepartment(c, ''))).toHaveLength(6)
    expect(fixtures.filter(c => matchesDepartment(c, '__missing')).map(c => c.id)).toEqual(['6'])
  })
  it('normalizes case and whitespace without matching unrelated prefixes', () => {
    expect(matchesDepartment({ ...fixtures[0], department: '  BYGNINGER   Øst ' }, DEFAULT_DEPARTMENT)).toBe(true)
    expect(matchesDepartment({ ...fixtures[0], department: 'Bygningerne' }, DEFAULT_DEPARTMENT)).toBe(false)
  })
})
