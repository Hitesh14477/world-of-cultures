import { useEffect, useState } from 'react'
import CountryFlag from '../components/CountryFlag.jsx'
import PasswordField from '../components/PasswordField.jsx'
import SourceReferences from '../components/SourceReferences.jsx'
import FactualClaims from '../components/FactualClaims.jsx'
import {
  adminLogin,
  approveSubmission,
  fetchPendingSubmission,
  fetchPendingSubmissions,
  rejectSubmission,
} from '../services/api.js'

function messageFrom(error, fallback) {
  return error.response?.data?.message || fallback
}

function SubmissionList({ title, items, selected, onSelect }) {
  return <section className="admin-queue-section">
    <h2>{title} <span>{items.length}</span></h2>
    {items.length === 0 && <p className="admin-muted">Nothing is waiting in this queue.</p>}
    <ul className="admin-queue">
      {items.map(({ type, record }) => {
        const id = String(record._id)
        const isSelected = selected?.type === type && selected?.id === id
        return <li key={`${type}-${id}`}>
          <button type="button" className={isSelected ? 'is-selected' : ''} aria-current={isSelected ? 'true' : undefined} onClick={() => onSelect(type, id)}>
            <span>{record.title || record.name}</span>
            <small>{record.country?.name || 'Country'} · {type === 'places' ? 'Place' : record.category}</small>
          </button>
        </li>
      })}
    </ul>
  </section>
}

function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await adminLogin({ username, password })
      window.location.assign('/admin')
    } catch (requestError) {
      setError(messageFrom(requestError, 'Sign-in failed. Please try again.'))
    } finally {
      setBusy(false)
      setPassword('')
    }
  }

  return <main className="contribution-page admin-login-page">
    <header className="contribution-intro">
      <p className="eyebrow">Editorial access</p>
      <h1>Administrator sign in.</h1>
      <p>Sign in to review cultural entries and places submitted to World of Cultures.</p>
    </header>
    <form className="admin-login-form" onSubmit={handleSubmit}>
      {error && <p className="admin-message is-error" role="alert">{error}</p>}
      <label>Username<input autoComplete="username" required maxLength={120} value={username} onChange={(event) => setUsername(event.target.value)} disabled={busy} /></label>
      <PasswordField
        id="admin-password"
        label="Password"
        autoComplete="current-password"
        required
        maxLength={1024}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        disabled={busy}
      />
      <button className="contribution-submit" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}<span aria-hidden="true">→</span></button>
    </form>
  </main>
}

function ReviewDetail({ item, csrfToken, onComplete, busy, setBusy, setMessage }) {
  const [detail, setDetail] = useState(null)
  const [state, setState] = useState('loading')
  const [reason, setReason] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    fetchPendingSubmission(item.type, item.id, { signal: controller.signal })
      .then((data) => { setDetail(data); setState('ready') })
      .catch((error) => {
        if (controller.signal.aborted) return
        setState('error')
        setMessage(messageFrom(error, 'Submission details could not be loaded.'))
      })
    return () => controller.abort()
  }, [item, setMessage])

  async function decide(action) {
    if (!detail || busy) return
    const record = detail.record
    const label = record.title || record.name
    const confirmation = action === 'approve'
      ? `Publish “${label}”? This will make it visible to visitors.`
      : `Reject “${label}”? It will remain hidden from visitors.`
    if (!window.confirm(confirmation)) return
    setBusy(true)
    setMessage('')
    try {
      const response = action === 'approve'
        ? await approveSubmission(item.type, item.id, csrfToken)
        : await rejectSubmission(item.type, item.id, csrfToken, reason)
      setMessage(response.message || 'Review decision saved.')
      onComplete(item)
    } catch (error) {
      setMessage(messageFrom(error, 'The review decision could not be saved.'))
    } finally {
      setBusy(false)
    }
  }

  if (state === 'loading') return <p className="admin-muted" role="status">Loading submission details…</p>
  if (state === 'error') return <p className="admin-muted" role="alert">The selected submission could not be loaded. Select it again to retry.</p>
  const record = detail.record
  const country = record.country || {}

  return <article className="admin-review-detail">
    <p className="eyebrow">{item.type === 'places' ? 'Place submission' : `Cultural entry · ${record.category}`}</p>
    <div className="admin-review-country">
      {country.name && <CountryFlag country={country} className="admin-review-flag" />}
      <span>{country.name || 'Country unavailable'}</span>
    </div>
    <h2>{record.title || record.name}</h2>
    {record.summary && <p className="admin-review-summary">{record.summary}</p>}
    {record.category && item.type === 'places' && <p className="admin-muted">Type: {record.category.replaceAll('_', ' ')}</p>}
    {record.region && <p className="admin-muted">Region: {record.region}</p>}
    {record.location && <p className="admin-muted">Location: {record.location}</p>}
    <p className="admin-review-content">{record.content || record.description}</p>
    {record.image?.url && <figure className="contribution-published-image admin-contribution-image"><img src={record.image.url} alt={record.image.caption || record.title || record.name} />{record.image.caption && <figcaption>{record.image.caption}</figcaption>}</figure>}
    <FactualClaims facts={record.facts} />
    <section className="record-source-section">
      <h3>References and attribution</h3>
      <SourceReferences sources={record.sources} imageAttributions={record.imageAttributions} />
    </section>
    <label className="admin-rejection-reason">Rejection reason <span>(optional)</span>
      <textarea rows="3" maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy} />
    </label>
    <div className="admin-review-actions">
      <button type="button" className="admin-reject-button" disabled={busy} onClick={() => decide('reject')}>{busy ? 'Saving…' : 'Reject'}</button>
      <button type="button" className="contribution-submit" disabled={busy} onClick={() => decide('approve')}>{busy ? 'Saving…' : 'Approve and publish'}<span aria-hidden="true">→</span></button>
    </div>
  </article>
}

function DashboardPage({ auth }) {
  const session = auth.session
  const sessionState = auth.status === 'loading' ? 'loading' : auth.status === 'error' ? 'error' : session ? 'ready' : 'unauthorized'
  const [queue, setQueue] = useState({ culturalEntries: [], places: [] })
  const [queueState, setQueueState] = useState('loading')
  const [selected, setSelected] = useState(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (!session) return undefined
    const controller = new AbortController()
    fetchPendingSubmissions({ signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return
        setQueue(data || { culturalEntries: [], places: [] })
        setQueueState('ready')
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setQueueState('error')
        setMessage(messageFrom(error, 'The review queue could not be loaded.'))
      })
    return () => controller.abort()
  }, [session, retry])

  function removeReviewed(item) {
    setQueue((current) => ({
      culturalEntries: current.culturalEntries.filter(({ type, record }) => !(type === item.type && String(record._id) === item.id)),
      places: current.places.filter(({ type, record }) => !(type === item.type && String(record._id) === item.id)),
    }))
    setSelected(null)
  }

  if (sessionState === 'loading') return <main className="contribution-page"><p role="status">Checking administrator session…</p></main>
  if (sessionState === 'unauthorized') return <main className="contribution-page"><div className="admin-message"><h1>Sign in required</h1><p>This review area is available to administrators only.</p><a href="/admin/login">Administrator sign in</a></div></main>
  if (sessionState === 'error') return <main className="contribution-page"><div className="admin-message is-error" role="alert"><h1>Session unavailable</h1><p>The administrator session could not be checked. Try again.</p><button type="button" onClick={auth.retry}>Retry</button></div></main>

  return <main className="admin-page">
    <header className="admin-page-heading">
      <div><p className="eyebrow">Editorial workspace</p><h1>Submission review</h1><p>Review the content and its sources before deciding. Approval makes a submission public.</p></div>
      <div className="admin-account"><span>{session.username}</span><button type="button" onClick={auth.logout} disabled={auth.logoutBusy}>{auth.logoutBusy ? 'Signing out…' : 'Sign out'}</button></div>
    </header>
    {message && <p className="admin-message" role="status">{message}</p>}
    <div className="admin-workspace">
      <aside className="admin-queues" aria-label="Pending submissions">
        {queueState === 'loading' && <p role="status" className="admin-muted">Loading pending submissions…</p>}
        {queueState === 'error' && <div className="admin-message is-error" role="alert"><p>{message || 'The review queue could not be loaded.'}</p><button type="button" onClick={() => { setQueueState('loading'); setRetry((count) => count + 1) }}>Try again</button></div>}
        {queueState === 'ready' && <>
          <SubmissionList title="Cultural entries" items={queue.culturalEntries} selected={selected} onSelect={(type, id) => setSelected({ type, id })} />
          <SubmissionList title="Places" items={queue.places} selected={selected} onSelect={(type, id) => setSelected({ type, id })} />
          {queue.culturalEntries.length === 0 && queue.places.length === 0 && <p className="admin-empty">There are no submissions waiting for review.</p>}
        </>}
      </aside>
      <section className="admin-review-pane" aria-label="Submission details">
        {selected
          ? <ReviewDetail key={`${selected.type}-${selected.id}`} item={selected} csrfToken={session.csrfToken} onComplete={removeReviewed} busy={busy} setBusy={setBusy} setMessage={setMessage} />
          : <p className="admin-muted">Choose a submission to inspect its content and references.</p>}
      </section>
    </div>
  </main>
}

export default function AdminPage({ mode, auth }) {
  return mode === 'login' ? <LoginPage /> : <DashboardPage auth={auth} />
}
