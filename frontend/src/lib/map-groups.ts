import type { Case } from '../types/cases'
import { caseAdvisors } from './advisors'
import type { Advisor } from './advisors'

export function hasPosition(c: Case): c is Case & { latitude: number; longitude: number } {
  return typeof c.latitude === 'number' && Number.isFinite(c.latitude) &&
    typeof c.longitude === 'number' && Number.isFinite(c.longitude)
}
export const locationKey = (c: Case) => hasPosition(c) ? `${c.latitude}:${c.longitude}` : ''

export interface MapGroup {
  key: string
  latitude: number
  longitude: number
  label: string
  count: number
  advisors: Advisor[]
}

export function groupCases(cases: readonly Case[], advisors: readonly Advisor[]): MapGroup[] {
  const locations = new Map<string, MapGroup>()
  for (const c of cases.filter(hasPosition)) {
    const key = locationKey(c)
    let group = locations.get(key)
    if (!group) {
      group = { key, latitude: c.latitude, longitude: c.longitude, count: 0, advisors: [],
        label: c.postal_code ? `${c.postal_code} ${c.city || ''}`.trim() : 'Område' }
      locations.set(key, group)
    }
    group.count++
    for (const owner of caseAdvisors(c, advisors)) {
      const segment = group.advisors.find(a => a.key === owner.key)
      if (segment) segment.count++
      else group.advisors.push({ ...owner, count: 1 })
    }
  }
  return [...locations.values()].map(group => ({
    ...group, advisors: group.advisors.sort((a, b) => a.key.localeCompare(b.key, 'da')),
  }))
}

export function markerBackground(group: MapGroup): string {
  let position = 0
  const assignments = group.advisors.reduce((sum, a) => sum + a.count, 0)
  const stops = group.advisors.map(a => {
    const start = position
    position += a.count
    return `${a.color} ${start / assignments * 100}% ${position / assignments * 100}%`
  })
  return `conic-gradient(${stops.join(', ')})`
}
