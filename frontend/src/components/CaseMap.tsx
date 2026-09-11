import { useEffect, useMemo, useState } from 'react'
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from 'react-leaflet'
import type { Case } from '../types/cases'

export function hasPosition(c: Case): c is Case & { latitude: number; longitude: number } {
  return typeof c.latitude === 'number' && Number.isFinite(c.latitude) &&
    typeof c.longitude === 'number' && Number.isFinite(c.longitude)
}
export const locationKey = (c: Case) => hasPosition(c) ? `${c.latitude}:${c.longitude}` : ''

function FitBounds({ cases }: { cases: Case[] }) {
  const map = useMap()
  useEffect(() => {
    const points = cases.filter(hasPosition).map(c => [c.latitude, c.longitude] as [number, number])
    const fit = () => {
      map.invalidateSize({ animate: false })
      if (points.length) map.fitBounds(points, { padding: [36, 36], maxZoom: 10, animate: false })
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [cases, map])
  return null
}

export function CaseMap({ cases, onAreaClick }: { cases: Case[]; onAreaClick: (key: string) => void }) {
  const [tileError, setTileError] = useState(false)
  const groups = useMemo(() => {
    const locations = new Map<string, { latitude: number; longitude: number; count: number; label: string }>()
    for (const c of cases.filter(hasPosition)) {
      const key = locationKey(c)
      const existing = locations.get(key)
      if (existing) existing.count++
      else locations.set(key, {
        latitude: c.latitude, longitude: c.longitude, count: 1,
        label: c.postal_code ? `${c.postal_code} ${c.city || ''}` : 'Område',
      })
    }
    return [...locations.entries()]
  }, [cases])
  return <>
    <MapContainer center={[56.1, 10.3]} zoom={7} scrollWheelZoom={false}>
      <TileLayer url={import.meta.env.VITE_MAP_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        eventHandlers={{ tileerror: () => setTileError(true) }} />
      <FitBounds cases={cases} />
      {groups.map(([key, group]) => <CircleMarker key={key}
        center={[group.latitude, group.longitude]} radius={Math.min(24, 10 + Math.sqrt(group.count) * 2)}
        pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#087658', fillOpacity: 0.95 }}
        eventHandlers={{ click: () => onAreaClick(key) }}>
        <Tooltip permanent direction="center" className="cluster-label"><span title={`${group.label}: ${group.count} sager`}>{group.count}</span></Tooltip>
      </CircleMarker>)}
    </MapContainer>
    {tileError && <p className="tile-warning" role="status">Baggrundskortet kunne ikke hentes fuldt. Sagerne kan stadig ses i listen.</p>}
  </>
}
