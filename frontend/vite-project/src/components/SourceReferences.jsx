function formatAccessDate(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? '' : `Accessed ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(date)}`
}

export default function SourceReferences({ sources = [], imageAttributions = [] }) {
  if (!sources.length && !imageAttributions.length) {
    return <p className="record-no-sources">No source references are available for this item yet.</p>
  }

  return <div className="record-sources">
    {sources.map((source, index) => <article className="record-source" key={`${source.url}-${index}`}>
      <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a>
      {source.publisher && <span>{source.publisher}</span>}
      {formatAccessDate(source.accessedAt) && <span>{formatAccessDate(source.accessedAt)}</span>}
      {source.attributionText && <p className="source-attribution">{source.attributionText}</p>}
      {source.license && <p className="source-license">License: {source.license}{source.licenseUrl && <> · <a href={source.licenseUrl} target="_blank" rel="noreferrer">license details</a></>}</p>}
      {source.licenseScope && <p className="source-license-scope">{source.licenseScope}</p>}
    </article>)}
    {imageAttributions.map((image, index) => <article className="record-source" key={`${image.sourceUrl}-${index}`}>
      <a href={image.sourceUrl} target="_blank" rel="noreferrer">{image.attributionText || image.title || 'Image attribution'}</a>
      {image.creator && <span>{image.creator}</span>}
      {image.license && <p className="source-license">License: {image.license}{image.licenseUrl && <> · <a href={image.licenseUrl} target="_blank" rel="noreferrer">license details</a></>}</p>}
    </article>)}
  </div>
}
