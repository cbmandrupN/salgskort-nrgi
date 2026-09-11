import { useEffect, useMemo, useState } from 'react'
import { divIcon } from 'leaflet'
import { Marker, MapContainer, TileLayer, Tooltip, useMap } from 'react-leaflet'
import type { Case } from '../types/cases'
import type { Advisor } from '../lib/advisors'
import { groupCases, hasPosition, markerBackground } from '../lib/map-groups'

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

export function CaseMap({ cases, advisors, onAreaClick }: { cases: Case[]; advisors: Advisor[]; onAreaClick: (key: string) => void }) {
  const [tileError, setTileError] = useState(false)
  const [mapStyle, setMapStyle] = useState('quiet')
  const groups = useMemo(() => {
    return groupCases(cases, advisors).map(group => {
      const size = Math.min(54, 32 + Math.sqrt(group.count) * 3)
      return { ...group, icon: divIcon({
        className: 'advisor-map-marker',
        iconSize: [size, size], iconAnchor: [size / 2, size / 2],
        // Only generated colors and numeric counts enter Leaflet's HTML.
        html: `<span class="advisor-marker-ring" style="background:${markerBackground(group)}"><span class="advisor-marker-count">${group.count}</span></span>`,
      }) }
    })
  }, [cases, advisors])
  return <div className={`map-surface${mapStyle === 'quiet' ? ' map-surface--quiet' : ''}`}>
    <MapContainer center={[56.1, 10.3]} zoom={7} scrollWheelZoom={false}>
      <TileLayer url={import.meta.env.VITE_MAP_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        eventHandlers={{ tileerror: () => setTileError(true) }} />
      <FitBounds cases={cases} />
      {groups.map(group => <Marker key={`${group.key}:${group.advisors.map(a => `${a.key}:${a.count}`).join('|')}`}
        position={[group.latitude, group.longitude]} icon={group.icon}
        title={`${group.label}: ${group.count} sager. ${group.advisors.map(a => `${a.name}: ${a.count}`).join(', ')}`}
        eventHandlers={{
          click: () => onAreaClick(group.key),
          keydown: event => {
            if (event.originalEvent.key === 'Enter' || event.originalEvent.key === ' ') {
              event.originalEvent.preventDefault()
              onAreaClick(group.key)
            }
          },
        }}>
        <Tooltip direction="top" className="advisor-map-tooltip">
          <strong>{group.label} · {group.count} sager</strong>
          {group.advisors.map(a => <span className="advisor-tooltip-row" key={a.key}>
            <span className="advisor-swatch" style={{ backgroundColor: a.color }} aria-hidden="true" />
            {a.name}: {a.count}
          </span>)}
        </Tooltip>
      </Marker>)}
    </MapContainer>
    <label className="map-style-control">
      <span>Baggrund</span>
      <select aria-label="Baggrundskort" value={mapStyle} onChange={event => setMapStyle(event.target.value)}>
        <option value="quiet">Afdæmpet</option>
        <option value="standard">Standard</option>
      </select>
    </label>
    <p className="map-color-note">Flere farver = flere rådgivere i området. Grå = uden rådgiver eller andre afdelinger.</p>
    {tileError && <p className="tile-warning" role="status">Baggrundskortet kunne ikke hentes fuldt. Sagerne kan stadig ses i listen.</p>}
  </div>
}
