import SourceReferences from './SourceReferences.jsx'

export default function FactualClaims({ facts = [] }) {
  if (!facts.length) return null
  return <section className="record-source-section factual-claims" aria-label="Structured factual claims">
    <h2>Structured factual claims</h2>
    {facts.map((fact, index) => <article className="record-source" key={`${fact.propertyId}-${index}`}>
      <strong>{fact.propertyLabel} <span className="admin-muted">({fact.propertyId})</span></strong>
      <p>{fact.valueUrl ? <a href={fact.valueUrl} target="_blank" rel="noreferrer">{fact.value}</a> : fact.value}</p>
      <SourceReferences sources={fact.references} />
    </article>)}
  </section>
}
