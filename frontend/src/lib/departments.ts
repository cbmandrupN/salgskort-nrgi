import type { Case } from '../types/cases'

export const DEFAULT_DEPARTMENT = '__buildings'

const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('da-DK')

export function matchesDepartment(c: Case, department: string): boolean {
  if (!department) return true
  const name = normalize(c.department || '')
  if (department === '__missing') return !name
  if (department === DEFAULT_DEPARTMENT) return /^bygninger(?:$|[\s-])/.test(name)
  return name === normalize(department)
}

export function departmentAdvisors(cases: Case[]): string[] {
  return [...new Set(cases.flatMap(c => c.advisor ? [c.advisor] : []))]
    .sort((a, b) => a.localeCompare(b, 'da'))
}
