import { expect, it } from 'vitest'
import type { Case } from '../types/cases'
import { advisorKey, buildingAdvisors, CASPER_PINK, caseAdvisors, hasAdvisor, MISSING_ADVISOR, UNASSIGNED_COLOR } from './advisors'
import { groupCases, markerBackground } from './map-groups'

const row = (advisor: string, department = 'Bygninger Vest', id = advisor): Case => ({
  id, advisor, department, address_raw: 'Fiktiv adresse', source_row: 2,
  latitude: 56.15, longitude: 10.2, postal_code: '8000', geocode_status: 'delvis',
})
const cases = [
  row('Casper Bøvling'), row('  CASPER   BØVLING  ', 'Bygninger Øst', 'second'),
  row('Demo Anna'), row('Demo Bo', 'Bygninger'), row('Kun Industri', 'Industri'),
  row('Kun ESG', 'ESG'), row(' ', 'Bygninger'), row('Casper Bøvling', 'Industri', 'other-casper'),
]

it('lists all and only named Bygninger advisors, normalized and counted', () => {
  const advisors = buildingAdvisors(cases)
  expect(advisors.map(a => a.key)).toEqual(['casper bøvling', 'demo anna', 'demo bo'])
  expect(advisors[0].count).toBe(2)
  expect(advisors[0].color).toBe(CASPER_PINK)
  expect(advisorKey('  Demo   Anna ')).toBe('demo anna')
  expect(advisorKey('Demo \u00c5se')).toBe(advisorKey('Demo A\u030ase'))
})

it('assigns unique colors, reserving pink exclusively for Casper even beyond the palette', () => {
  const advisors = buildingAdvisors([...cases, ...Array.from({ length: 40 }, (_, i) => row(`Fiktiv ${i}`))])
  expect(new Set(advisors.map(a => a.color)).size).toBe(advisors.length)
  expect(advisors.filter(a => a.color === CASPER_PINK).map(a => a.key)).toEqual(['casper bøvling'])
})

it('keeps colors independent of Excel row order and case/status filtering', () => {
  const advisors = buildingAdvisors(cases)
  expect(buildingAdvisors([...cases].reverse())).toEqual(advisors)
  const filtered = groupCases(cases.slice(0, 1), advisors)
  expect(filtered[0].advisors[0].color).toBe(CASPER_PINK)
  expect(groupCases(cases, advisors)[0].advisors.find(a => a.key === advisorKey('Demo Anna'))?.color)
    .toBe(advisors.find(a => a.key === advisorKey('Demo Anna'))?.color)
})

it('does not color other departments as Bygninger, even for an identically named advisor', () => {
  const advisors = buildingAdvisors(cases)
  expect(caseAdvisors(cases[7], advisors)).toEqual([{ key: '__other', name: 'Andre afdelinger', color: UNASSIGNED_COLOR }])
  expect(caseAdvisors(cases[6], advisors)[0].key).toBe(MISSING_ADVISOR)
  expect(caseAdvisors(cases[6], advisors)[0].color).toBe(UNASSIGNED_COLOR)
})

it('shows every advisor at a shared location, with proportional segments and no lost cases', () => {
  const advisors = buildingAdvisors(cases)
  const groups = groupCases(cases.slice(0, 3), advisors)
  expect(groups).toHaveLength(1)
  expect(groups[0].count).toBe(3)
  expect(groups[0].advisors.map(a => a.count)).toEqual([2, 1])
  const background = markerBackground(groups[0])
  expect(background).toContain(`${CASPER_PINK} 0% 66.66666666666666%`)
  expect(background).toContain(`${advisors[1].color} 66.66666666666666% 100%`)
})

it('retains unplaced advisors in the bar while excluding invalid positions from map groups', () => {
  const unplaced = { ...row('Uden placering'), latitude: undefined, longitude: undefined }
  const invalid = { ...row('Ugyldig placering'), latitude: NaN }
  const advisors = buildingAdvisors([unplaced, invalid])
  expect(advisors).toHaveLength(3)
  expect(groupCases([unplaced, invalid], advisors)).toEqual([])
})

it('uses a single color for a single-advisor location and returns no groups for empty data', () => {
  const advisors = buildingAdvisors(cases)
  const group = groupCases(cases.slice(0, 2), advisors)[0]
  expect(markerBackground(group)).toBe(`conic-gradient(${CASPER_PINK} 0% 100%)`)
  expect(groupCases([], advisors)).toEqual([])
  expect(buildingAdvisors([])).toEqual([{ key: advisorKey('Casper Bøvling'), name: 'Casper Bøvling', count: 0, color: CASPER_PINK }])
})

it('splits shared assignments into individual advisors without duplicating the case', () => {
  const shared = row('Demo A. / Demo B / Demo A')
  const advisors = buildingAdvisors([shared, row('Demo A')])
  expect(advisors.map(a => [a.key, a.count])).toEqual([['casper bøvling', 0], ['demo a', 2], ['demo b', 1]])
  expect(hasAdvisor(shared, 'demo a')).toBe(true)
  expect(hasAdvisor(shared, 'demo b')).toBe(true)
  expect(caseAdvisors(shared, advisors)).toHaveLength(2)
  const [group] = groupCases([shared], advisors)
  expect(group.count).toBe(1)
  expect(group.advisors.map(a => a.count)).toEqual([1, 1])
  expect(markerBackground(group)).toContain('0% 50%')
  expect(markerBackground(group)).toContain('50% 100%')
})
