import SourceReferences from '../components/SourceReferences.jsx'
import usePublishedCountryRecord from '../hooks/usePublishedCountryRecord.js'
import FavouriteButton from '../components/FavouriteButton.jsx'
import FactualClaims from '../components/FactualClaims.jsx'

function categoryLabel(value = '') {
  return value.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

function DetailFeedback({ status, message, onRetry }) {
  if (status === 'loading') return <p className="detail-feedback" role="status">Loading cultural story…</p>
  return <div className="detail-feedback" role={status === 'error' ? 'alert' : 'status'}>
    <h1>{status === 'not-found' ? 'Published story not found' : 'Cultural story unavailable'}</h1>
    <p>{message}</p>
    {status === 'error' && <button className="detail-retry" type="button" onClick={onRetry}>Try again</button>}
    <a className="detail-back-link" href="/countries">Browse countries</a>
  </div>
}

export default function CulturalEntryDetail({ slug, entryId, auth }) {
  const { status, country, record, message, onRetry } = usePublishedCountryRecord({
    slug,
    recordId: entryId,
    type: 'culturalEntry',
  })

  if (status !== 'ready') {
    return <main className="record-detail-page"><DetailFeedback status={status} message={message} onRetry={onRetry} /></main>
  }

  return <main className="record-detail-page">
    <a className="detail-back-link" href={`/countries/${encodeURIComponent(slug)}`}>← Back to {country.name}</a>
    <article className="record-detail">
      <p className="eyebrow">{country.name} · {categoryLabel(record.category)}</p>
      <h1>{record.title}</h1>
      <FavouriteButton auth={auth} type="cultural-entry" targetId={String(record._id)} />
      {record.region && <p className="record-region">{record.region}</p>}
      {record.summary && <p className="record-lead">{record.summary}</p>}
      {record.image?.url && <figure className="contribution-published-image record-contribution-image"><img src={record.image.url} alt={record.image.caption || record.title} />{record.image.caption && <figcaption>{record.image.caption}</figcaption>}</figure>}
      {record.content && <section className="record-description-section" aria-labelledby="record-description-heading">
        <h2 id="record-description-heading">Description</h2>
        <div className="record-description">{record.content}</div>
      </section>}
      <FactualClaims facts={record.facts} />
      <section className="record-source-section" aria-labelledby="record-sources-heading">
        <h2 id="record-sources-heading">Sources and attribution</h2>
        <SourceReferences sources={record.sources} imageAttributions={record.imageAttributions} />
      </section>
    </article>
  </main>
}
