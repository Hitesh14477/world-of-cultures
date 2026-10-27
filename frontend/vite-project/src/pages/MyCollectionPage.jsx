import { useEffect, useState } from 'react'
import CountryFlag from '../components/CountryFlag.jsx'
import { fetchMyFavourites, removeFavourite } from '../services/api.js'
import { buildAuthPath } from '../services/authNavigation.js'

const SECTIONS = [
  ['countries', 'Countries'],
  ['culturalEntries', 'Cultural entries'],
  ['places', 'Places'],
]

function recordUrl(item) {
  const slug = item.country?.slug || (item.type === 'country' ? item.id : '')
  if (item.type === 'country') return `/countries/${encodeURIComponent(item.id)}`
  if (!slug) return '/countries'
  if (item.type === 'cultural-entry') return `/countries/${encodeURIComponent(slug)}/cultural-entries/${encodeURIComponent(item.id)}`
  return `/countries/${encodeURIComponent(slug)}/places/${encodeURIComponent(item.id)}`
}

function CollectionSection({ title, items, onRemove, removingId }) {
  return <section className="collection-section">
    <div className="collection-section-heading"><h2>{title}</h2><span>{items.length}</span></div>
    {items.length === 0 && <p className="collection-empty-section">Nothing saved here yet.</p>}
    {items.length > 0 && <ul className="collection-items">
      {items.map((item) => <li key={`${item.type}-${item.id}`}>
        <div className="collection-item-meta">
          {item.country?.name && <CountryFlag country={item.country} className="collection-item-flag" />}
          {item.country?.name && <span>{item.country.name}</span>}
          {item.category && <span>{item.category.replaceAll('_', ' ')}</span>}
        </div>
        <a className="collection-item-title" href={recordUrl(item)}>{item.title}<span aria-hidden="true">↗</span></a>
        {item.description && <p>{item.description}</p>}
        <button type="button" className="collection-remove" onClick={() => onRemove(item)} disabled={removingId === `${item.type}:${item.id}`}>
          {removingId === `${item.type}:${item.id}` ? 'Removing…' : 'Remove from collection'}
        </button>
      </li>)}
    </ul>}
  </section>
}

export default function MyCollectionPage({ auth }) {
  const [collection, setCollection] = useState({ countries: [], culturalEntries: [], places: [] })
  const [loadState, setLoadState] = useState('loading')
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [removingId, setRemovingId] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    if (auth.status !== 'ready') return () => controller.abort()

    async function loadFavourites() {
      setLoadState('loading')
      setError('')
      try {
        let nextCollection = { countries: [], culturalEntries: [], places: [] }
        if (auth.user) nextCollection = await fetchMyFavourites({ signal: controller.signal })
        if (controller.signal.aborted) return
        setCollection(nextCollection || { countries: [], culturalEntries: [], places: [] })
        setLoadState('ready')
      } catch (requestError) {
        if (controller.signal.aborted) return
        setError(requestError.response?.data?.message || 'Your collection could not be loaded.')
        setLoadState('error')
      }
    }

    loadFavourites()
    return () => controller.abort()
  }, [auth.status, auth.user, auth.csrfToken, retry])

  async function handleRemove(item) {
    const key = `${item.type}:${item.id}`
    if (removingId) return
    setRemovingId(key)
    setNotice('')
    try {
      await removeFavourite(item.type, item.id, auth.csrfToken)
      const section = item.type === 'country' ? 'countries' : item.type === 'place' ? 'places' : 'culturalEntries'
      setCollection((current) => ({ ...current, [section]: current[section].filter((row) => row.id !== item.id) }))
      setNotice('Removed from your collection.')
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'This item could not be removed. Please try again.')
    } finally {
      setRemovingId('')
    }
  }

  if (auth.status === 'loading') return <main className="my-collection-page"><p role="status">Checking your account…</p></main>
  if (auth.status === 'error') return <main className="my-collection-page"><div role="alert"><h1>Account unavailable</h1><p>Your account session could not be checked.</p><button type="button" onClick={auth.retry}>Try again</button></div></main>
  if (loadState === 'loading') return <main className="my-collection-page"><p role="status">Loading your collection…</p></main>
  if (loadState === 'error') return <main className="my-collection-page"><div className="collection-feedback" role="alert"><p>{error}</p><button type="button" onClick={() => { setLoadState('loading'); setRetry((value) => value + 1) }}>Try again</button></div></main>

  const total = collection.countries.length + collection.culturalEntries.length + collection.places.length
  return <main className="my-collection-page">
    <header className="user-auth-heading collection-heading">
      <p className="eyebrow">Personal collection</p>
      <h1>{auth.user ? 'Things you’ve saved.' : 'Your favourites.'}</h1>
      {auth.user
        ? <p>{total} {total === 1 ? 'item' : 'items'} saved to your account.</p>
        : <p>Sign in to save countries, cultural entries, and places to your personal collection.</p>}
      {!auth.user && <a className="collection-signin" href={buildAuthPath('login', '/my-collection')}>Sign in to save favourites</a>}
    </header>
    {notice && <p className="collection-feedback" role="status">{notice}</p>}
    {error && <p className="collection-feedback is-error" role="alert">{error}</p>}
    {total === 0 && <p className="collection-empty">{auth.user ? 'Your collection is empty. Browse the atlas and save a country, story, or place to return to it here.' : 'Your account collection will appear here after you sign in.'}</p>}
    <div className="collection-sections">
      {SECTIONS.map(([key, title]) => <CollectionSection key={key} title={title} items={collection[key]} onRemove={handleRemove} removingId={removingId} />)}
    </div>
  </main>
}
