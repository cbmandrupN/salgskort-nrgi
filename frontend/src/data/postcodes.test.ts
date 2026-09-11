import { expect, it } from 'vitest'
import postcodes from './postcodes.json'

it.each([
  ['6853', 55.5, 55.7],
  ['6854', 55.6, 55.8],
  ['6857', 55.4, 55.7],
  ['6950', 56.0, 56.3],
  ['6960', 55.7, 56.1],
  ['7650', 56.3, 56.6],
  ['7680', 56.6, 56.8],
  ['7752', 56.7, 57.0],
  ['7755', 56.7, 57.0],
  ['7770', 56.6, 56.9],
] as const)('keeps coastal postcode %s near western Jutland, not its offshore territory', (code, minLat, maxLat) => {
  const center = postcodes[code]
  expect(center.longitude).toBeGreaterThan(8)
  expect(center.longitude).toBeLessThan(8.8)
  expect(center.latitude).toBeGreaterThan(minLat)
  expect(center.latitude).toBeLessThan(maxLat)
})

it('keeps all nationwide reference points inside the Danish land extent', () => {
  expect(Object.keys(postcodes)).toHaveLength(1089)
  for (const point of Object.values(postcodes)) {
    expect(point.longitude).toBeGreaterThan(7.8)
    expect(point.longitude).toBeLessThan(16)
    expect(point.latitude).toBeGreaterThan(54.4)
    expect(point.latitude).toBeLessThan(58)
  }
})
