import { useState } from 'react'
import type { FormEvent } from 'react'
import { fetchSharedSnapshot } from '../lib/shared-api'
import type { SharedSession } from '../lib/shared-api'

export function SharedLogin({ onLogin }: { onLogin: (session: SharedSession) => void }) {
  const [accessCode, setAccessCode] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true); setError('')
    try {
      const snapshot = await fetchSharedSnapshot(accessCode)
      onLogin({ accessCode, snapshot })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Login mislykkedes. Prøv igen.')
    } finally { setPending(false) }
  }
  return <main className="shell">
    <header className="topbar"><div className="brand"><strong>NRGi</strong><span>Salgskort</span></div><span className="source-pill">FÆLLES KORT</span></header>
    <section className="shared-login">
      <h1>Bygningers fælles salgskort</h1>
      <p>Én indlæser den seneste Excel-fil. Alle på teamet ser samme sager via dette link.</p>
      <form onSubmit={login}>
        <label htmlFor="team-code">Fælles adgangskode</label>
        <input id="team-code" type="password" autoComplete="current-password" required maxLength={512}
          value={accessCode} onChange={event => setAccessCode(event.target.value)} disabled={pending}
          aria-describedby="team-code-help" />
        <p id="team-code-help">Få koden fra den ansvarlige for kortet. Alle med koden kan se og erstatte de fælles Bygninger-sager.</p>
        {error && <p className="login-error" role="alert">{error}</p>}
        <button className="file-button" type="submit" disabled={pending}>{pending ? 'Logger ind…' : 'Åbn fælles kort'}</button>
        {pending && <p role="status">Kontrollerer adgang og henter seneste fælles kopi…</p>}
      </form>
      <p>Koden og sagerne gemmes ikke i browserens permanente lager. Log ud, når du er færdig på en delt computer.</p>
    </section>
  </main>
}
