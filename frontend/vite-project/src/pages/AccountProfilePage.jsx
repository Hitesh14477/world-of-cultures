import { useEffect, useMemo, useRef, useState } from 'react'
import CountryFlag from '../components/CountryFlag.jsx'
import { checkUsernameAvailability, fetchMyCommunityPosts, fetchMyContributions, fetchMyFavourites, fetchMyProfile, removeFavourite, updateMyProfile } from '../services/api.js'

const TABS = ['Overview', 'My Favourites', 'My Contributions', 'My Community Posts', 'Settings']
const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024
const PROFILE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function displayDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

function ProfileSettings({ profile, csrfToken, onSaved }) {
  const [username, setUsername] = useState(profile.username || '')
  const [displayName, setDisplayName] = useState(profile.displayName || '')
  const [bio, setBio] = useState(profile.bio || '')
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl || '')
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState('')
  const [avatarError, setAvatarError] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const [editing, setEditing] = useState(false)
  const [availability, setAvailability] = useState({ username: '', status: 'idle', message: '' })
  const availabilityRequest = useRef(0)
  const normalizedUsername = username.trim().toLowerCase()
  const originalUsername = (profile.username || '').trim().toLowerCase()
  const usernameValid = /^[a-z0-9_]{3,24}$/.test(normalizedUsername)
  const usernameUnchanged = normalizedUsername === originalUsername
  const availabilityMatches = availability.username === normalizedUsername
  const availabilityStatus = !usernameValid ? 'idle' : usernameUnchanged ? 'unchanged' : availabilityMatches ? availability.status : 'checking'
  const canSaveUsername = usernameValid && (usernameUnchanged || (availabilityMatches && availability.status === 'available'))

  useEffect(() => () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview) }, [avatarPreview])

  useEffect(() => {
    if (!editing || !usernameValid || usernameUnchanged) return undefined
    const requestId = ++availabilityRequest.current
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setAvailability({ username: normalizedUsername, status: 'checking', message: '' })
      checkUsernameAvailability(normalizedUsername, { signal: controller.signal }).then((result) => {
        if (controller.signal.aborted || requestId !== availabilityRequest.current) return
        setAvailability({ username: normalizedUsername, status: result?.available ? 'available' : 'taken', message: '' })
      }).catch((error) => {
        if (controller.signal.aborted || requestId !== availabilityRequest.current) return
        setAvailability({ username: normalizedUsername, status: 'error', message: error.response?.data?.message || 'Username availability could not be checked. Try again.' })
      })
    }, 350)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [editing, usernameValid, usernameUnchanged, normalizedUsername])

  function cancel() {
    setUsername(profile.username || '')
    setDisplayName(profile.displayName || '')
    setBio(profile.bio || '')
    setAvatarUrl(profile.avatarUrl || '')
    setAvatarFile(null)
    setAvatarPreview('')
    setAvatarError('')
    setAvailability({ username: '', status: 'idle', message: '' })
    setMessage('')
    setIsError(false)
    setEditing(false)
  }

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    if (!usernameValid) {
      setIsError(true)
      setMessage('Username must be 3–24 characters using letters, numbers, or underscores.')
      return
    }
    if (!canSaveUsername) return
    setBusy(true)
    setMessage('')
    try {
      const payload = avatarFile ? new FormData() : { username: normalizedUsername, displayName, bio, avatarUrl }
      if (avatarFile) {
        payload.append('username', normalizedUsername)
        payload.append('displayName', displayName)
        payload.append('bio', bio)
        payload.append('avatar', avatarFile)
      }
      const updated = await updateMyProfile(payload, csrfToken)
      setUsername(updated.username || normalizedUsername)
      setDisplayName(updated.displayName || '')
      setBio(updated.bio || '')
      setAvatarUrl(updated.avatarUrl || '')
      setAvatarFile(null)
      setAvatarPreview('')
      setAvatarError('')
      setAvailability({ username: updated.username || normalizedUsername, status: 'unchanged', message: '' })
      onSaved(updated)
      setMessage('Profile updated successfully.')
      setIsError(false)
    } catch (error) {
      setMessage(error.response?.data?.message || 'Your profile could not be updated. Please try again.')
      setIsError(true)
    } finally { setBusy(false) }
  }

  function chooseAvatar(event) {
    const file = event.target.files?.[0] || null
    setAvatarError('')
    if (!file) return
    if (!PROFILE_IMAGE_TYPES.has(file.type)) {
      setAvatarFile(null)
      setAvatarPreview('')
      setAvatarError('Choose a JPEG, PNG, or WebP image.')
      event.target.value = ''
      return
    }
    if (file.size === 0 || file.size > PROFILE_IMAGE_MAX_BYTES) {
      setAvatarFile(null)
      setAvatarPreview('')
      setAvatarError('Choose an image larger than 0 bytes and no bigger than 5 MB.')
      event.target.value = ''
      return
    }
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  return <div className="profile-settings-wrap">
    {!editing && <><button className="primary-button" type="button" onClick={() => { setEditing(true); setMessage('') }}>Update Profile</button>{message && <p className={isError ? 'profile-error' : 'profile-success'} role={isError ? 'alert' : 'status'}>{message}</p>}</>}
    {editing && <form className="profile-settings" onSubmit={submit}>
      <label>Username<input required minLength="3" maxLength="24" autoComplete="username" value={username} aria-describedby="profile-username-status" onChange={(event) => { setUsername(event.target.value); setMessage('') }} /></label>
      <p id="profile-username-status" className={`profile-availability profile-availability-${availabilityStatus}`} aria-live="polite">
        {availabilityStatus === 'unchanged' ? 'This is your current username.'
          : !usernameValid ? 'Use 3–24 letters, numbers, or underscores.'
            : availabilityStatus === 'checking' ? 'Checking username availability…'
              : availabilityStatus === 'available' ? 'Username is available.'
                : availabilityStatus === 'taken' ? 'This username is already taken.'
                  : availability.message}
      </p>
      <label>Display name <span>(optional)</span><input maxLength="60" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
      <div className="profile-image-options">
        <strong>Profile picture</strong>
        <p>Choose an image from your device, or use a secure image URL.</p>
        <label className="profile-image-upload"><span>{avatarFile ? 'Choose a different photo' : 'Choose a photo from your device'}</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseAvatar} aria-label="Upload a JPEG, PNG, or WebP profile picture" disabled={busy} /></label>
        <small>JPEG, PNG, or WebP · up to 5 MB. The image uploads when you save your profile.</small>
        {avatarError && <p className="profile-error" role="alert">{avatarError}</p>}
        {avatarFile && <button className="profile-remove-avatar-file" type="button" onClick={() => { setAvatarFile(null); setAvatarPreview(''); setAvatarError('') }} disabled={busy}>Remove selected photo</button>}
        <label>Or paste a profile picture URL <span>(optional, HTTPS)</span><input type="url" inputMode="url" maxLength="2048" placeholder="https://…" value={avatarUrl} onChange={(event) => { setAvatarUrl(event.target.value); setAvatarError(''); if (event.target.value) { setAvatarFile(null); setAvatarPreview('') } }} disabled={busy && Boolean(avatarFile)} /></label>
        {avatarUrl.trim() && !/^https:\/\//i.test(avatarUrl.trim()) && <p className="profile-error" role="alert">Profile pictures must use a valid HTTPS URL.</p>}
        {(avatarPreview || (avatarUrl && /^https:\/\//i.test(avatarUrl.trim()))) && <img className="profile-settings-avatar-preview" src={avatarPreview || avatarUrl.trim()} alt="Profile picture preview" />}
      </div>
      <label>Bio <span>(optional)</span><textarea rows="4" maxLength="240" value={bio} onChange={(event) => setBio(event.target.value)} /></label>
      <p className="profile-private-note">Your email address and account details are visible only to you.</p>
      {message && <p className={isError ? 'profile-error' : 'profile-success'} role={isError ? 'alert' : 'status'}>{message}</p>}
      <div className="profile-settings-actions"><button className="primary-button" type="submit" disabled={busy || !canSaveUsername || Boolean(avatarUrl.trim() && !/^https:\/\//i.test(avatarUrl.trim()))}>{busy ? avatarFile ? 'Uploading photo…' : 'Saving…' : 'Save Changes'}</button><button className="profile-cancel-button" type="button" onClick={cancel} disabled={busy}>Cancel</button></div>
    </form>}
  </div>
}

function ContributionList({ items }) {
  if (!items.length) return <p className="profile-empty">You have not submitted any cultural entries or places yet.</p>
  return <ul className="profile-submission-list">{items.map((item) => <li key={`${item.type}-${item.id}`}>
    <div><span>{item.country?.name || 'Country unavailable'} · {String(item.category || '').replaceAll('_', ' ')}</span>
      {item.reviewStatus === 'published' ? <a href={item.url}>{item.title}</a> : <strong>{item.title}</strong>}
      <small>{item.reviewStatus?.replaceAll('_', ' ') || 'Status unavailable'}{item.createdAt ? ` · ${displayDate(item.createdAt)}` : ''}</small>
    </div>
    <span className={`profile-status status-${item.reviewStatus || 'unknown'}`}>{item.reviewStatus?.replaceAll('_', ' ') || 'Unknown'}</span>
  </li>)}</ul>
}

function CommunityGrid({ items }) {
  if (!items.length) return <p className="profile-empty">You have not shared a Community post yet.</p>
  return <div className="profile-post-grid">{items.map((post) => <a className="profile-post-tile" href={`/community/posts/${encodeURIComponent(post.id)}`} key={post.id}>
    {post.image?.url && <img src={post.image.url} alt={post.caption || `Post from ${post.country?.name || 'the Community'}`} loading="lazy" />}
    <span>{post.country?.name || 'Community'} · {displayDate(post.createdAt)}</span><p>{post.caption}</p>
  </a>)}</div>
}

export default function AccountProfilePage({ auth }) {
  const [tab, setTab] = useState(() => {
    try {
      const requested = decodeURIComponent(window.location.hash.slice(1))
      return TABS.includes(requested) ? requested : 'Overview'
    } catch { return 'Overview' }
  })
  const [profile, setProfile] = useState(null)
  const [favourites, setFavourites] = useState({ countries: [], culturalEntries: [], places: [], communityPosts: [] })
  const [contributions, setContributions] = useState([])
  const [posts, setPosts] = useState([])
  const [contributionPagination, setContributionPagination] = useState({ page: 1, totalPages: 1 })
  const [postPagination, setPostPagination] = useState({ page: 1, totalPages: 1 })
  const [moreLoading, setMoreLoading] = useState('')
  const [moreError, setMoreError] = useState('')
  const [loadState, setLoadState] = useState('loading')
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [removing, setRemoving] = useState('')
  const [collectionMessage, setCollectionMessage] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      fetchMyProfile({ signal: controller.signal }),
      fetchMyFavourites({ signal: controller.signal }),
      fetchMyContributions({ signal: controller.signal }),
      fetchMyCommunityPosts({ signal: controller.signal }),
    ]).then(([nextProfile, nextFavourites, nextContributions, nextPosts]) => {
      if (controller.signal.aborted) return
      // The API keeps private account fields under `user` and activity counts beside it.
      setProfile({ ...(nextProfile?.user || {}), counts: nextProfile?.counts || {} })
      setFavourites(nextFavourites || { countries: [], culturalEntries: [], places: [], communityPosts: [] })
      setContributions(nextContributions?.data || [])
      setPosts(nextPosts?.data || [])
      setContributionPagination(nextContributions?.pagination || { page: 1, totalPages: 1 })
      setPostPagination(nextPosts?.pagination || { page: 1, totalPages: 1 })
      setLoadState('ready')
    }).catch((requestError) => {
      if (controller.signal.aborted) return
      setError(requestError.response?.data?.message || 'Your profile could not be loaded.')
      setLoadState('error')
    })
    return () => controller.abort()
  }, [auth.csrfToken, retry])

  const allFavourites = useMemo(() => [...(favourites.countries || []), ...(favourites.culturalEntries || []), ...(favourites.places || []), ...(favourites.communityPosts || [])], [favourites])
  async function loadMore(kind) {
    const pagination = kind === 'contributions' ? contributionPagination : postPagination
    if (moreLoading || pagination.page >= pagination.totalPages) return
    setMoreLoading(kind)
    setMoreError('')
    try {
      const result = kind === 'contributions'
        ? await fetchMyContributions({ page: pagination.page + 1 })
        : await fetchMyCommunityPosts({ page: pagination.page + 1 })
      if (kind === 'contributions') {
        setContributions((current) => [...current, ...(result.data || [])])
        setContributionPagination(result.pagination)
      } else {
        setPosts((current) => [...current, ...(result.data || [])])
        setPostPagination(result.pagination)
      }
    } catch (requestError) {
      setMoreError(requestError.response?.data?.message || 'More items could not be loaded. Try again.')
    } finally { setMoreLoading('') }
  }
  async function removeSaved(item) {
    if (removing) return
    const key = `${item.type}:${item.id}`
    setRemoving(key)
    setCollectionMessage('')
    try {
      await removeFavourite(item.type, item.id, auth.csrfToken)
      const section = item.type === 'country' ? 'countries' : item.type === 'place' ? 'places' : item.type === 'community-post' ? 'communityPosts' : 'culturalEntries'
      setFavourites((current) => ({ ...current, [section]: current[section].filter((saved) => saved.id !== item.id) }))
      setCollectionMessage('Removed from your favourites.')
    } catch (requestError) {
      setCollectionMessage(requestError.response?.data?.message || 'This favourite could not be removed.')
    } finally { setRemoving('') }
  }
  if (loadState === 'loading') return <main className="profile-page"><p role="status">Loading your profile…</p></main>
  if (loadState === 'error') return <main className="profile-page"><div className="profile-error-box" role="alert"><h1>Profile unavailable</h1><p>{error}</p><button type="button" onClick={() => { setError(''); setLoadState('loading'); setRetry((value) => value + 1) }}>Try again</button></div></main>
  if (!profile) return null

  const initials = (profile.displayName || profile.username || profile.email || 'W').slice(0, 1).toUpperCase()
  const counts = profile.counts || { favourites: allFavourites.length, contributions: contributions.length, communityPosts: posts.length }
  return <main className="profile-page">
    <header className="profile-header">
      <div className="profile-avatar" aria-label={profile.avatarUrl ? `${profile.username || 'Your'} profile picture` : 'Default profile avatar'}>{profile.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : initials}</div>
      <div className="profile-heading-copy"><p className="eyebrow">Your World of Cultures account</p><h1>@{profile.username || 'Account'}</h1>{profile.displayName && <p className="profile-display-name">{profile.displayName}</p>}<p>{profile.createdAt ? `Joined ${displayDate(profile.createdAt)}` : 'Account profile'}</p></div>
      <button className="profile-signout logout-control" type="button" onClick={auth.logout} disabled={auth.logoutBusy}>{auth.logoutBusy ? 'Logging out…' : 'Log out'}</button>
    </header>
    <nav className="profile-tabs" aria-label="Profile sections" role="tablist">{TABS.map((label) => <button key={label} type="button" role="tab" aria-selected={tab === label} onClick={() => setTab(label)}>{label}</button>)}</nav>
    {tab === 'Overview' && <section className="profile-overview" role="tabpanel">
      <div className="profile-counts">{[['Favourites', counts.favourites], ['Contributions', counts.contributions], ['Community posts', counts.communityPosts]].map(([label, count]) => <div key={label}><strong>{count}</strong><span>{label}</span></div>)}</div>
      <div className="profile-overview-columns"><section><header><h2>Recently saved</h2><button type="button" onClick={() => setTab('My Favourites')}>View all</button></header>{allFavourites.slice(0, 4).map((item) => <a className="profile-recent-item" href={item.type === 'country' ? `/countries/${item.id}` : item.type === 'community-post' ? `/community/posts/${encodeURIComponent(item.id)}` : item.type === 'place' ? `/countries/${item.country?.slug}/places/${item.id}` : `/countries/${item.country?.slug}/cultural-entries/${item.id}`} key={`${item.type}-${item.id}`}>{item.country && <CountryFlag country={item.country} />}<span>{item.title}</span></a>)}{allFavourites.length === 0 && <p className="profile-empty">Nothing saved yet.</p>}</section>
        <section><header><h2>Recent contributions</h2><button type="button" onClick={() => setTab('My Contributions')}>View all</button></header><ContributionList items={contributions.slice(0, 3)} /></section></div>
      <section className="profile-overview-posts"><header><h2>Recent Community posts</h2><button type="button" onClick={() => setTab('My Community Posts')}>View all</button></header><CommunityGrid items={posts.slice(0, 3)} /></section>
    </section>}
    {tab === 'My Favourites' && <section className="profile-section" role="tabpanel"><h2>My Favourites</h2><p>Saved countries, cultural entries, places, and Community posts.</p>{collectionMessage && <p className="profile-success" role="status">{collectionMessage}</p>}{allFavourites.length === 0 && <p className="profile-empty">No account favourites yet. <a href="/countries">Browse countries</a></p>}<div className="profile-favourite-grid">{allFavourites.map((item) => <article key={`${item.type}-${item.id}`}>
      {item.country && <CountryFlag country={item.country} />}
      <small>{item.type === 'country' ? 'Country' : `${item.country?.name || 'Country'} · ${item.category || item.type}`}</small>
      <a href={item.type === 'country' ? `/countries/${encodeURIComponent(item.id)}` : item.type === 'community-post' ? `/community/posts/${encodeURIComponent(item.id)}` : item.type === 'place' ? `/countries/${encodeURIComponent(item.country?.slug || '')}/places/${encodeURIComponent(item.id)}` : `/countries/${encodeURIComponent(item.country?.slug || '')}/cultural-entries/${encodeURIComponent(item.id)}`}>{item.title} ↗</a>
      <button type="button" onClick={() => removeSaved(item)} disabled={removing === `${item.type}:${item.id}`}>{removing === `${item.type}:${item.id}` ? 'Removing…' : 'Remove'}</button>
    </article>)}</div><a className="profile-section-link" href="/my-collection">Open full collection →</a></section>}
    {tab === 'My Contributions' && <section className="profile-section" role="tabpanel"><h2>My Contributions</h2><ContributionList items={contributions} />{contributionPagination.page < contributionPagination.totalPages && <button className="profile-more-button" type="button" onClick={() => loadMore('contributions')} disabled={Boolean(moreLoading)}>{moreLoading === 'contributions' ? 'Loading…' : 'Load more contributions'}</button>}{moreError && <p className="profile-error" role="alert">{moreError}</p>}<a className="profile-section-link" href="/contribute">Submit a contribution →</a></section>}
    {tab === 'My Community Posts' && <section className="profile-section" role="tabpanel"><h2>My Community Posts</h2><CommunityGrid items={posts} />{postPagination.page < postPagination.totalPages && <button className="profile-more-button" type="button" onClick={() => loadMore('posts')} disabled={Boolean(moreLoading)}>{moreLoading === 'posts' ? 'Loading…' : 'Load more posts'}</button>}{moreError && <p className="profile-error" role="alert">{moreError}</p>}</section>}
    {tab === 'Settings' && <section className="profile-section" role="tabpanel"><h2>Settings</h2>{profile.email && <p className="profile-email">Email · {profile.email}</p>}<ProfileSettings profile={profile} csrfToken={auth.csrfToken} onSaved={(updated) => { setProfile((current) => ({ ...current, ...updated })); auth.updateUser(updated) }} /></section>}
  </main>
}
