import { useEffect, useState } from 'react'
import CountryFlag from '../components/CountryFlag.jsx'
import SourceReferences from '../components/SourceReferences.jsx'
import { fetchCountry, fetchCulturalEntries, fetchPlaces } from '../services/api.js'
import FavouriteButton from '../components/FavouriteButton.jsx'
import { buildAuthPath } from '../services/authNavigation.js'

const CULTURAL_SECTIONS = [
  ['history', 'History'],
  ['traditional_food', 'Traditional Food'],
  ['places', 'Places to Visit'],
  ['festivals', 'Festivals and Celebrations'],
  ['traditional_clothing', 'Traditional Clothing'],
  ['customs_and_traditions', 'Customs and Traditions'],
  ['languages_and_dialects', 'Languages and Dialects'],
  ['mythology_and_folklore', 'Mythology and Folklore'],
  ['music_and_dance', 'Music and Dance'],
  ['everyday_life', 'Everyday Life'],
]

function formatNumber(value) {
  return typeof value === 'number' ? new Intl.NumberFormat().format(value) : null
}

function CountryOverview({ country }) {
  const area = formatNumber(country.area)
  const facts = [
    ['Capital', country.capital?.length ? country.capital.join(', ') : null],
    ['Region', [country.continent, country.region, country.subregion].filter(Boolean).join(' · ') || null],
    ['Population', formatNumber(country.population)],
    ['Area', area ? `${area} km²` : null],
    ['Languages', country.languages?.length ? country.languages.map(({ name }) => name).join(', ') : null],
    ['Currencies', country.currencies?.length ? country.currencies.map(({ code, name }) => `${name} (${code})`).join(', ') : null],
    ['Time zones', country.timeZones?.length ? country.timeZones.join(', ') : null],
    ['Landlocked', typeof country.landlocked === 'boolean' ? (country.landlocked ? 'Yes' : 'No') : null],
  ].filter(([, value]) => value)

  return <dl className="country-facts">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
}

function CulturalEntryCard({ entry, slug }) {
  const href = `/countries/${encodeURIComponent(slug)}/cultural-entries/${encodeURIComponent(entry._id)}`
  return <article className="detail-entry">
    {entry.image?.url && <figure className="contribution-published-image"><img src={entry.image.url} alt={entry.image.caption || entry.title} />{entry.image.caption && <figcaption>{entry.image.caption}</figcaption>}</figure>}
    <h3><a className="record-card-link" href={href}>{entry.title}<span aria-hidden="true"> ↗</span></a></h3>
    {entry.region && <p className="detail-region">{entry.region}</p>}
    {entry.summary && <p className="detail-summary">{entry.summary}</p>}
    <SourceReferences sources={entry.sources} imageAttributions={entry.imageAttributions} />
  </article>
}

function PlaceCard({ place, slug }) {
  const href = `/countries/${encodeURIComponent(slug)}/places/${encodeURIComponent(place._id)}`
  return <article className="detail-entry">
    {place.image?.url && <figure className="contribution-published-image"><img src={place.image.url} alt={place.image.caption || place.name} />{place.image.caption && <figcaption>{place.image.caption}</figcaption>}</figure>}
    <h3><a className="record-card-link" href={href}>{place.name}<span aria-hidden="true"> ↗</span></a></h3>
    {(place.location || place.region) && <p className="detail-region">{[place.location, place.region].filter(Boolean).join(' · ')}</p>}
    {place.description && <p className="detail-copy">{place.description}</p>}
    <SourceReferences sources={place.sources} imageAttributions={place.imageAttributions} />
  </article>
}

export default function CountryDetail({ slug, auth }) {
  const [data, setData] = useState(null)
  const [loadState, setLoadState] = useState('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      fetchCountry(slug, { signal: controller.signal }),
      fetchCulturalEntries(slug, { signal: controller.signal }),
      fetchPlaces(slug, { signal: controller.signal }),
    ]).then(([country, entries, places]) => {
      if (!country) {
        setLoadState('not-found')
        setErrorMessage('We could not find a country with that name.')
        return
      }
      if (!Array.isArray(entries) || !Array.isArray(places)) {
        throw new Error('The published content response was invalid.')
      }
      setData({
        country,
        entries: entries.filter((entry) => entry.reviewStatus === 'published'),
        places: places.filter((place) => place.reviewStatus === 'published'),
      })
      setLoadState('ready')
    }).catch((error) => {
      if (controller.signal.aborted) return
      const notFound = error.response?.status === 404
      setErrorMessage(notFound
        ? 'We could not find a country with that name.'
        : 'The country’s published cultural information could not be loaded. Please try again.')
      setLoadState(notFound ? 'not-found' : 'error')
    })
    return () => controller.abort()
  }, [slug, retry])

  function onRetry() {
    setLoadState('loading')
    setErrorMessage('')
    setRetry((value) => value + 1)
  }

  function contributionHref(countrySlug, category) {
    const kind = category === 'places' ? 'place' : 'entry'
    const categoryValue = kind === 'place' ? 'cultural_destination' : category
    const returnTo = `/contribute?${new URLSearchParams({ country: countrySlug, category: categoryValue, kind }).toString()}`
    return auth?.status === 'ready' && !auth.user ? buildAuthPath('login', returnTo) : returnTo
  }

  if (loadState === 'loading') return <main className="country-detail-page"><p className="detail-feedback" role="status">Loading country information…</p></main>
  if (loadState === 'not-found' || loadState === 'error') {
    return <main className="country-detail-page"><div className="detail-feedback" role={loadState === 'error' ? 'alert' : 'status'}>
      <h1>{loadState === 'not-found' ? 'Country not found' : 'Country information unavailable'}</h1>
      <p>{errorMessage}</p>
      {loadState === 'error' && <button className="detail-retry" type="button" onClick={onRetry}>Try again</button>}
      <a className="detail-back-link" href="/countries">Browse countries</a>
    </div></main>
  }

  const { country, entries, places } = data
  const factsRegion = [country.continent, country.region, country.subregion].filter(Boolean).join(' · ')
  const publishedCount = entries.length + places.length

  return <main className="country-detail-page">
    <a className="detail-back-link" href="/countries">← All countries</a>
    <header className="country-detail-header">
      <CountryFlag country={country} className="detail-flag" />
      <div><p className="eyebrow">Country profile</p><h1>{country.name}</h1>{country.officialName && country.officialName !== country.name && <p className="detail-official-name">{country.officialName}</p>}</div>
    </header>
    <FavouriteButton auth={auth} type="country" targetId={country.slug} />
    {factsRegion && <p className="country-detail-region">{factsRegion}</p>}
    <CountryOverview country={country} />

    <section className="culture-index" aria-labelledby="culture-index-title">
      <div className="culture-index-heading">
        <div><p className="eyebrow">Cultural guide</p><h2 id="culture-index-title">Explore by topic</h2></div>
        <span>{publishedCount} published {publishedCount === 1 ? 'item' : 'items'}</span>
      </div>
      <nav className="culture-index-links" aria-label="Cultural topics">
        {CULTURAL_SECTIONS.map(([category, title]) => {
          const count = category === 'places' ? places.length : entries.filter((entry) => entry.category === category).length
          return <a key={category} href={`#culture-${category}`}>
            <span>{title}</span><span className="culture-index-count">{count || '—'}</span>
          </a>
        })}
      </nav>
    </section>

    <section className="cultural-sections" aria-label={`Published cultural information about ${country.name}`}>
      {CULTURAL_SECTIONS.map(([category, title]) => {
        const sectionEntries = entries.filter((entry) => entry.category === category)
        const sectionPlaces = category === 'places' ? places : []
        const count = sectionEntries.length + sectionPlaces.length
        return <section className="cultural-section" id={`culture-${category}`} key={category} aria-labelledby={`heading-${category}`}>
          <div className="cultural-section-heading">
            <h2 id={`heading-${category}`}>{title}</h2>
            {count > 0 && <span>{count} published {count === 1 ? 'item' : 'items'}</span>}
          </div>
          {sectionEntries.map((entry) => <CulturalEntryCard key={entry._id} entry={entry} slug={slug} />)}
          {sectionPlaces.map((place) => <PlaceCard key={place._id} place={place} slug={slug} />)}
          {count === 0 && <p className="collection-note">Information for this section is still being collected. Only reviewed and published material appears here.</p>}
          <a className="contribute-section-link" href={contributionHref(country.slug, category)}>+ Contribute to this section</a>
        </section>
      })}
    </section>
  </main>
}
