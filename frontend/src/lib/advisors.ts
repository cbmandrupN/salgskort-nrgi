import type { Case } from '../types/cases'
import { DEFAULT_DEPARTMENT, matchesDepartment } from './departments'

export const CASPER_PINK = '#ec4899'
export const UNASSIGNED_COLOR = '#64748b'
export const MISSING_ADVISOR = '__missing'
const COLORS = ['#0077b6', '#008264', '#b45309', '#7c3aed', '#b91c1c', '#0e7490',
  '#687514', '#4338ca', '#9a3412', '#047857', '#6b4c9a', '#52677a', '#a16207', '#155e75']

export interface Advisor {
  key: string
  name: string
  color: string
  count: number
}

const displayName = (name: string) => name.normalize('NFC').trim().replace(/\s+/g, ' ')
export const advisorKey = (name = '') => displayName(name).replace(/\.$/, '').toLocaleLowerCase('da-DK')
export const advisorNames = (value = '') => [...new Map(value.split('/').map(displayName)
  .filter(Boolean).map(name => [advisorKey(name), name])).values()]
export const hasAdvisor = (c: Case, key: string) => advisorNames(c.advisor).some(name => advisorKey(name) === key)

function nameHash(name: string): number {
  let hash = 0
  for (const char of name) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0
  return hash
}

export function buildingAdvisors(cases: readonly Case[]): Advisor[] {
  const casperKey = advisorKey('Casper Bøvling')
  const names = new Map<string, { name: string; count: number }>([
    [casperKey, { name: 'Casper Bøvling', count: 0 }],
  ])
  for (const c of cases) {
    if (!matchesDepartment(c, DEFAULT_DEPARTMENT)) continue
    for (const name of advisorNames(c.advisor)) {
      const key = advisorKey(name)
      const previous = names.get(key)
      names.set(key, { name: key === casperKey ? 'Casper Bøvling' : previous && previous.name < name ? previous.name : name,
        count: (previous?.count ?? 0) + 1 })
    }
  }
  const used = new Set([CASPER_PINK, UNASSIGNED_COLOR])
  return [...names].sort(([a], [b]) => a.localeCompare(b, 'da')).map(([key, value]) => {
    if (key === casperKey) return { key, ...value, color: CASPER_PINK }
    const hash = nameHash(key)
    let attempt = 0
    let color: string
    do {
      color = attempt < COLORS.length ? COLORS[(hash + attempt) % COLORS.length]
        : `hsl(${((hash % 360 + attempt * 137.508) % 360).toFixed(3)} 65% 30%)`
      attempt++
    } while (used.has(color))
    used.add(color)
    return { key, ...value, color }
  })
}

export function caseAdvisors(c: Case, advisors: readonly Advisor[]): Pick<Advisor, 'key' | 'name' | 'color'>[] {
  if (!matchesDepartment(c, DEFAULT_DEPARTMENT)) {
    return [{ key: '__other', name: 'Andre afdelinger', color: UNASSIGNED_COLOR }]
  }
  const keys = new Set(advisorNames(c.advisor).map(advisorKey))
  const owners = advisors.filter(a => keys.has(a.key))
  return owners.length ? owners : [{ key: MISSING_ADVISOR, name: 'Rådgiver ikke angivet', color: UNASSIGNED_COLOR }]
}
