export default function CountryFlag({ country, className = 'selected-flag' }) {
  if (country.flagImageUrl?.startsWith('https://')) {
    return <img className={className} src={country.flagImageUrl} alt={`Flag of ${country.name}`} loading="lazy" />
  }
  return <span className={`${className}-emoji`} role="img" aria-label={`Flag of ${country.name}`}>{country.flagEmoji || '—'}</span>
}
