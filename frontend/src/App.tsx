import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { ApiResponse, Case, CaseStatus } from './types/cases'
import { fetchCases } from './lib/api'
import { DEFAULT_DEPARTMENT, matchesDepartment } from './lib/departments'
import { CaseMap } from './components/CaseMap'
import { AdvisorBar } from './components/AdvisorBar'
import { advisorNames, buildingAdvisors, caseAdvisors, hasAdvisor, MISSING_ADVISOR } from './lib/advisors'
import { hasPosition, locationKey } from './lib/map-groups'
import { readWorkbookFile } from './lib/read-workbook-file'
import { loadSavedImport, removeSavedImport, saveImport } from './lib/saved-import'

const statusLabels: Record<CaseStatus, string> = {
  ny: 'Ny', i_gang: 'I gang', tilbud_sendt: 'Tilbud sendt', vundet: 'Vundet',
  tabt: 'Tabt', afventer: 'Afventer', delvist_faerdig: 'Delvist færdig',
  rapport_sendt: 'Rapport sendt', fuldfoert: 'Fuldført', lukket: 'Lukket i BC',
}
const currency = new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK', maximumFractionDigits: 0 })
const dateTime = new Intl.DateTimeFormat('da-DK', { dateStyle: 'medium', timeStyle: 'short' })

export default function App() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [fileName, setFileName] = useState('')
  const [restoreFailed, setRestoreFailed] = useState(false)
  const [selected, setSelected] = useState<Case | null>(null)
  const [search, setSearch] = useState('')
  const [advisor, setAdvisor] = useState('')
  const [department, setDepartment] = useState(DEFAULT_DEPARTMENT)
  const [status, setStatus] = useState('')
  const [unresolvedOnly, setUnresolvedOnly] = useState(false)
  const [area, setArea] = useState('')
  const revision = useRef(0)

  useEffect(() => {
    let active = true
    const current = revision.current
    loadSavedImport().catch(reason => {
      if (active && current === revision.current) setRestoreFailed(true)
      throw new Error(`${reason instanceof Error ? reason.message : 'Lokal lagring kunne ikke åbnes.'} Den gemte fil kunne ikke gendannes. Vælg filen igen, eller fjern den gemte kopi.`)
    }).then(async saved => {
      if (!active || current !== revision.current) return
      if (saved) {
        setData(saved.data)
        setFileName(saved.fileName)
      } else {
        const result = await fetchCases()
        if (active && current === revision.current) setData(result)
      }
    }).catch(reason => {
      if (active && current === revision.current) setError(reason instanceof Error ? reason.message : 'Sagerne kunne ikke hentes.')
    }).finally(() => {
      if (active && current === revision.current) setLoading(false)
    })
    return () => { active = false }
  }, [])

  function resetFilters() {
    setSearch(''); setAdvisor(''); setDepartment(DEFAULT_DEPARTMENT); setStatus('')
    setUnresolvedOnly(false); setArea(''); setSelected(null)
  }

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    revision.current++
    setLoading(false)
    setImporting(true)
    setError('')
    try {
      const result = await readWorkbookFile(file)
      try {
        await saveImport(file.name, result)
      } catch (reason) {
        throw new Error(`Filen kunne ikke gemmes i browseren. ${reason instanceof Error ? reason.message : 'Kontrollér browserens lagerplads og tilladelse til at gemme webstedsdata.'}`)
      }
      setData(result)
      setFileName(file.name)
      setRestoreFailed(false)
      resetFilters()
    } catch (reason) {
      setError(`${reason instanceof Error ? reason.message : 'Filen kunne ikke indlæses.'} Den nye fil er ikke indlæst. Den tidligere kopi er uændret. Vælg filen igen for at prøve på ny.`)
    } finally {
      setImporting(false)
    }
  }

  async function closeFile() {
    const current = ++revision.current
    setError('')
    setLoading(true)
    setRemoving(true)
    try {
      await removeSavedImport()
    } catch (reason) {
      setError(`Den gemte fil kunne ikke fjernes. ${reason instanceof Error ? reason.message : 'Kontrollér browserens tilladelse til lokal lagring.'} Prøv igen; filen er stadig gemt.`)
      setLoading(false)
      setRemoving(false)
      return
    }
    setData(null); setFileName(''); setRestoreFailed(false); resetFilters()
    try {
      const result = await fetchCases()
      if (current === revision.current) setData(result)
    } catch (reason) {
      if (current === revision.current) setError(reason instanceof Error ? reason.message : 'Sagerne kunne ikke hentes.')
    } finally {
      if (current === revision.current) setLoading(false)
      setRemoving(false)
    }
  }

  const departmentCases = useMemo(() => data?.cases.filter(c => matchesDepartment(c, department)) ?? [], [data, department])
  const buildings = useMemo(() => data?.cases.filter(c => matchesDepartment(c, DEFAULT_DEPARTMENT)) ?? [], [data])
  const advisors = useMemo(() => buildingAdvisors(buildings), [buildings])
  const missingAdvisors = buildings.filter(c => !advisorNames(c.advisor).length).length
  function selectAdvisor(key: string) {
    setAdvisor(key); setDepartment(DEFAULT_DEPARTMENT); setArea(''); setSelected(null)
    if (!buildings.some(c => c.status === status)) setStatus('')
  }
  const placedCount = departmentCases.filter(hasPosition).length
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('da-DK')
    return departmentCases.filter(c =>
      (!needle || [c.customer_name, c.address_raw, c.case_number, c.postal_code].join(' ').toLocaleLowerCase('da-DK').includes(needle)) &&
      (!advisor || (advisor === MISSING_ADVISOR ? !advisorNames(c.advisor).length : hasAdvisor(c, advisor))) &&
      (!status || c.status === status) && (!unresolvedOnly || !hasPosition(c))
    )
  }, [departmentCases, search, advisor, status, unresolvedOnly])
  const visible = area ? filtered.filter(c => locationKey(c) === area) : filtered
  const detail = selected && visible.some(c => c.id === selected.id) ? selected : null
  const departments = [...new Set(data?.cases.flatMap(c => c.department ? [c.department] : []))].sort((a, b) => a.localeCompare(b, 'da'))
  const availableStatuses = [...new Set(departmentCases.flatMap(c => c.status ? [c.status] : []))]
  const local = data?.meta.data_source === 'local'
  const demo = data?.meta.data_source === 'demo'
  const shownIssues = data?.issues.filter(issue => visible.some(c => c.source_row === issue.row_number)) ?? []

  return <main className="shell">
    <header className="topbar">
      <a className="brand" href="#overview" aria-label="Salgskort, overblik"><strong>NRGi</strong><span>Salgskort</span></a>
      <span className="source-pill">{local ? 'LOKAL EXCEL' : demo ? 'DEMO' : data ? 'LIVE DATA' : 'INGEN DATA'}</span>
    </header>

    <section className="intro" id="overview">
      <div><h1>Sager i Danmark</h1><p>Overblik til rådgivere i Bygninger. Vælg rådgiver for at finde dine sager.</p></div>
      {data && <p className="sync">{local ? 'Indlæst lokalt' : demo ? 'Eksempeldata fra' : 'Sidst synkroniseret'}<br/>
        <strong>{dateTime.format(new Date(data.meta.fetched_at))}</strong></p>}
    </section>

    <section className="import-bar" aria-label="Indlæs dit salgsark">
      <div className="import-copy">
        <strong>{fileName || 'Åbn den seneste Salgsliste.xlsx'}</strong>
        <p>{local ? 'Gemt i denne browser og klar næste gang. Vælg Skift Excel-fil, når du har en nyere version.' : 'Download den seneste fil fra SharePoint, og åbn den her. Sagerne gemmes kun i denne browser.'}</p>
        <p>Ikke delt med kolleger. Brug kun din egen browserprofil på en betroet computer.</p>
      </div>
      <label className={`file-button${importing || removing ? ' disabled' : ''}`}>
        <input className="visually-hidden" type="file" accept=".xlsx" aria-label="Åbn Excel-fil"
          disabled={importing || removing} onChange={onFileChange} />
        {importing ? 'Indlæser…' : local ? 'Skift Excel-fil' : 'Åbn Excel-fil'}
      </label>
      {(local || restoreFailed) && <button className="secondary-button" disabled={importing || loading} onClick={closeFile}>Fjern gemt fil</button>}
    </section>

    {error && <section className="error-banner" role="alert"><strong>Data kunne ikke opdateres</strong><p>{error}</p></section>}
    {(loading || importing) && <section className="loading-state" role="status" aria-live="polite">
      <div className="skeleton" /><p>{importing ? 'Læser og gemmer Excel-sagerne i denne browser…' : 'Henter oversigten…'}</p>
    </section>}
    {!data && !loading && !importing && <section className="empty-state"><h2>Åbn dit salgsark for at komme i gang</h2><p>Vælg en .xlsx-fil med fanen Opgaver. Sagerne bliver kun i din browser.</p></section>}

    {data && <>
      <p className="data-notice">{local
        ? `Kortet viser postnummerområder, ikke præcise adresser. ${data.meta.template_rows_skipped || 0} skabelonrækker uden sagsoplysninger er udeladt.`
        : demo ? 'Demo med fiktive sager og omtrentlige placeringer. Ingen SharePoint-data.' : 'Sager hentet fra den konfigurerede backend.'}</p>
      <section className="kpis" aria-label="Nøgletal">
        <article><span>{department === DEFAULT_DEPARTMENT ? 'Sager i Bygninger' : department ? 'Sager i afdelingen' : local ? 'Sager i arket' : 'Alle sager'}</span><b>{departmentCases.length}</b></article>
        <article><span>{local ? 'Placeret efter postnr.' : 'Placeret på kort'}</span><b>{placedCount}</b></article>
        <article><span>Uden placering</span><b>{departmentCases.length - placedCount}</b></article>
        <article><span>Viser nu</span><b aria-live="polite">{visible.length}</b></article>
      </section>
      <section className="toolbar" aria-label="Filtrér sager">
        <label className="search"><span>Søg</span><input type="search" placeholder="Virksomhed, adresse eller projektnr."
          value={search} onChange={e => { setSearch(e.target.value); setArea('') }} /></label>
        <label><span>Afdeling</span><select aria-label="Afdeling" value={department} onChange={e => {
          setDepartment(e.target.value); setAdvisor(''); setStatus(''); setArea(''); setSelected(null)
        }}>
          <option value={DEFAULT_DEPARTMENT}>Bygninger (alle)</option>
          <option value="">Alle afdelinger</option>{departments.map(d => <option key={d}>{d}</option>)}
          {data.cases.some(c => !c.department) && <option value="__missing">Ikke angivet</option>}
        </select></label>
        <label><span>Status</span><select aria-label="Status" value={status} onChange={e => { setStatus(e.target.value); setArea('') }}>
          <option value="">Alle statusser</option>{availableStatuses.map(s => <option key={s} value={s}>{statusLabels[s]}</option>)}
        </select></label>
        <button className="text-button" onClick={resetFilters}>Nulstil</button>
      </section>
      <div className="list-options">
        <label><input type="checkbox" checked={unresolvedOnly} onChange={e => { setUnresolvedOnly(e.target.checked); setArea('') }} /> Kun uden placering</label>
        {area && <button className="text-button" onClick={() => { setArea(''); setSelected(null) }}>Vis alle områder ×</button>}
        <span>{visible.length} af {departmentCases.length} sager i den valgte afdeling</span>
      </div>
      <AdvisorBar advisors={advisors} selected={department === DEFAULT_DEPARTMENT ? advisor : null}
        total={buildings.length} missing={missingAdvisors} onSelect={selectAdvisor} />
      <section className="workspace">
        <div className="map-wrap" aria-label="Kort over sager">
          <CaseMap cases={filtered} advisors={advisors} onAreaClick={key => { setArea(key); setSelected(null) }} />
          {!filtered.some(hasPosition) && <p className="map-notice">Ingen af de filtrerede sager har en placering.</p>}
        </div>
        <aside className="side-panel" aria-label="Sagsliste og detaljer">
          <div className="panel-head"><h2>{detail ? 'Sagsdetaljer' : area ? 'Sager i området' : 'Sager'}</h2><span>{visible.length}</span></div>
          {detail ? <div className="detail">
            <button className="text-button" onClick={() => setSelected(null)}>← Tilbage til listen</button>
            <p className="case-number">{detail.case_number || `Række ${detail.source_row}`}</p>
            <h3>{detail.customer_name || 'Virksomhed ikke angivet'}</h3>
            <p>{detail.address_raw || 'Adresse ikke angivet'}</p>
            <dl>
              <dt>Rådgiver</dt><dd>{caseAdvisors(detail, advisors).map(a => <span className="advisor-swatch" key={a.key} title={a.name} style={{ backgroundColor: a.color }} aria-hidden="true" />)} {detail.advisor || 'Ikke angivet'}</dd>
              <dt>Afdeling</dt><dd>{detail.department || 'Ikke angivet'}</dd>
              <dt>Status</dt><dd>{detail.status ? statusLabels[detail.status] : 'Ikke angivet'}</dd>
              {detail.status_basis && <><dt>Statusgrundlag</dt><dd>{detail.status_basis}</dd></>}
              <dt>Beløb</dt><dd>{detail.estimated_value_dkk !== undefined ? currency.format(detail.estimated_value_dkk) : 'Ikke angivet'}</dd>
              {local && <><dt>Faktureret</dt><dd>{detail.invoiced === true ? 'Ja' : detail.invoiced === false ? 'Nej' : 'Ikke angivet'}</dd></>}
              {detail.product_type && <><dt>Produkt</dt><dd>{detail.product_type}</dd></>}
              <dt>Placering</dt><dd>{hasPosition(detail) ? local ? `Postnummerområde ${detail.postal_code} ${detail.city || ''}` : 'På kortet' : 'Ikke placeret'}</dd>
              <dt>Kilderække</dt><dd>{detail.source_row}</dd>
            </dl>
          </div> : <div className="case-list">
            {visible.map(c => <button className="case-row" key={c.id} onClick={() => setSelected(c)}>
              <span><strong>{c.customer_name || 'Virksomhed ikke angivet'}</strong>
                <small>{c.address_raw || 'Adresse ikke angivet'}</small>
                <small>{caseAdvisors(c, advisors).map(a => <span className="advisor-swatch" key={a.key} title={a.name} style={{ backgroundColor: a.color }} aria-hidden="true" />)} {c.advisor || 'Rådgiver mangler'} · {c.status ? statusLabels[c.status] : 'Status mangler'}{!hasPosition(c) ? ' · Uden placering' : ''}</small>
              </span><span aria-hidden="true">›</span>
            </button>)}
            {!visible.length && <div className="empty-state"><h3>Ingen sager matcher</h3><button className="text-button" onClick={resetFilters}>Nulstil filtrene</button></div>}
          </div>}
          {shownIssues.length > 0 && <details className="issues"><summary>{shownIssues.length} bemærkninger til de viste sager</summary>
            <ul>{shownIssues.map((issue, index) => <li key={`${issue.row_number}-${index}`}>
              <button className="text-button" onClick={() => setSelected(data.cases.find(c => c.source_row === issue.row_number) || null)}>Række {issue.row_number}</button>: {issue.message}
            </li>)}</ul>
          </details>}
        </aside>
      </section>
      <footer className="footnote">Excel-import: gemt lokalt i denne browser · Ingen kundeoplysninger sendes til geokodning · Baggrundskort: OpenStreetMap · Postnummercentre: DAWA/Dataforsyningen</footer>
    </>}
  </main>
}
