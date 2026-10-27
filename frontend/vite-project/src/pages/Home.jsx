import { useMemo, useState } from 'react'
import { ComposableMap, Geographies, Geography } from 'react-simple-maps/core'
import { iso31661NumericToAlpha2 } from 'iso-3166'
import CountryFlag from '../components/CountryFlag.jsx'

function WorldMap({ countries, loadState, errorMessage, onRetry }) {
  const [search, setSearch] = useState('')
  const [selectedCode, setSelectedCode] = useState('')
  const countriesByCode = useMemo(() => new Map(
    countries.filter((country) => country.cca2).map((country) => [country.cca2.toLowerCase(), country]),
  ), [countries])
  const selectedCountry = countriesByCode.get(selectedCode)
  const query = search.trim().toLocaleLowerCase()
  const matches = query ? countries.filter((country) => country.name.toLocaleLowerCase().includes(query)).slice(0, 8) : []

  function selectCountry(code) {
    setSelectedCode(code.toLowerCase())
    setSearch('')
  }

  function resetSelection() {
    setSelectedCode('')
    setSearch('')
  }

  function onPathKeyDown(event, code) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      selectCountry(code)
    }
  }

  return (
    <section className="map-section" id="countries" aria-labelledby="map-title">
      <div className="section-heading map-heading">
        <div><p className="eyebrow">Begin anywhere</p><h2 id="map-title">A world of cultures</h2></div>
        <p>Select a country on the map or search by name to begin exploring.</p>
      </div>
      <div className="map-tools">
        <label className="country-search">
          <span className="sr-only">Find a country</span>
          <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.7" cy="8.7" r="5.7" /><path d="m13 13 4 4" /></svg>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a country" aria-label="Find a country" aria-expanded={matches.length > 0} aria-controls="country-search-results" />
        </label>
        {matches.length > 0 && <ul className="search-results" id="country-search-results" aria-label="Matching countries">
          {matches.map((country) => <li key={country.cca2}><button type="button" onClick={() => selectCountry(country.cca2)}><span>{country.flagEmoji || '—'}</span>{country.name}</button></li>)}
        </ul>}
        {selectedCountry && <button className="reset-selection" type="button" onClick={resetSelection}>Reset selection <span aria-hidden="true">×</span></button>}
      </div>
      <div className="map-workspace">
        <div className="map-canvas" aria-busy={loadState === 'loading'}>
          <ComposableMap className="world-map" projectionConfig={{ scale: 150 }} role="group" aria-label="Interactive world map with country boundaries">
            <Geographies geography="/countries-50m.json">
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
          </ComposableMap>
          <p className="map-help">Select any highlighted country · Use search for smaller places</p>
          <p className="map-attribution">Boundary data: <a href="https://www.naturalearthdata.com/" target="_blank" rel="noreferrer">Natural Earth</a>, via <a href="https://github.com/topojson/world-atlas" target="_blank" rel="noreferrer">World Atlas</a>. Public domain.</p>
        </div>
        <aside className="selection-panel" aria-live="polite">
          {loadState === 'loading' && <p className="panel-message">Loading countries…</p>}
          {loadState === 'error' && <div className="panel-message panel-error" role="alert"><p>{errorMessage}</p><button type="button" onClick={onRetry}>Try again</button></div>}
          {loadState === 'empty' && <p className="panel-message">No country records are available yet.</p>}
          {loadState === 'ready' && selectedCountry && <div className="country-selection">
            <div className="selection-heading"><span>Selected country</span><button type="button" onClick={resetSelection} aria-label="Clear selected country">×</button></div>
            <CountryFlag country={selectedCountry} />
            <h3>{selectedCountry.name}</h3>
            <p className="selection-region">{[selectedCountry.continent, selectedCountry.capital?.[0]].filter(Boolean).join(' · ')}</p>
            <a className="explore-culture" href={`/countries/${selectedCountry.slug}`}>Explore its culture <span aria-hidden="true">↗</span></a>
          </div>}
          {loadState === 'ready' && !selectedCountry && <div className="selection-empty"><span className="selection-label">Your selection</span><p>Choose a country to see its flag and begin your visit.</p></div>}
        </aside>
      </div>
    </section>
  )
}

export default function Home({ countries, loadState, errorMessage, onRetry }) {
  const topics = ['History', 'Traditional Food', 'Places to Visit', 'Festivals', 'Traditions', 'Languages']
  return <main>
    <WorldMap countries={countries} loadState={loadState} errorMessage={errorMessage} onRetry={onRetry} />
    <section className="topics-section" id="topics" aria-labelledby="topics-title">
      <div className="section-heading"><div><p className="eyebrow">A closer look</p><h2 id="topics-title">Explore cultural topics</h2></div></div>
      <ul className="topics-list">{topics.map((topic, index) => <li key={topic}><span className="topic-index">0{index + 1}</span><span>{topic}</span></li>)}</ul>
    </section>
  </main>
}
