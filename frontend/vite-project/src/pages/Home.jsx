import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { ComposableMap, Geographies, Geography } from 'react-simple-maps/core'
import { ZoomableGroup } from 'react-simple-maps/zoom'
import { iso31661NumericToAlpha2 } from 'iso-3166'
import { feature as topojsonFeature } from 'topojson-client'
import CountryFlag from '../components/CountryFlag.jsx'
import { fetchCommunityPosts, fetchGlobalSearch } from '../services/api.js'

const CONTINENTS = ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania']
const CATEGORY_LABELS = {
  history: 'History', traditional_food: 'Traditional Food', festivals: 'Festivals and Celebrations',
  traditional_clothing: 'Traditional Clothing', customs_and_traditions: 'Customs and Traditions',
  languages_and_dialects: 'Languages and Dialects', mythology_and_folklore: 'Mythology and Folklore',
  music_and_dance: 'Music and Dance', everyday_life: 'Everyday Life',
}

function ImageFrame({ src, alt, className = '' }) {
  const [failed, setFailed] = useState(!src)
  return <div className={`home-image-frame ${className}`}>
    {src && !failed ? <img src={src} alt={alt || ''} loading="lazy" onError={() => setFailed(true)} /> : <div className="home-image-fallback" aria-label="Image unavailable">Image unavailable</div>}
  </div>
}

function CulturalCard({ entry }) {
  const country = entry.country
  return <article className="home-discover-card">
    <a className="home-discover-image-link" href={`/countries/${encodeURIComponent(country.slug)}/cultural-entries/${encodeURIComponent(entry.id)}`} aria-label={`Read ${entry.title}`}>
      <ImageFrame src={entry.image?.url} alt={entry.image?.caption || entry.title} className="home-discover-image" />
    </a>
    <div className="home-discover-copy">
      <span className="home-card-kicker">{CATEGORY_LABELS[entry.category] || entry.category?.replaceAll('_', ' ')}</span>
      <h3><a href={`/countries/${encodeURIComponent(country.slug)}/cultural-entries/${encodeURIComponent(entry.id)}`}>{entry.title}</a></h3>
      <a className="home-card-country" href={`/countries/${encodeURIComponent(country.slug)}`}><CountryFlag country={country} className="home-card-flag" />{country.name}</a>
      {entry.description && <p>{entry.description}</p>}
      <a className="home-card-link" href={`/countries/${encodeURIComponent(country.slug)}/cultural-entries/${encodeURIComponent(entry.id)}`}>Read story <span aria-hidden="true">→</span></a>
    </div>
  </article>
}

function CommunityHighlight({ post }) {
  return <article className="home-community-card">
    <a className="home-discover-image-link" href={`/community/posts/${encodeURIComponent(post.id)}`} aria-label={`Open community post by ${post.author?.username || 'community member'}`}>
      <ImageFrame src={post.image?.url} alt="Community member's travel photograph" className="home-community-image" />
    </a>
    <div className="home-community-copy">
      <div className="home-community-byline">
        {post.author?.avatarUrl ? <img src={post.author.avatarUrl} alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true }} /> : <span className="home-community-avatar" aria-hidden="true">{post.author?.username?.slice(0, 1)?.toUpperCase() || '•'}</span>}
        <span>{post.author?.username || 'Community member'}</span>
        {post.country?.slug && <a href={`/countries/${encodeURIComponent(post.country.slug)}`}>{post.country.name}</a>}
      </div>
      <p>{post.caption}</p>
      <a className="home-card-link" href={`/community/posts/${encodeURIComponent(post.id)}`}>View post <span aria-hidden="true">→</span><span className="home-post-likes">{post.likesCount || 0} likes</span></a>
    </div>
  </article>
}

const ContinentSilhouette = memo(function ContinentSilhouette({ continent, countriesByCode, worldFeatures, mapStatus }) {
  if (!worldFeatures) return <span className="home-continent-map-status" role="status">{mapStatus === 'error' ? 'Map unavailable' : 'Loading map…'}</span>
  return <ComposableMap className="home-continent-map" width={800} height={350} projectionConfig={{ center: [0, 0], scale: 130 }} role="img" aria-label={`World map highlighting ${continent}`}>
    <Geographies geography={worldFeatures}>
      {({ geographies }) => <g className="home-continent-land">{geographies.map((geography) => {
        const numericCode = String(geography.id).padStart(3, '0')
        const code = iso31661NumericToAlpha2[numericCode]?.toLowerCase()
        const isHighlighted = code ? countriesByCode.get(code)?.continent === continent : false
        return <Geography key={geography.rsmKey} geography={geography} fill={isHighlighted ? '#78927e' : '#dfe4dc'} stroke="none" />
      })}</g>}
    </Geographies>
  </ComposableMap>
})

function WorldMap({ countries, loadState, errorMessage, onRetry, mapTopology, mapStatus }) {
  const [search, setSearch] = useState('')
  const [selectedCode, setSelectedCode] = useState('')
  const [mapZoom, setMapZoom] = useState(1)
  const [mapCenter, setMapCenter] = useState([0, 0])
  const [isPanning, setIsPanning] = useState(false)
  const searchInputRef = useRef(null)
  const minZoom = 1
  const maxZoom = 6
  const countriesByCode = useMemo(() => new Map(
    countries.filter((country) => country.cca2).map((country) => [country.cca2.toLowerCase(), country]),
  ), [countries])
  const searchableCountries = useMemo(() => [...countriesByCode.values()], [countriesByCode])
  const selectedCountry = countriesByCode.get(selectedCode)
  const query = search.trim().toLocaleLowerCase()
  const matches = query ? searchableCountries.filter((country) => country.name.toLocaleLowerCase().includes(query)).slice(0, 8) : []
  const selectedRegion = selectedCountry
    ? [selectedCountry.continent, selectedCountry.region, selectedCountry.subregion].filter((value, index, values) => value && values.indexOf(value) === index).join(' · ')
    : ''
  const selectedCapital = selectedCountry?.capital?.length ? `Capital: ${selectedCountry.capital.join(', ')}` : ''

  function selectCountry(code) {
    setSelectedCode(code.toLowerCase())
    setSearch('')
  }

  function resetSelection() {
    setSelectedCode('')
    setSearch('')
  }

  function handleMapMoveEnd({ coordinates, zoom }) {
    if (coordinates) setMapCenter(coordinates)
    if (typeof zoom === 'number') setMapZoom(zoom)
    setIsPanning(false)
  }

  function handleMapMove({ dragging }) {
    const eventType = dragging?.type
    if (eventType === 'mousemove' || eventType === 'touchmove') setIsPanning(true)
  }

  function filterMapZoomEvent(event) {
    if (event.type === 'mousedown' && mapZoom <= minZoom) return false
    if (event.type === 'touchstart' && mapZoom <= minZoom && event.touches?.length < 2) return false
    return !event.ctrlKey && !event.button
  }

  function resetMapView() {
    setMapCenter([0, 0])
    setMapZoom(minZoom)
  }

  function onPathKeyDown(event, code) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      selectCountry(code)
    }
  }

  function onSearchKeyDown(event) {
    if (event.key === 'ArrowDown' && matches.length) {
      event.preventDefault()
      document.querySelector('#country-search-results button')?.focus()
    }
    if (event.key === 'Escape') setSearch('')
  }

  function onSuggestionKeyDown(event, index) {
    const options = [...document.querySelectorAll('#country-search-results button')]
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      options[(index + 1) % options.length]?.focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (index === 0) searchInputRef.current?.focus()
      else options[index - 1]?.focus()
    } else if (event.key === 'Escape') {
      setSearch('')
      searchInputRef.current?.focus()
    }
  }

  return (
    <>
      <section className="home-intro" aria-labelledby="home-title">
        <div className="home-intro-copy">
          <p className="eyebrow">A living atlas of culture</p>
          <h1 id="home-title">Every country holds a world of its own.</h1>
          <p className="home-intro-description">Explore the histories, food, traditions, and everyday life that make each place unique.</p>
          <div className="home-intro-actions">
            <a className="home-primary-action" href="#home-map">Explore the map <span aria-hidden="true">↓</span></a>
            <a className="home-secondary-action" href="/countries">Browse all countries <span aria-hidden="true">↗</span></a>
          </div>
        </div>
          <div className="home-map-search-area">
            <label className="country-search home-map-search">
              <span className="sr-only">Search countries</span>
              <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.7" cy="8.7" r="5.7" /><path d="m13 13 4 4" /></svg>
              <input ref={searchInputRef} type="search" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={onSearchKeyDown} placeholder="Search a country" aria-label="Search a country" aria-autocomplete="list" aria-expanded={matches.length > 0} aria-controls="country-search-results" />
            </label>
            {matches.length > 0 && <ul className="search-results home-country-search-results" id="country-search-results" aria-label="Matching countries">
              {matches.map((country, index) => <li key={country.cca2}><button type="button" onKeyDown={(event) => onSuggestionKeyDown(event, index)} onClick={() => selectCountry(country.cca2)}><span>{country.flagEmoji || '—'}</span>{country.name}</button></li>)}
            </ul>}
            {query && !matches.length && loadState === 'ready' && <p className="home-search-empty" role="status">No matching country. Try another name.</p>}
            {selectedCountry && <button className="reset-selection home-reset-selection" type="button" onClick={resetSelection}>Clear selection <span aria-hidden="true">×</span></button>}
          </div>
        <div className="home-map-column">
          <div className={`home-map-stage${mapZoom > minZoom ? ' is-pannable' : ''}${isPanning ? ' is-panning' : ''}`} id="home-map" aria-busy={loadState === 'loading' || mapStatus === 'loading'}>
            <ComposableMap className="world-map home-world-map" projectionConfig={{ scale: 150 }} role="group" aria-label="Interactive world map with country boundaries">
              <ZoomableGroup center={mapCenter} zoom={mapZoom} minZoom={minZoom} maxZoom={maxZoom} translateExtent={[[0, 0], [800, 600]]} filterZoomEvent={filterMapZoomEvent} onMove={handleMapMove} onMoveEnd={handleMapMoveEnd}>
                <Geographies geography={mapTopology || []}>
                  {({ geographies, borders, outline }) => <g>
                    {geographies.map((geography) => {
                      const numericCode = String(geography.id).padStart(3, '0')
                      const code = iso31661NumericToAlpha2[numericCode]?.toLowerCase()
                      const country = code ? countriesByCode.get(code) : undefined
                      const selected = selectedCode === code
                      return <Geography key={geography.rsmKey} geography={geography} className={`map-country${selected ? ' is-selected' : ''}${country ? ' is-available' : ' is-unavailable'}`} fill={selected ? 'var(--forest)' : country ? '#e1e4dc' : '#ecebe4'} stroke="none" role={country ? 'button' : undefined} tabIndex={country ? 0 : -1} aria-label={country ? `Select ${country.name}` : undefined} aria-pressed={country ? selected : undefined} title={country?.name || geography.properties?.name} onClick={country ? () => selectCountry(code) : undefined} onKeyDown={country ? (event) => onPathKeyDown(event, code) : undefined} />
                    })}
                    <path d={borders?.svgPath || ''} className="map-borders" aria-hidden="true" />
                    <path d={outline?.svgPath || ''} className="map-borders map-outline" aria-hidden="true" />
                  </g>}
                </Geographies>
              </ZoomableGroup>
            </ComposableMap>
            <div className="map-zoom-controls" role="group" aria-label="Map zoom controls">
              <button type="button" onClick={() => setMapZoom((zoom) => Math.min(maxZoom, zoom + 0.5))} disabled={mapZoom >= maxZoom} aria-label="Zoom in">+</button>
              <button type="button" onClick={() => setMapZoom((zoom) => Math.max(minZoom, zoom - 0.5))} disabled={mapZoom <= minZoom} aria-label="Zoom out">−</button>
              <button className="map-zoom-reset" type="button" onClick={resetMapView} disabled={mapZoom === minZoom && mapCenter[0] === 0 && mapCenter[1] === 0}>Reset</button>
            </div>
            {(loadState === 'loading' || mapStatus === 'loading') && <span className="home-map-status" role="status">Loading country map…</span>}
            {(loadState === 'error' || mapStatus === 'error') && <span className="home-map-status" role="status">Country map unavailable. Search below to browse profiles.</span>}
          </div>
          <div className="home-map-details">
          <aside className="home-selected-country" aria-live="polite" aria-label="Selected country">
            {loadState === 'ready' && selectedCountry && <div className="home-selected-country-info">
              <CountryFlag country={selectedCountry} className="home-selected-flag" />
              <div className="home-selected-country-copy">
                <span>Selected country</span>
                <strong>{selectedCountry.name}</strong>
                {(selectedCapital || selectedRegion) && <small>{[selectedCapital, selectedRegion].filter(Boolean).join(' · ')}</small>}
              </div>
              <a className="home-selected-country-action" href={`/countries/${encodeURIComponent(selectedCountry.slug)}`}>Explore Country <span aria-hidden="true">↗</span></a>
            </div>}
            {loadState === 'ready' && !selectedCountry && <p className="home-selected-country-empty">Select a country on the map to explore its culture.</p>}
            {loadState === 'loading' && <p className="home-selected-country-empty" role="status">Loading country profiles…</p>}
            {loadState === 'error' && <div className="home-selected-country-error" role="alert"><p>{errorMessage}</p><button type="button" onClick={onRetry}>Try again</button></div>}
            {loadState === 'empty' && <p className="home-selected-country-empty">No country profiles are available yet.</p>}
          </aside>
          <div className="home-map-caption">
            <span><strong>{loadState === 'ready' ? countries.length : '—'}</strong> Country Profiles</span>
            <span>Interactive world map</span>
          </div>
          <p className="map-attribution">Boundary data: <a href="https://www.naturalearthdata.com/" target="_blank" rel="noreferrer">Natural Earth</a>, via <a href="https://github.com/topojson/world-atlas" target="_blank" rel="noreferrer">World Atlas</a>. Public domain.</p>
          </div>
        </div>
      </section>

    </>
  )
}

export default function Home({ countries, loadState, errorMessage, onRetry }) {
  const [discovery, setDiscovery] = useState({ status: 'loading', entries: [] })
  const [community, setCommunity] = useState({ status: 'loading', posts: [] })
  const [dataAttempt, setDataAttempt] = useState(0)
  const [mapData, setMapData] = useState({ status: 'loading', topology: null, features: null })
  useEffect(() => {
    const controller = new AbortController()
    fetch('/countries-50m.json', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Country boundaries could not be loaded.')
        return response.json()
      })
      .then((topology) => {
        const object = topology?.objects?.countries
        if (!object) throw new Error('Country boundary data is incomplete.')
        const features = topojsonFeature(topology, object).features
        if (!controller.signal.aborted) setMapData({ status: 'ready', topology, features })
      })
      .catch(() => { if (!controller.signal.aborted) setMapData({ status: 'error', topology: null, features: null }) })
    return () => controller.abort()
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    fetchGlobalSearch({ type: 'cultural-entry', limit: 50 }, { signal: controller.signal })
      .then(({ results }) => { if (!controller.signal.aborted) setDiscovery({ status: 'ready', entries: results.filter((entry) => entry.image?.url && entry.country?.slug) }) })
      .catch(() => { if (!controller.signal.aborted) setDiscovery({ status: 'error', entries: [] }) })
    fetchCommunityPosts({ page: 1, limit: 3, signal: controller.signal })
      .then(({ posts }) => { if (!controller.signal.aborted) setCommunity({ status: 'ready', posts: posts.filter((post) => post.image?.url) }) })
      .catch(() => { if (!controller.signal.aborted) setCommunity({ status: 'error', posts: [] }) })
    return () => controller.abort()
  }, [dataAttempt])

  const featuredCountries = useMemo(() => [...countries]
    .sort((first, second) => first.name.localeCompare(second.name))
    .slice(0, 6), [countries])
  const publishedEntries = discovery.entries
  const countriesByCode = useMemo(() => new Map(countries.filter((country) => country.cca2).map((country) => [country.cca2.toLowerCase(), country])), [countries])
  const featuredStories = publishedEntries.slice(0, 6)
  const formatPopulation = (population) => Number.isFinite(population) ? new Intl.NumberFormat().format(population) : ''

  return <main>
    <WorldMap countries={countries} loadState={loadState} errorMessage={errorMessage} onRetry={onRetry} mapTopology={mapData.topology} mapStatus={mapData.status} />
    {loadState === 'ready' && featuredCountries.length > 0 && <section className="home-country-section" aria-labelledby="home-countries-title">
      <div className="home-country-heading">
        <div><p className="eyebrow">Begin anywhere</p><h2 id="home-countries-title">A world of cultures</h2><p className="home-section-intro">Browse country profiles below, or choose any highlighted country above.</p></div>
        <a href="/countries">View all countries <span aria-hidden="true">↗</span></a>
      </div>
      <div className="home-country-grid">
        {featuredCountries.map((country, index) => <a className="home-country-card" href={`/countries/${encodeURIComponent(country.slug)}`} key={country.cca2 || country.slug}>
          <span className="home-country-visual">
            <span className="home-country-card-index">{String(index + 1).padStart(2, '0')}</span>
            <CountryFlag country={country} className="home-country-flag" />
          </span>
          <span className="home-country-copy">
            <span className="home-country-name">{country.name}</span>
          <span className="home-country-region">{[country.continent, country.subregion || (country.region !== country.continent ? country.region : '')].filter(Boolean).join(' · ') || 'Region unavailable'}</span>
          <span className="home-country-facts"><strong>Capital</strong> · {country.capital?.length ? country.capital.join(', ') : 'Unavailable'}</span>
          <span className="home-country-facts"><strong>Population</strong> · {Number.isFinite(country.population) ? formatPopulation(country.population) : 'Unavailable'}</span>
          </span>
          <span className="home-country-arrow" aria-hidden="true">↗</span>
        </a>)}
      </div>
    </section>}

    {loadState === 'ready' && countries.length > 0 && <section className="home-continent-section" aria-labelledby="home-continents-title">
      <div className="home-section-heading"><div><p className="eyebrow">Find your next destination</p><h2 id="home-continents-title">Explore by continent</h2></div><a href="/countries">Browse the directory <span aria-hidden="true">↗</span></a></div>
      <div className="home-continent-grid">{CONTINENTS.map((continent) => {
        const count = countries.filter((country) => country.continent === continent).length
        const href = `/countries?continent=${encodeURIComponent(continent)}`
        return <a className="home-continent-card" href={href} key={continent}>
          <div className="home-continent-map-frame"><ContinentSilhouette continent={continent} countriesByCode={countriesByCode} worldFeatures={mapData.features} mapStatus={mapData.status} /></div>
          <span className="home-continent-copy"><strong>{continent}</strong><small>{count} {count === 1 ? 'country' : 'countries'}</small></span><span className="home-continent-arrow" aria-hidden="true">↗</span>
        </a>
      })}</div>
    </section>}

    {discovery.status === 'ready' && featuredStories.length > 0 && <section className="home-discover-section" aria-labelledby="home-discover-title">
      <div className="home-section-heading"><div><p className="eyebrow">Stories from around the world</p><h2 id="home-discover-title">Discover cultures</h2></div><a href="/search?type=cultural-entry">Explore all stories <span aria-hidden="true">↗</span></a></div>
      <div className="home-discover-grid">{featuredStories.map((entry) => <CulturalCard key={entry.id} entry={entry} />)}</div>
    </section>}
    {discovery.status === 'loading' && <p className="home-content-status" role="status">Loading published cultural stories…</p>}
    {discovery.status === 'error' && <p className="home-content-status" role="status">Cultural stories are temporarily unavailable. <button type="button" onClick={() => setDataAttempt((value) => value + 1)}>Try again</button></p>}

    {community.status === 'ready' && community.posts.length > 0 && <section className="home-community-section" aria-labelledby="home-community-title">
      <div className="home-section-heading"><div><p className="eyebrow">Shared by the community</p><h2 id="home-community-title">Community highlights</h2></div><a href="/community">Visit the community <span aria-hidden="true">↗</span></a></div>
      <div className="home-community-grid">{community.posts.slice(0, 3).map((post) => <CommunityHighlight key={post.id} post={post} />)}</div>
    </section>}
    {community.status === 'loading' && <p className="home-content-status" role="status">Loading community highlights…</p>}
    {community.status === 'error' && <p className="home-content-status" role="status">Community highlights are temporarily unavailable. <button type="button" onClick={() => setDataAttempt((value) => value + 1)}>Try again</button></p>}

    <section className="home-contribute-cta" aria-labelledby="home-contribute-title"><p className="eyebrow">Add to the atlas</p><h2 id="home-contribute-title">Every culture has a story worth sharing.</h2><p>Share what you know about history, food, festivals, traditions, and places.</p><a className="home-primary-action" href="/contribute">Share Your Knowledge <span aria-hidden="true">↗</span></a></section>
  </main>
}
