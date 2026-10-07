import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { codeMatchesDigest, SCREEN_LOCK_DIGEST } from '../lib/screen-lock'

export function LocalLogin({ onLogin }: { onLogin: () => void }) {
  const [code, setCode] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const checking = useRef(false)
  const input = useRef<HTMLInputElement>(null)

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (checking.current) return
    checking.current = true
    setPending(true)
    setError('')
    try {
      if (await codeMatchesDigest(code, SCREEN_LOCK_DIGEST)) {
        setCode('')
        onLogin()
      } else {
        setError('Koden er forkert. Prøv igen.')
        input.current?.focus()
        input.current?.select()
      }
    } catch {
      setError('Browseren kunne ikke kontrollere koden. Åbn siden via HTTPS i en opdateret browser, og prøv igen.')
    } finally {
      checking.current = false
      setPending(false)
    }
  }

  return <main className="shell">
    <header className="topbar"><div className="brand"><strong>NRGi</strong><span>Salgskort</span></div></header>
    <section className="shared-login">
      <h1>Log ind på Salgskort</h1>
      <p>Indtast den fælles kode for at åbne kortet.</p>
      <form onSubmit={login}>
        <label htmlFor="screen-code">Adgangskode</label>
        <input ref={input} id="screen-code" type="password" autoComplete="current-password" required
          maxLength={512} value={code} onChange={event => setCode(event.target.value)}
          readOnly={pending} aria-invalid={Boolean(error)} aria-describedby={error ? 'screen-code-error screen-lock-help' : 'screen-lock-help'} />
        {error && <p id="screen-code-error" className="login-error" role="alert">{error}</p>}
        <button className="file-button" type="submit" disabled={pending}>{pending ? 'Logger ind…' : 'Log ind'}</button>
        {pending && <p role="status">Kontrollerer koden…</p>}
      </form>
      <p>Du skal logge ind igen, når siden genindlæses. Excel-filer deles ikke med andre; din gemte import bliver i denne browser.</p>
      <p id="screen-lock-help"><strong>Enkel skærmlås, ikke sikker adgangsbeskyttelse.</strong> Låsen kan omgås og beskytter ikke browserens gemte data eller en server. Brug ikke en delt computer til fortrolige sager.</p>
    </section>
  </main>
}
