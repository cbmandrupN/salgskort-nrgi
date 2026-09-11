import type { WatchState } from '../lib/file-watch'

interface Props {
  supported: boolean
  picking: boolean
  disabled: boolean
  state: WatchState | null
  pickerError: string
  onConnect: () => void
  onPause: () => void
  onResume: () => void
  onRefresh: () => void
}
const clock = new Intl.DateTimeFormat('da-DK', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

export function AutoImport({ supported, picking, disabled, state, pickerError, onConnect, onPause, onResume, onRefresh }: Props) {
  const label = state?.phase === 'checking' ? 'Kontrollerer filen…'
    : state?.phase === 'watching' ? 'Autoimport er aktiv'
      : state?.phase === 'paused' ? 'Autoimport er sat på pause'
        : state?.phase === 'error' ? 'Autoimport kunne ikke opdatere' : 'Lad kortet følge Excel-filen'

  return <section className="auto-import" aria-label="Automatisk Excel-import">
    <div className="auto-import-copy">
      <strong role="status" aria-live="polite">{label}</strong>
      <p>{supported
        ? state
          ? 'Kortet tjekker for gemte ændringer hvert minut og når du vender tilbage til fanen. OneDrive skal fortsat synkronisere filen.'
          : 'Originalen bliver i SharePoint. Synkroniser filen med OneDrive, og tilslut den lokale kopi her. Kortet tjekker den hvert minut.'
        : 'Automatisk filadgang kræver Edge eller Chrome på en computer. Brug Åbn Excel-fil til manuel import i denne browser.'}</p>
      {state && <p className="auto-import-times">
        Sidst kontrolleret: {state.checkedAt ? clock.format(state.checkedAt) : 'endnu ikke'}
        {state.modifiedAt !== undefined && <> · Fil gemt: {new Date(state.modifiedAt).toLocaleString('da-DK')}</>}
      </p>}
    </div>
    <div className="auto-import-actions">
      {supported && <button className="file-button" disabled={disabled || picking} onClick={onConnect}>
        {picking ? 'Vælg fil…' : state ? 'Tilslut fil igen' : 'Tilslut autoimport'}
      </button>}
      {state && <>
        <button className="secondary-button" disabled={picking || disabled}
          onClick={state.phase === 'paused' ? onResume : onPause}>
          {state.phase === 'paused' ? 'Genoptag' : 'Pause'}
        </button>
        <button className="secondary-button" disabled={picking || disabled || state.phase === 'checking' || state.phase === 'paused'} onClick={onRefresh}>
          Tjek nu
        </button>
      </>}
    </div>
    {pickerError && <p className="auto-import-error" role="alert">{pickerError} Den nuværende visning er uændret.</p>}
    {state?.message && <p className="auto-import-error" role="alert">
      {state.message} Eventuelle viste sager er fra sidste vellykkede indlæsning og kan være forældede.
      {state.phase === 'paused' ? ' Genoptag eller tilslut filen igen.' : ' Der prøves igen om cirka et minut.'}
    </p>}
    {state?.phase === 'paused' && <p className="auto-import-note">Data opdateres ikke, før du vælger Genoptag.</p>}
    <details className="auto-import-help">
      <summary>Sådan følger kortet SharePoint uden en ny IT-opsætning</summary>
      <ol>
        <li>Åbn dokumentbiblioteket i SharePoint. Vælg Tilføj genvej til OneDrive eller Synkroniser med din eksisterende arbejdslogin.</li>
        <li>Find Salgsliste.xlsx i Stifinder under OneDrive. Vælg Behold altid på denne enhed, og vent på, at OneDrive er færdig.</li>
        <li>Vælg Tilslut autoimport her og åbn netop den synkroniserede fil — ikke en gammel kopi i Downloads.</li>
      </ol>
      <p>Filen læses kun i din browser. Kortet kan ikke kontrollere, om OneDrive er ajour, eller hente ændringer før de er gemt lokalt.
        Hold fanen og computeren åbne; baggrundsfaner kan blive forsinket. Efter genindlæsning vælger du filen igen.
        Hvis jeres politik blokerer synkronisering, kan denne løsning ikke omgå det.</p>
    </details>
  </section>
}
