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
import { SharedLogin } from './components/SharedLogin'
import { LocalLogin } from './components/LocalLogin'
import { fetchSharedSnapshot, publishSharedSnapshot } from './lib/shared-api'
import type { SharedSession } from './lib/shared-api'
import { caseInspection, caseSalesMonth, caseSheetStatus, caseSortLabels, inspectionLabels, inspectionOptions, matchesSalesFilters,
  PROGRESS_ORDER, salesMonthLabel, salesMonthOptions, sheetStatusLabels, sheetStatusOptions, sortCases, todayIso } from './lib/sales-filters'
import type { CaseSort } from './lib/sales-filters'

const statusLabels: Record<CaseStatus, string> = {
  ny: 'Ny', i_gang: 'I gang', tilbud_sendt: 'Tilbud sendt', vundet: 'Vundet',
  tabt: 'Tabt', afventer: 'Afventer', delvist_faerdig: 'Delvist færdig',
  rapport_sendt: 'Rapport sendt', fuldfoert: 'Fuldført', lukket: 'Lukket i BC',
}
const currency = new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK', maximumFractionDigits: 0 })
const dateTime = new Intl.DateTimeFormat('da-DK', { dateStyle: 'medium', timeStyle: 'short' })
const shortDate = new Intl.DateTimeFormat('da-DK', { dateStyle: 'medium', timeZone: 'UTC' })

export default function App() {
  const [session, setSession] = useState<SharedSession | null>(null)
  const [unlocked, setUnlocked] = useState(false)
  if (import.meta.env.VITE_SHARED_MODE === 'true') {
    return session ? <Dashboard sharedSession={session} onSignOut={() => setSession(null)} /> : <SharedLogin onLogin={setSession} />
  }
  return unlocked ? <Dashboard onSignOut={() => setUnlocked(false)} /> : <LocalLogin onLogin={() => setUnlocked(true)} />
}

function Dashboard({ sharedSession, onSignOut }: { sharedSession?: SharedSession; onSignOut?: () => void }) {
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
  const [salesMonth, setSalesMonth] = useState('')
  const [sheetStatus, setSheetStatus] = useState('')
  const [inspection, setInspection] = useState('')
  const [sort, setSort] = useState<CaseSort>('sale_desc')

  const [area, setArea] = useState('')
  const revision = useRef(0)
  const sharedRevision = useRef(0)
  const shared = Boolean(sharedSession)

  useEffect(() => {
    if (sharedSession) {
      setData(sharedSession.snapshot.data)
      setFileName(sharedSession.snapshot.file_name || '')
      sharedRevision.current = sharedSession.snapshot.revision
      setLoading(false)
      return
    }
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
  }, [sharedSession])

  function resetFilters() {
    setSearch(''); setAdvisor(''); setDepartment(DEFAULT_DEPARTMENT); setStatus('')
    setSalesMonth(''); setSheetStatus(''); setInspection('')
    setArea(''); setSelected(null)
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
      if (sharedSession) {
        const snapshot = await publishSharedSnapshot(sharedSession.accessCode, sharedRevision.current, file.name, result)
        sharedRevision.current = snapshot.revision
        setData(snapshot.data)
        setFileName(snapshot.file_name)
      } else {
        try {
          await saveImport(file.name, result)
        } catch (reason) {
          throw new Error(`Filen kunne ikke gemmes i browseren. ${reason instanceof Error ? reason.message : 'Kontrollér browserens lagerplads og tilladelse til at gemme webstedsdata.'}`)
        }
        setData(result)
        setFileName(file.name)
      }
      setRestoreFailed(false)
      resetFilters()
    } catch (reason) {
      setError(`${reason instanceof Error ? reason.message : 'Filen kunne ikke indlæses.'} ${shared ? 'Den viste kopi er ikke opdateret. Hent seneste for at kontrollere den fælles version.' : 'Den nye fil er ikke indlæst. Den tidligere kopi er uændret. Vælg filen igen for at prøve på ny.'}`)
    } finally {
      setImporting(false)
    }
  }

  async function refreshShared() {
    if (!sharedSession) return
    setLoading(true); setError('')
    try {
      const snapshot = await fetchSharedSnapshot(sharedSession.accessCode)
      sharedRevision.current = snapshot.revision
      setData(snapshot.data); setFileName(snapshot.file_name || ''); resetFilters()
    } catch (reason) {
      setError(`${reason instanceof Error ? reason.message : 'Det fælles kort kunne ikke hentes.'} Den viste kopi er ikke opdateret.`)
    } finally { setLoading(false) }
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
  const today = todayIso()
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('da-DK')
    return departmentCases.filter(c =>
      (!needle || [c.customer_name, c.address_raw, c.case_number, c.postal_code].join(' ').toLocaleLowerCase('da-DK').includes(needle)) &&
      (!advisor || (advisor === MISSING_ADVISOR ? !advisorNames(c.advisor).length : hasAdvisor(c, advisor))) &&
      (!status || c.status === status) &&
      matchesSalesFilters(c, { month: salesMonth, sheetStatus, inspection, today })
    )
  }, [departmentCases, search, advisor, status, salesMonth, sheetStatus, inspection, today])
  const visible = useMemo(() => sortCases(area ? filtered.filter(c => locationKey(c) === area) : filtered, sort), [filtered, area, sort])
  const detail = selected && visible.some(c => c.id === selected.id) ? selected : null
  const departments = [...new Set(data?.cases.flatMap(c => c.department ? [c.department] : []))].sort((a, b) => a.localeCompare(b, 'da'))
  const presentStatuses = new Set(departmentCases.map(c => c.status))
  const availableStatuses = PROGRESS_ORDER.filter(s => presentStatuses.has(s) || s === status)
  const months = useMemo(() => salesMonthOptions(data?.cases ?? []), [data])
  const sheetStatuses = useMemo(() => sheetStatusOptions(data?.cases ?? []), [data])
  const inspections = useMemo(() => inspectionOptions(data?.cases ?? [], today), [data, today])
  const staleImport = departmentCases.some(c => !c.sheet_status && c.inspection === undefined && c.completed !== undefined)
  const local = data?.meta.data_source === 'local'
  const demo = data?.meta.data_source === 'demo'
  const shownIssues = (data?.issues.filter(issue => visible.some(c => c.source_row === issue.row_number)) ?? [])
    .sort((a, b) => a.row_number - b.row_number)

  return <main className="shell">
    <header className="topbar">
      <a className="brand" href="#overview" aria-label="Salgskort, overblik"><strong>NRGi</strong><span>Salgskort</span></a>
      <div className="session-actions">
        <span className="source-pill">{shared ? 'FÆLLES EXCEL' : local ? 'LOKAL EXCEL' : demo ? 'DEMO' : data ? 'LIVE DATA' : 'INGEN DATA'}</span>
        {onSignOut && <button className="sign-out" disabled={importing || loading || removing} onClick={onSignOut}>Log ud</button>}
      </div>
    </header>

    <h1 className="visually-hidden">Sager i Danmark</h1>
    <section className="import-bar" id="overview" aria-label="Indlæs dit salgsark">
      <p className="import-copy">
        <strong>{fileName || 'Åbn den seneste Salgsliste.xlsx'}</strong>
        {data && <span>{shared ? `Fælles kopi · version ${sharedRevision.current}` : local ? 'Indlæst' : demo ? 'Eksempeldata fra' : 'Sidst synkroniseret'} {dateTime.format(new Date(data.meta.fetched_at))}</span>}
        <span>{shared ? 'Kun Bygninger-sager deles med kolleger med adgangskoden; Excel-filen sendes ikke.'
          : local ? 'Gemt kun i denne browser – ikke delt med kolleger.'
          : 'Download filen fra SharePoint og åbn den her. Gemmes kun i denne browser.'}</span>
      </p>
      <label className={`file-button${importing || removing || (shared && loading) ? ' disabled' : ''}`}>
        <input className="visually-hidden" type="file" accept=".xlsx" aria-label="Åbn Excel-fil"
          disabled={importing || removing || (shared && loading)} onChange={onFileChange} />
        {importing ? shared ? 'Deler…' : 'Indlæser…' : shared ? 'Del ny Excel-fil' : local ? 'Skift Excel-fil' : 'Åbn Excel-fil'}
      </label>
      {shared ? <button className="secondary-button" disabled={importing || loading} onClick={refreshShared}>Hent seneste</button>
        : (local || restoreFailed) && <button className="secondary-button" disabled={importing || loading} onClick={closeFile}>Fjern gemt fil</button>}
    </section>

    {error && <section className="error-banner" role="alert"><strong>Data kunne ikke opdateres</strong><p>{error}</p></section>}
    {(loading || importing) && <section className="loading-state" role="status" aria-live="polite">
      <div className="skeleton" /><p>{importing ? shared ? 'Læser Excel og deler Bygninger-sagerne med teamet…' : 'Læser og gemmer Excel-sagerne i denne browser…' : 'Henter oversigten…'}</p>
    </section>}
    {!data && !loading && !importing && <section className="empty-state"><h2>{shared ? 'Ingen fælles sager endnu' : 'Åbn dit salgsark for at komme i gang'}</h2><p>{shared ? 'Vælg Del ny Excel-fil. Bygninger-sagerne bliver derefter tilgængelige for alle med adgang til kortet.' : 'Vælg en .xlsx-fil med fanen Opgaver. Sagerne bliver kun i din browser.'}</p></section>}

    {data && <>
      {demo && !local && <p className="data-notice">Demo med fiktive sager og omtrentlige placeringer. Ingen SharePoint-data.</p>}
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
        <label><span>Status</span><select aria-label="Status" value={sheetStatus}
          onChange={e => { setSheetStatus(e.target.value); setArea(''); setSelected(null) }}>
          <option value="">Alle</option>
          {sheetStatuses.map(s => <option key={s} value={s}>{sheetStatusLabels[s]}</option>)}
          <option value="__missing">Ikke angivet</option>
        </select></label>
        <label><span>Besigtiget</span><select aria-label="Besigtiget" value={inspection}
          onChange={e => { setInspection(e.target.value); setArea(''); setSelected(null) }}>
          <option value="">Alle</option>
          {inspections.map(s => <option key={s} value={s}>{inspectionLabels[s]}</option>)}
          <option value="__missing">Ikke angivet</option>
        </select></label>
        <label><span>Solgt i måned</span><select aria-label="Solgt i måned" value={salesMonth}
          onChange={e => { setSalesMonth(e.target.value); setArea(''); setSelected(null) }}>
          <option value="">Alle måneder</option>
          {months.map(month => <option key={month} value={month}>{salesMonthLabel(month)}</option>)}
          <option value="__missing">Ikke angivet</option>
        </select></label>
        <label><span>Fremdrift</span><select aria-label="Fremdrift" value={status} onChange={e => { setStatus(e.target.value); setArea(''); setSelected(null) }}>
          <option value="">Alle</option>{availableStatuses.map(s => <option key={s} value={s}>{statusLabels[s]}</option>)}
        </select></label>
        <button className="text-button" onClick={resetFilters}>Nulstil</button>
      </section>
      {staleImport && <p className="filter-help">Den gemte kopi er fra en ældre version af arket. Indlæs den nyeste Excel-fil for at filtrere på Status og Besigtiget.</p>}
      <AdvisorBar advisors={advisors} selected={department === DEFAULT_DEPARTMENT ? advisor : null}
        total={buildings.length} missing={missingAdvisors} onSelect={selectAdvisor}>
        {area && <button className="text-button" onClick={() => { setArea(''); setSelected(null) }}>Vis alle områder ×</button>}
        <span className="advisor-count" aria-live="polite">{visible.length} af {departmentCases.length} sager i den valgte afdeling</span>
      </AdvisorBar>
      <section className="workspace">
        <div className="map-wrap" aria-label="Kort over sager">
          <CaseMap cases={filtered} advisors={advisors} onAreaClick={key => { setArea(key); setSelected(null) }} />
          {!filtered.some(hasPosition) && <p className="map-notice">Ingen af de filtrerede sager har en placering.</p>}
        </div>
        <aside className="side-panel" aria-label="Sagsliste og detaljer">
          <div className="panel-head"><h2>{detail ? 'Sagsdetaljer' : area ? 'Sager i området' : 'Sager'}</h2><span>{visible.length}</span></div>
          {!detail && visible.length > 1 && <label className="sort-control"><span>Sortér</span>
            <select aria-label="Sortér sager" value={sort} onChange={e => setSort(e.target.value as CaseSort)}>
              {(Object.keys(caseSortLabels) as CaseSort[]).map(key => <option key={key} value={key}>{caseSortLabels[key]}</option>)}
            </select></label>}
          {detail ? <div className="detail">
            <button className="text-button" onClick={() => setSelected(null)}>← Tilbage til listen</button>
            <p className="case-number">{detail.case_number || `Række ${detail.source_row}`}</p>
            <h3>{detail.customer_name || 'Virksomhed ikke angivet'}</h3>
            <p>{detail.address_raw || 'Adresse ikke angivet'}</p>
            <dl>
              <dt>Rådgiver</dt><dd>{caseAdvisors(detail, advisors).map(a => <span className="advisor-swatch" key={a.key} title={a.name} style={{ backgroundColor: a.color }} aria-hidden="true" />)} {detail.advisor || 'Ikke angivet'}</dd>
              <dt>Afdeling</dt><dd>{detail.department || 'Ikke angivet'}</dd>
              <dt>Status</dt><dd>{caseSheetStatus(detail) ? sheetStatusLabels[caseSheetStatus(detail)!] : 'Ikke angivet'}</dd>
              <dt>Besigtiget</dt><dd>{caseInspection(detail, today) ? inspectionLabels[caseInspection(detail, today)!] : 'Ikke angivet'}
                {detail.inspection_date && ` · ${shortDate.format(new Date(`${detail.inspection_date}T00:00:00Z`))}`}</dd>
              <dt>Solgt i måned</dt><dd>{caseSalesMonth(detail) ? salesMonthLabel(caseSalesMonth(detail)!) : 'Ikke angivet'}</dd>
              <dt>Fremdrift</dt><dd>{detail.status ? statusLabels[detail.status] : 'Ikke angivet'}</dd>
              {detail.status_basis && <><dt>Fremdriftsgrundlag</dt><dd>{detail.status_basis}</dd></>}
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
                <small>{caseAdvisors(c, advisors).map(a => <span className="advisor-swatch" key={a.key} title={a.name} style={{ backgroundColor: a.color }} aria-hidden="true" />)} {c.advisor || 'Rådgiver mangler'} · {caseSheetStatus(c) ? sheetStatusLabels[caseSheetStatus(c)!] : c.status ? statusLabels[c.status] : 'Status mangler'}{caseInspection(c, today) === 'ja' ? ' · Besigtiget' : caseInspection(c, today) === 'planlagt' ? ' · Besigtigelse planlagt' : ''}{!hasPosition(c) ? ' · Uden placering' : ''}</small>
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
      <footer className="footnote">{shared ? 'Bygninger-sager: fælles, adgangsbeskyttet backend' : 'Excel-import: gemt lokalt i denne browser'} · Ingen kundeoplysninger sendes til geokodning · Baggrundskort: OpenStreetMap · Postnummercentre: DAWA/Dataforsyningen</footer>
    </>}
  </main>
}
