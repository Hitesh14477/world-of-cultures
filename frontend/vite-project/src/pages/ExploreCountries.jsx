import { useMemo, useState } from 'react'
import CountryFlag from '../components/CountryFlag.jsx'

const PAGE_SIZE = 40

function countryRegion(country) {
  return country.subregion || country.region || ''
}

function countryKey(country) {
  return country.cca2 || country.cca3 || country.slug || country.name
}

function PageFeedback({ children, action }) {
  return <div className="directory-feedback" role={action ? 'alert' : undefined}><p>{children}</p>{action}</div>
}

export default function ExploreCountries({ countries, loadState, errorMessage, onRetry }) {
  const [search, setSearch] = useState('')
  const [continent, setContinent] = useState('')
  const [region, setRegion] = useState('')
  const [sort, setSort] = useState('name')
  const [page, setPage] = useState(1)
  const continents = useMemo(() => [...new Set(countries.map((country) => country.continent).filter(Boolean))].sort(), [countries])
  const regions = useMemo(() => [...new Set(countries.filter((country) => !continent || country.continent === continent).map(countryRegion).filter(Boolean))].sort(), [countries, continent])
  const filteredCountries = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return countries
      .filter((country) => !query || country.name.toLocaleLowerCase().includes(query) || country.officialName?.toLocaleLowerCase().includes(query))
      .filter((country) => !continent || country.continent === continent)
      .filter((country) => !region || countryRegion(country) === region)
      .sort((first, second) => first.name.localeCompare(second.name) * (sort === '-name' ? -1 : 1))
  }, [countries, search, continent, region, sort])
  const pageCount = Math.max(1, Math.ceil(filteredCountries.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const firstIndex = (currentPage - 1) * PAGE_SIZE
  const visibleCountries = filteredCountries.slice(firstIndex, firstIndex + PAGE_SIZE)
  function clearFilters() {
    setSearch('')
    setContinent('')
    setRegion('')
    setSort('name')
    setPage(1)
  }

  if (loadState === 'loading') return <main className="directory-page"><div className="directory-loading" aria-busy="true" aria-label="Loading countries">{Array.from({ length: 10 }, (_, index) => <div className="directory-skeleton" key={index} />)}</div></main>
  if (loadState === 'error') return <main className="directory-page"><PageFeedback action={<button type="button" onClick={onRetry}>Try again</button>}>{errorMessage}</PageFeedback></main>
  if (loadState === 'empty') return <main className="directory-page"><PageFeedback>No countries are available in the directory yet.</PageFeedback></main>

  return <main className="directory-page">
    <section className="directory-content" aria-labelledby="directory-list-title">
      <div className="directory-controls">
        <label className="directory-search"><span className="sr-only">Search countries by name</span><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.7" cy="8.7" r="5.7" /><path d="m13 13 4 4" /></svg><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Search countries" /></label>
        <label className="directory-filter"><span className="sr-only">Filter by continent</span><select value={continent} onChange={(event) => { setContinent(event.target.value); setRegion(''); setPage(1) }}><option value="">All continents</option>{continents.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="directory-filter"><span className="sr-only">Filter by region</span><select value={region} onChange={(event) => { setRegion(event.target.value); setPage(1) }}><option value="">All regions</option>{regions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="directory-filter directory-sort"><span className="sr-only">Sort countries alphabetically</span><select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1) }}><option value="name">A to Z</option><option value="-name">Z to A</option></select></label>
      </div>

      <div className="directory-list-heading"><h2 id="directory-list-title">Countries</h2><span>{filteredCountries.length} {filteredCountries.length === 1 ? 'result' : 'results'}</span></div>
      {filteredCountries.length === 0 ? <div className="directory-feedback directory-no-results"><p>No countries match those filters.</p><button type="button" onClick={clearFilters}>Clear filters</button></div> : <>
        <ul className="directory-country-grid">{visibleCountries.map((country) => {
          const key = countryKey(country)
          return <li key={key}><a className="directory-country" href={`/countries/${country.slug}`} aria-label={`Explore ${country.name}`}>
            <span className="directory-card-top"><CountryFlag country={country} className="directory-flag" /><span className="directory-arrow" aria-hidden="true">↗</span></span>
            <span className="directory-country-name">{country.name}</span>
            <span className="directory-card-detail"><span>Capital</span><span>{country.capital?.length ? country.capital.join(', ') : '—'}</span></span>
            <span className="directory-card-detail"><span>Region</span><span>{countryRegion(country) || '—'}</span></span>
          </a></li>
        })}</ul>
        <nav className="directory-pagination" aria-label="Country pages"><span>Showing {firstIndex + 1}–{Math.min(firstIndex + PAGE_SIZE, filteredCountries.length)} of {filteredCountries.length}</span><div>
          <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1}>Previous</button><span>Page {currentPage} of {pageCount}</span><button type="button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={currentPage === pageCount}>Next</button>
        </div></nav>
      </>}
    </section>
  </main>
}
