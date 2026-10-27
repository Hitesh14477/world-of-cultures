import { useEffect, useState } from 'react'
import CountryFlag from '../components/CountryFlag.jsx'
import { fetchMyFavourites, removeFavourite } from '../services/api.js'
import { buildAuthPath } from '../services/authNavigation.js'

const SECTIONS = [
  ['countries', 'Countries', 'No countries saved yet.', '/countries'],
  ['culturalEntries', 'Cultural Entries', 'No cultural entries saved yet.', '/search?type=cultural-entry'],
  ['places', 'Places', 'No places saved yet.', '/search?type=place'],
  ['communityPosts', 'Community Posts', 'No community posts saved yet.', '/community'],
]

function recordUrl(item) {
  const slug = item.country?.slug || (item.type === 'country' ? item.id : '')
  if (item.type === 'country') return `/countries/${encodeURIComponent(item.id)}`
  if (item.type === 'community-post') return `/community/posts/${encodeURIComponent(item.id)}`
  if (!slug) return '/countries'
  if (item.type === 'cultural-entry') return `/countries/${encodeURIComponent(slug)}/cultural-entries/${encodeURIComponent(item.id)}`
  return `/countries/${encodeURIComponent(slug)}/places/${encodeURIComponent(item.id)}`
}

function SavedCountryCard({ item, onRemove, removingId }) {
  const isRemoving = removingId === `${item.type}:${item.id}`
  const country = item.country
  const capital = Array.isArray(country?.capital) ? country.capital.filter(Boolean).join(', ') : ''
  const continent = country?.continent || ''
  return <article className="collection-item-card collection-item-country">
    <a className="collection-country-link" href={recordUrl(item)} aria-label={`Open ${country?.name || item.title} country profile`}>
      <span className="collection-country-image-frame"><CountryFlag country={country || { name: item.title }} className="collection-country-image" /></span>
      <span className="collection-country-copy">
        <span className="collection-country-title">{country?.name || item.title}<span aria-hidden="true">↗</span></span>
        {(capital || continent) && <span className="collection-country-details">
          {capital && <span>{capital}</span>}
          {capital && continent && <span className="collection-country-separator" aria-hidden="true">·</span>}
          {continent && <span>{continent}</span>}
        </span>}
      </span>
    </a>
    <button type="button" className="collection-remove collection-country-remove" onClick={() => onRemove(item)} disabled={isRemoving} aria-label={`Remove ${country?.name || item.title} from your collection`}>
      {isRemoving ? 'Removing…' : 'Remove'}
    </button>
  </article>
}

function CollectionSection({ title, emptyMessage, discoverUrl, items, onRemove, removingId }) {
  return <section className={`collection-section${title === 'Countries' ? ' collection-countries-section' : ''}`}>
    <div className="collection-section-heading"><h2>{title}</h2><span>{items.length}</span></div>
    {items.length === 0
      ? <div className="collection-empty-section"><p>{emptyMessage}</p><a className="collection-discover-button" href={discoverUrl}>{title === 'Countries' ? 'Explore Countries' : 'Discover'} <span aria-hidden="true">↗</span></a></div>
      : <div className="collection-items">
        {items.map((item) => item.type === 'country'
          ? <SavedCountryCard key={`${item.type}-${item.id}`} item={item} onRemove={onRemove} removingId={removingId} />
          : <article className={`collection-item-card collection-item-${item.type}`} key={`${item.type}-${item.id}`}>
          {item.image?.url && <a className="collection-item-image-link" href={recordUrl(item)} aria-label={`Open saved ${item.type.replaceAll('-', ' ')}: ${item.title}`}><img className="collection-item-image" src={item.image.url} alt={item.image.caption || `${item.title} image`} loading="lazy" /></a>}
          {item.type === 'community-post' && item.author?.username && <p className="collection-post-author">@{item.author.username}</p>}
          <div className="collection-item-meta">
            {item.country?.name && <CountryFlag country={item.country} className="collection-item-flag" />}
            {item.country?.name && <span>{item.country.name}</span>}
            {item.category && <span>{item.category.replaceAll('_', ' ')}</span>}
          </div>
          {(item.description || item.type === 'country') && <p className="collection-item-description">{item.description || 'Country profile'}</p>}
          <a className="collection-item-title" href={recordUrl(item)}>{item.type === 'community-post' ? 'Open community post' : item.title}<span aria-hidden="true">↗</span></a>
          <button type="button" className="collection-remove" onClick={() => onRemove(item)} disabled={removingId === `${item.type}:${item.id}`}>
            {removingId === `${item.type}:${item.id}` ? 'Removing…' : 'Remove'}
          </button>
        </article>)}
      </div>}
  </section>
}

export default function MyCollectionPage({ auth }) {
  const [collection, setCollection] = useState({ countries: [], culturalEntries: [], places: [], communityPosts: [] })
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
        let nextCollection = { countries: [], culturalEntries: [], places: [], communityPosts: [] }
        if (auth.user) nextCollection = await fetchMyFavourites({ signal: controller.signal })
        if (controller.signal.aborted) return
        setCollection(nextCollection || { countries: [], culturalEntries: [], places: [], communityPosts: [] })
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
      const section = item.type === 'country' ? 'countries' : item.type === 'place' ? 'places' : item.type === 'community-post' ? 'communityPosts' : 'culturalEntries'
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
  if (loadState === 'loading') return <main className="my-collection-page"><p className="collection-loading-label" role="status">Loading your collection…</p><div className="collection-loading-grid" aria-hidden="true">{Array.from({ length: 3 }, (_, index) => <div className="collection-loading-card" key={index}><span /><span /><span /></div>)}</div></main>
  if (loadState === 'error') return <main className="my-collection-page"><div className="collection-feedback" role="alert"><p>{error}</p><button type="button" onClick={() => { setLoadState('loading'); setRetry((value) => value + 1) }}>Try again</button></div></main>

  const total = collection.countries.length + collection.culturalEntries.length + collection.places.length + collection.communityPosts.length
  return <main className="my-collection-page">
    <header className="user-auth-heading collection-heading">
      <p className="eyebrow">Your library</p>
      <h1>My Collection</h1>
      {auth.user
        ? <p>{total} {total === 1 ? 'item' : 'items'} saved to your account. Your countries, cultural entries, places, and community posts are organized below.</p>
        : <p>Browse the atlas freely. Sign in to see and manage items saved to your account.</p>}
      {!auth.user && <a className="collection-signin" href={buildAuthPath('login', '/my-collection')}>Sign in to save favourites</a>}
    </header>
    {notice && <p className="collection-feedback" role="status">{notice}</p>}
    {error && <p className="collection-feedback is-error" role="alert">{error}</p>}
    <div className="collection-sections">
      {SECTIONS.map(([key, title, emptyMessage, discoverUrl]) => <CollectionSection key={key} title={title} emptyMessage={emptyMessage} discoverUrl={discoverUrl} items={collection[key]} onRemove={handleRemove} removingId={removingId} />)}
    </div>
  </main>
}
