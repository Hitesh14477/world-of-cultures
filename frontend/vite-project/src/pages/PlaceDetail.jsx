import SourceReferences from '../components/SourceReferences.jsx'
import usePublishedCountryRecord from '../hooks/usePublishedCountryRecord.js'
import FavouriteButton from '../components/FavouriteButton.jsx'
import FactualClaims from '../components/FactualClaims.jsx'

function categoryLabel(value = '') {
  return value.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

function DetailFeedback({ status, message, onRetry }) {
  if (status === 'loading') return <p className="detail-feedback" role="status">Loading place information…</p>
  return <div className="detail-feedback" role={status === 'error' ? 'alert' : 'status'}>
    <h1>{status === 'not-found' ? 'Published place not found' : 'Place information unavailable'}</h1>
    <p>{message}</p>
    {status === 'error' && <button className="detail-retry" type="button" onClick={onRetry}>Try again</button>}
    <a className="detail-back-link" href="/countries">Browse countries</a>
  </div>
}

export default function PlaceDetail({ slug, placeId, auth }) {
  const { status, country, record, message, onRetry } = usePublishedCountryRecord({
    slug,
    recordId: placeId,
    type: 'place',
  })

  if (status !== 'ready') {
    return <main className="record-detail-page"><DetailFeedback status={status} message={message} onRetry={onRetry} /></main>
  }

  return <main className="record-detail-page">
    <a className="detail-back-link" href={`/countries/${encodeURIComponent(slug)}`}>← Back to {country.name}</a>
    <article className="record-detail">
      <p className="eyebrow">{country.name} · {categoryLabel(record.category)}</p>
      <h1>{record.name}</h1>
      <FavouriteButton auth={auth} type="place" targetId={String(record._id)} />
      {(record.location || record.region) && <p className="record-region">{[record.location, record.region].filter(Boolean).join(' · ')}</p>}
      <p className="record-type">Place type: {categoryLabel(record.category)}</p>
      {record.image?.url && <figure className="contribution-published-image record-contribution-image"><img src={record.image.url} alt={record.image.caption || record.name} />{record.image.caption && <figcaption>{record.image.caption}</figcaption>}</figure>}
      {record.description
        ? <section className="record-description-section" aria-labelledby="record-description-heading">
          <h2 id="record-description-heading">Description</h2>
          <div className="record-description">{record.description}</div>
        </section>
        : <p className="collection-note">A description for this place is still being collected.</p>}
      <FactualClaims facts={record.facts} />
      <section className="record-source-section" aria-labelledby="record-sources-heading">
        <h2 id="record-sources-heading">Sources and attribution</h2>
        <SourceReferences sources={record.sources} imageAttributions={record.imageAttributions} />
      </section>
    </article>
  </main>
}
