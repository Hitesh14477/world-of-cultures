import CountryFlag from './CountryFlag.jsx'

const populationFormatter = new Intl.NumberFormat()

function formatPopulation(population) {
  return typeof population === 'number' && Number.isFinite(population)
    ? populationFormatter.format(population)
    : '—'
}

export default function CountryCard({ country }) {
  const location = [country.continent, country.subregion || country.region]
    .filter((value, index, values) => value && values.indexOf(value) === index)
    .join(' · ')

  return <a className="directory-country" href={`/countries/${encodeURIComponent(country.slug)}`} aria-label={`Explore ${country.name}`}>
    <span className="directory-card-top"><CountryFlag country={country} className="directory-flag" /><span className="directory-arrow" aria-hidden="true">↗</span></span>
    <span className="directory-country-name">{country.name}</span>
    <span className="directory-card-detail"><span>Capital</span><span>{country.capital?.length ? country.capital.join(', ') : '—'}</span></span>
    <span className="directory-card-detail"><span>Region</span><span>{location || '—'}</span></span>
    <span className="directory-card-detail"><span>Population</span><span>{formatPopulation(country.population)}</span></span>
  </a>
}
