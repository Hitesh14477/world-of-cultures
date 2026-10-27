import { useEffect, useRef, useState } from 'react'
import CountryFlag from '../components/CountryFlag.jsx'
import { fetchCountries, fetchGlobalSearch } from '../services/api.js'

const CONTINENTS = ['Africa', 'Asia', 'Europe', 'North America', 'Oceania', 'South America']
const CATEGORIES = [
  ['history', 'History'],
  ['traditional_food', 'Traditional food'],
  ['festivals', 'Festivals'],
  ['traditional_clothing', 'Traditional clothing'],
  ['customs_and_traditions', 'Customs and traditions'],
  ['languages_and_dialects', 'Languages and dialects'],
  ['mythology_and_folklore', 'Mythology and folklore'],
  ['music_and_dance', 'Music and dance'],
  ['everyday_life', 'Everyday life'],
]
const EMPTY_FILTERS = { type: '', country: '', continent: '', region: '', category: '' }
const EMPTY_PAGINATION = { page: 1, limit: 20, total: 0, totalPages: 0 }

function getResultUrl(result) {
  const slug = result.country?.slug
  if (!slug) return '/countries'
  if (result.type === 'country') return `/countries/${encodeURIComponent(result.id)}`
  if (result.type === 'cultural-entry') return `/countries/${encodeURIComponent(slug)}/cultural-entries/${encodeURIComponent(result.id)}`
  return `/countries/${encodeURIComponent(slug)}/places/${encodeURIComponent(result.id)}`
}

function resultTypeLabel(type) {
  if (type === 'country') return 'Country'
  if (type === 'cultural-entry') return 'Cultural entry'
  return 'Place'
}

function SearchResult({ result }) {
  return <article className="global-search-result">
    <a className="global-search-result-link" href={getResultUrl(result)}>
      <span className="global-search-result-meta">
        {result.country && <CountryFlag country={result.country} className="global-search-flag" />}
        <span>{resultTypeLabel(result.type)}</span>
        {result.category && <span>{result.category.replaceAll('_', ' ')}</span>}
      </span>
      <span className="global-search-result-title">{result.title}<span aria-hidden="true">↗</span></span>
      {result.type !== 'country' && result.country?.name && <span className="global-search-country">{result.country.name}</span>}
      {result.description && <span className="global-search-description">{result.description}</span>}
    </a>
  </article>
}

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [results, setResults] = useState([])
  const [pagination, setPagination] = useState(EMPTY_PAGINATION)
  const [searchState, setSearchState] = useState('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [retry, setRetry] = useState(0)
  const [countries, setCountries] = useState([])
  const [countriesState, setCountriesState] = useState('loading')
  const requestId = useRef(0)

  useEffect(() => {
    const controller = new AbortController()
    fetchCountries({ signal: controller.signal })
      .then((items) => {
        if (controller.signal.aborted) return
        setCountries(items)
        setCountriesState(items.length ? 'ready' : 'empty')
      })
      .catch(() => {
        if (!controller.signal.aborted) setCountriesState('error')
      })
    return () => controller.abort()
  }, [])

  const hasFilters = Object.values(filters).some(Boolean)
  const hasSearch = Boolean(query.trim() || hasFilters)

  useEffect(() => {
    const controller = new AbortController()
    const thisRequest = ++requestId.current
    if (!hasSearch) return () => controller.abort()

    const timer = setTimeout(() => {
      setSearchState('loading')
      setErrorMessage('')
      fetchGlobalSearch({ q: query.trim(), ...filters, page, limit: 20 }, { signal: controller.signal })
        .then(({ results: nextResults, pagination: nextPagination }) => {
          if (controller.signal.aborted || thisRequest !== requestId.current) return
          setResults(nextResults)
          setPagination(nextPagination)
          setSearchState(nextResults.length ? 'ready' : 'empty')
        })
        .catch((error) => {
          if (controller.signal.aborted || thisRequest !== requestId.current) return
          setErrorMessage(error.response?.data?.message || error.message || 'Search could not be completed.')
          setSearchState('error')
        })
    }, 300)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, filters, page, hasSearch, retry])

  function updateQuery(value) {
    requestId.current += 1
    setQuery(value)
    setPage(1)
    setErrorMessage('')
    if (value.trim() || hasFilters) setSearchState('loading')
    else {
      setResults([])
      setPagination(EMPTY_PAGINATION)
      setSearchState('idle')
    }
  }

  function updateFilter(key, value) {
    const nextFilters = { ...filters, [key]: value }
    if (key === 'type' && value !== 'cultural-entry') nextFilters.category = ''
    if (key === 'category' && value) nextFilters.type = 'cultural-entry'
    requestId.current += 1
    setFilters(nextFilters)
    setPage(1)
    setErrorMessage('')
    if (query.trim() || Object.values(nextFilters).some(Boolean)) setSearchState('loading')
    else {
      setResults([])
      setPagination(EMPTY_PAGINATION)
      setSearchState('idle')
    }
  }

  function clearSearch() {
    requestId.current += 1
    setQuery('')
    setFilters(EMPTY_FILTERS)
    setPage(1)
    setResults([])
    setPagination(EMPTY_PAGINATION)
    setErrorMessage('')
    setSearchState('idle')
  }

  function changePage(nextPage) {
    requestId.current += 1
    setPage(nextPage)
    setSearchState('loading')
  }

  function retrySearch() {
    requestId.current += 1
    setSearchState('loading')
    setRetry((value) => value + 1)
  }

  return <main className="global-search-page">
    <header className="global-search-heading">
      <p className="eyebrow">World of Cultures</p>
      <h1>Find a place, a practice, a story.</h1>
      <p>Search countries and published cultural records from across the atlas.</p>
    </header>

    <section className="global-search-controls" aria-label="Search and filters">
      <label className="global-search-input-label" htmlFor="global-search-input">Search the atlas</label>
      <div className="global-search-input-wrap">
        <input
          id="global-search-input"
          type="search"
          autoComplete="off"
          maxLength={100}
          value={query}
          onChange={(event) => updateQuery(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); retrySearch() } }}
          placeholder="Try a country, festival, food, or landmark"
          aria-describedby="global-search-help"
        />
        {query && <button type="button" onClick={() => updateQuery('')} aria-label="Clear search text">×</button>}
      </div>
      <p id="global-search-help" className="global-search-help">Search matches country names and facts, published cultural entries, and places.</p>
      <div className="global-search-filters">
        <label>Result type<select value={filters.type} onChange={(event) => updateFilter('type', event.target.value)}>
          <option value="">All types</option><option value="country">Countries</option><option value="cultural-entry">Cultural entries</option><option value="place">Places</option>
        </select></label>
        <label>Country<select value={filters.country} onChange={(event) => updateFilter('country', event.target.value)} disabled={countriesState !== 'ready'}>
          <option value="">All countries</option>
          {countries.map((country) => <option value={country.slug} key={country.slug}>{country.name}</option>)}
        </select>{countriesState === 'loading' && <span className="global-search-filter-help">Loading countries…</span>}{countriesState === 'error' && <span className="global-search-filter-help">Country filters unavailable.</span>}</label>
        <label>Continent<select value={filters.continent} onChange={(event) => updateFilter('continent', event.target.value)}>
          <option value="">All continents</option>{CONTINENTS.map((continent) => <option key={continent} value={continent}>{continent}</option>)}
        </select></label>
        <label>Country region<input type="search" maxLength={100} value={filters.region} onChange={(event) => updateFilter('region', event.target.value)} placeholder="e.g. Southern Asia" /></label>
        <label>Cultural category<select value={filters.category} onChange={(event) => updateFilter('category', event.target.value)}>
          <option value="">All categories</option>{CATEGORIES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select></label>
      </div>
      {hasSearch && <button className="global-search-clear" type="button" onClick={clearSearch}>Clear search and filters</button>}
    </section>

    <section className="global-search-results" aria-label="Search results" aria-live="polite">
      {searchState === 'idle' && <p className="global-search-feedback">Enter a search term or choose a filter to begin.</p>}
      {searchState === 'loading' && <p className="global-search-feedback" role="status">Searching the atlas…</p>}
      {searchState === 'error' && <div className="global-search-feedback is-error" role="alert"><p>{errorMessage}</p><button type="button" onClick={retrySearch}>Try again</button></div>}
      {searchState === 'empty' && <p className="global-search-feedback">No published results matched. Try another term or adjust the filters.</p>}
      {searchState === 'ready' && <>
        <div className="global-search-result-count">{pagination.total} {pagination.total === 1 ? 'result' : 'results'}</div>
        <div className="global-search-result-list">{results.map((result) => <SearchResult key={`${result.type}-${result.id}`} result={result} />)}</div>
        {pagination.totalPages > 1 && <nav className="global-search-pagination" aria-label="Search result pages">
          <button type="button" onClick={() => changePage(page - 1)} disabled={page <= 1}>Previous</button>
          <span>Page {page} of {pagination.totalPages}</span>
          <button type="button" onClick={() => changePage(page + 1)} disabled={page >= pagination.totalPages}>Next</button>
        </nav>}
      </>}
    </section>
  </main>
}
