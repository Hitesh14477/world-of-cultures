import { useEffect, useState } from 'react'
import { fetchAdminOverview, fetchAdminUsers } from '../services/api.js'

const TABS = ['Overview', 'Cultural Contributions', 'Places', 'Community Moderation', 'Users', 'Notifications', 'Settings']
const EMPTY_STATS = { totalUsers: 0, totalCountries: 0, publishedEntries: 0, pendingCulturalEntries: 0, pendingPlaces: 0 }

function initialTab() {
  try {
    const requested = decodeURIComponent(window.location.hash.slice(1))
    return TABS.includes(requested) ? requested : 'Overview'
  } catch {
    return 'Overview'
  }
}

function displayDate(value) {
  if (!value) return 'Date unavailable'
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? 'Date unavailable' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

function Overview({ statistics, onTab }) {
  const cards = [
    ['Registered users', statistics.totalUsers],
    ['Countries', statistics.totalCountries],
    ['Published cultural entries', statistics.publishedEntries],
    ['Cultural entries awaiting review', statistics.pendingCulturalEntries],
    ['Places awaiting review', statistics.pendingPlaces],
  ]
  return <section className="admin-profile-section" aria-labelledby="admin-overview-title">
    <h2 id="admin-overview-title">Administration overview</h2>
    <p>Current counts from the application database.</p>
    <div className="admin-profile-stat-grid">{cards.map(([label, value]) => <article className="admin-profile-stat" key={label}><span>{label}</span><strong>{new Intl.NumberFormat().format(value)}</strong></article>)}</div>
    <div className="admin-profile-shortcuts">
      <a href="/admin#cultural-contributions">Review cultural contributions <span aria-hidden="true">→</span></a>
      <a href="/admin#places">Review places <span aria-hidden="true">→</span></a>
      <button type="button" onClick={() => onTab('Community Moderation')}>Community moderation <span aria-hidden="true">→</span></button>
    </div>
  </section>
}

function UserManagement({ users, state, error, query, setQuery, onSearch, onRetry, pagination, onPage }) {
  return <section className="admin-profile-section" aria-labelledby="admin-users-title">
    <h2 id="admin-users-title">User management</h2>
    <p>Read-only account directory. Account roles, suspension, and restoration are not supported by the current user model.</p>
    <form className="admin-user-search" onSubmit={onSearch}>
      <label htmlFor="admin-user-search">Search by username</label>
      <div><input id="admin-user-search" value={query} maxLength={24} onChange={(event) => setQuery(event.target.value)} placeholder="Username" /><button type="submit">Search</button></div>
    </form>
    {(state === 'idle' || state === 'loading') && <p role="status">Loading users…</p>}
    {state === 'error' && <div className="admin-message is-error" role="alert"><p>{error}</p><button type="button" onClick={onRetry}>Try again</button></div>}
    {state === 'ready' && users.length === 0 && <p>No matching accounts were found.</p>}
    {state === 'ready' && users.length > 0 && <div className="admin-user-list">{users.map((user) => <article key={user.id}>
      <strong>{user.displayName || (user.username ? `@${user.username}` : 'Legacy account')}</strong>
      {user.username && user.displayName && <span>@{user.username}</span>}
      {user.email && !user.email.endsWith('@accounts.worldofcultures.invalid') && <span>{user.email}</span>}
      <small>Joined {displayDate(user.createdAt)}</small>
    </article>)}</div>}
    {state === 'ready' && pagination.totalPages > 1 && <div className="admin-user-pagination"><button type="button" onClick={() => onPage(pagination.page - 1)} disabled={pagination.page <= 1}>Previous</button><span>Page {pagination.page} of {pagination.totalPages}</span><button type="button" onClick={() => onPage(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages}>Next</button></div>}
  </section>
}

export default function AdminProfilePage({ auth }) {
  const [tab, setTab] = useState(initialTab)
  const [overview, setOverview] = useState(null)
  const [overviewState, setOverviewState] = useState('loading')
  const [overviewError, setOverviewError] = useState('')
  const [overviewRetry, setOverviewRetry] = useState(0)
  const [users, setUsers] = useState([])
  const [usersState, setUsersState] = useState('idle')
  const [usersError, setUsersError] = useState('')
  const [usersRetry, setUsersRetry] = useState(0)
  const [query, setQuery] = useState('')
  const [userSearch, setUserSearch] = useState('')
  const [userPage, setUserPage] = useState(1)
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 })

  useEffect(() => {
    if (!auth.session) return undefined
    const controller = new AbortController()
    fetchAdminOverview({ signal: controller.signal }).then((data) => {
      if (controller.signal.aborted) return
      setOverview(data)
      setOverviewState('ready')
      setOverviewError('')
    }).catch(() => {
      if (controller.signal.aborted) return
      setOverviewState('error')
      setOverviewError('Administrator statistics could not be loaded.')
    })
    return () => controller.abort()
  }, [auth.session, overviewRetry])

  useEffect(() => {
    if (!auth.session || tab !== 'Users') return undefined
    const controller = new AbortController()
    fetchAdminUsers({ search: userSearch, page: userPage, limit: 20 }, { signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return
      setUsers(result.users)
      setPagination(result.pagination)
      setUsersState('ready')
      setUsersError('')
    }).catch(() => {
      if (controller.signal.aborted) return
      setUsersState('error')
      setUsersError('The user directory could not be loaded.')
    })
    return () => controller.abort()
  }, [auth.session, tab, userSearch, userPage, usersRetry])

  function selectTab(nextTab) {
    setTab(nextTab)
    window.history.replaceState(null, '', `/admin/profile#${encodeURIComponent(nextTab)}`)
  }

  if (auth.status === 'loading') return <main className="admin-profile-page"><p role="status">Checking administrator session…</p></main>
  if (auth.status === 'error') return <main className="admin-profile-page"><div role="alert"><h1>Administrator profile unavailable</h1><p>{auth.error || 'The administrator session could not be checked.'}</p><button type="button" onClick={auth.retry}>Try again</button></div></main>
  if (!auth.session) return <main className="admin-profile-page"><p role="status">Redirecting to administrator sign in…</p></main>

  const statistics = overview?.statistics || EMPTY_STATS
  const notifications = [
    { count: statistics.pendingCulturalEntries, label: 'cultural contributions awaiting review', href: '/admin#cultural-contributions' },
    { count: statistics.pendingPlaces, label: 'place submissions awaiting review', href: '/admin#places' },
  ].filter(({ count }) => count > 0)

  return <main className="admin-profile-page">
    <header className="admin-profile-heading">
      <span className="admin-profile-avatar" aria-hidden="true">{auth.session.member?.avatarUrl ? <img src={auth.session.member.avatarUrl} alt="" /> : (auth.session.username || 'A').slice(0, 1).toUpperCase()}</span>
      <div><p className="eyebrow">Administrator account</p><h1>{auth.session.username}</h1><span className="admin-role-badge">Administrator</span></div>
      <a className="admin-dashboard-link" href="/admin">Open Admin Dashboard →</a>
    </header>
    <nav className="admin-profile-tabs" aria-label="Administrator profile sections" role="tablist">
      {TABS.map((label) => <button key={label} type="button" role="tab" aria-selected={tab === label} onClick={() => selectTab(label)}>{label}</button>)}
    </nav>
    {overviewState === 'error' && <div className="admin-message is-error" role="alert"><p>{overviewError}</p><button type="button" onClick={() => { setOverviewState('loading'); setOverviewRetry((value) => value + 1) }}>Try again</button></div>}
    {tab === 'Overview' && (overviewState === 'loading' ? <p role="status">Loading administration statistics…</p> : overviewState === 'ready' && <Overview statistics={statistics} onTab={selectTab} />)}
    {tab === 'Cultural Contributions' && <section className="admin-profile-section"><h2>Cultural contributions</h2><p>Review sourced cultural entries and moderate them before publication.</p><a className="admin-dashboard-link" href="/admin#cultural-contributions">Open contribution queue →</a></section>}
    {tab === 'Places' && <section className="admin-profile-section"><h2>Places to visit</h2><p>Review place descriptions, required images, country associations, and sources.</p><a className="admin-dashboard-link" href="/admin#places">Open places queue →</a></section>}
    {tab === 'Community Moderation' && <section className="admin-profile-section"><h2>Community moderation</h2><p>Use the existing Community view to inspect public posts and moderate posts or comments with your administrator session. Report queues are not implemented.</p><a className="admin-dashboard-link" href="/community">Open Community →</a></section>}
    {tab === 'Users' && <UserManagement users={users} state={usersState} error={usersError} query={query} setQuery={setQuery} onSearch={(event) => { event.preventDefault(); setUsersState('loading'); setUserPage(1); setUserSearch(query.trim()) }} onRetry={() => { setUsersState('loading'); setUsersRetry((value) => value + 1) }} pagination={pagination} onPage={(page) => { setUsersState('loading'); setUserPage(page) }} />}
    {tab === 'Notifications' && <section className="admin-profile-section"><h2>Review notifications</h2>{overviewState === 'loading' && <p role="status">Loading notification counts…</p>}{overviewState === 'error' && <p role="alert">{overviewError}</p>}{overviewState === 'ready' && (notifications.length ? <ul className="admin-notification-list">{notifications.map((item) => <li key={item.label}><a href={item.href}><strong>{item.count}</strong> {item.label} →</a></li>)}</ul> : <p>There are no submissions waiting for review.</p>)}<p>These counts are calculated from current pending records; no duplicate notification records are created.</p></section>}
    {tab === 'Settings' && <section className="admin-profile-section"><h2>Account settings</h2><dl className="admin-profile-facts"><div><dt>Administrator username</dt><dd>{auth.session.username}</dd></div><div><dt>Access</dt><dd>{auth.session.role || 'Administrator'}</dd></div><div><dt>Display name, picture, bio, and account creation date</dt><dd>Not stored for the current server-configured administrator account.</dd></div></dl><p>The current admin authentication uses a server-configured identity rather than a User document. Profile edits are unavailable so administrator access cannot be changed through regular-user profile APIs.</p></section>}
    <div className="admin-profile-signout"><button className="logout-control" type="button" onClick={auth.logout} disabled={auth.logoutBusy}>{auth.logoutBusy ? 'Logging out…' : 'Log out'}</button></div>
  </main>
}
