import type { ReactNode } from 'react'
import { CASPER_PINK, MISSING_ADVISOR, UNASSIGNED_COLOR } from '../lib/advisors'
import type { Advisor } from '../lib/advisors'

export function AdvisorBar({ advisors, selected, scopeLabel, total, missing, onSelect, children }: {
  advisors: Advisor[]
  selected: string | null
  scopeLabel: string
  total: number
  missing: number
  onSelect: (key: string) => void
  children?: ReactNode
}) {
  return <section className="advisor-bar" aria-labelledby="advisor-heading">
    <div className="advisor-bar-heading">
      <h2 id="advisor-heading">Rådgivere i {scopeLabel}</h2>
      {children && <div className="advisor-bar-extra">{children}</div>}
    </div>
    <div className="advisor-buttons" role="group" aria-label={`Vælg rådgiver i ${scopeLabel}`}>
      <button className="advisor-button" aria-pressed={selected === ''} onClick={() => onSelect('')}>
        <span>{scopeLabel === 'alle afdelinger' ? 'Alle rådgivere' : `Alle i ${scopeLabel}`}</span><span className="advisor-count">{total}<span className="visually-hidden"> sager</span></span>
        {selected === '' && <span aria-hidden="true">✓</span>}
      </button>
      {advisors.map(a => <button className="advisor-button" key={a.key}
        aria-pressed={selected === a.key} onClick={() => onSelect(selected === a.key ? '' : a.key)}>
        <span className="advisor-swatch" style={{ backgroundColor: a.color }} aria-hidden="true" />
        <span>{a.name}</span>
        <span className="advisor-count">{a.count}<span className="visually-hidden"> sager</span></span>
        {a.color === CASPER_PINK && <span className="visually-hidden">, pink</span>}
        {selected === a.key && <span aria-hidden="true">✓</span>}
      </button>)}
      {missing > 0 && <button className="advisor-button" aria-pressed={selected === MISSING_ADVISOR}
        onClick={() => onSelect(selected === MISSING_ADVISOR ? '' : MISSING_ADVISOR)}>
        <span className="advisor-swatch" style={{ backgroundColor: UNASSIGNED_COLOR }} aria-hidden="true" />
        <span>Rådgiver ikke angivet</span><span className="advisor-count">{missing}<span className="visually-hidden"> sager</span></span>
        {selected === MISSING_ADVISOR && <span aria-hidden="true">✓</span>}
      </button>}
    </div>
    {!advisors.some(a => a.count > 0) && <p className="advisor-empty">Ingen sager med navngivne rådgivere i {scopeLabel} i den indlæste fil.</p>}
  </section>
}
