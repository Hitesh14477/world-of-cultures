import { useEffect, useRef, useState } from 'react'
import { submitCulturalEntry, submitPlace } from '../services/api.js'
import { buildAuthPath } from '../services/authNavigation.js'

const ENTRY_CATEGORIES = [
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

const PLACE_TYPES = [
  ['landmark', 'Landmark'],
  ['heritage_site', 'Heritage site'],
  ['cultural_destination', 'Cultural destination'],
  ['museum', 'Museum'],
  ['natural_site', 'Natural site'],
  ['other', 'Other'],
]

function createSource() {
  return { title: '', publisher: '', url: '', accessedAt: '', license: '', licenseUrl: '', attributionText: '', licenseScope: '' }
}

function createFormValues(kind, countrySlug = '', category = '') {
  return {
    countrySlug,
    title: '',
    category: category || (kind === 'entry' ? '' : 'landmark'),
    summary: '',
    content: '',
    name: '',
    description: '',
    location: '',
    region: '',
    sources: [createSource()],
  }
}

function SourceFields({ sources, onChange, onAdd, onRemove, disabled }) {
  return <fieldset className="contribution-sources" disabled={disabled}>
    <legend>Sources</legend>
    <p className="form-help">Add at least one reliable reference. Enter license details only when you have verified them.</p>
    {sources.map((source, index) => <fieldset className="source-fields" key={index}>
      <legend>Source {index + 1}</legend>
      <label>Source title<input required maxLength={200} value={source.title} onChange={(event) => onChange(index, 'title', event.target.value)} /></label>
      <label>Publisher<input required maxLength={160} value={source.publisher} onChange={(event) => onChange(index, 'publisher', event.target.value)} /></label>
      <label className="form-span">Source URL<input required type="url" inputMode="url" placeholder="https://…" value={source.url} onChange={(event) => onChange(index, 'url', event.target.value)} /></label>
      <label>Date accessed<input type="date" value={source.accessedAt} onChange={(event) => onChange(index, 'accessedAt', event.target.value)} /></label>
      <details className="license-fields form-span">
        <summary>Optional license and attribution details</summary>
        <div className="license-fields-grid">
          <label>License name<input maxLength={120} value={source.license} onChange={(event) => onChange(index, 'license', event.target.value)} placeholder="Only if verified" /></label>
          <label>License URL<input type="url" inputMode="url" value={source.licenseUrl} onChange={(event) => onChange(index, 'licenseUrl', event.target.value)} placeholder="https://…" /></label>
          <label className="form-span">Required attribution<textarea rows="2" maxLength={500} value={source.attributionText} onChange={(event) => onChange(index, 'attributionText', event.target.value)} /></label>
          <label className="form-span">What the license covers<textarea rows="2" maxLength={240} value={source.licenseScope} onChange={(event) => onChange(index, 'licenseScope', event.target.value)} /></label>
        </div>
        <p className="form-help">If you enter a license, complete all license and attribution fields. Do not assume a page link grants reuse rights.</p>
      </details>
      {sources.length > 1 && <button className="form-text-button" type="button" onClick={() => onRemove(index)}>Remove source {index + 1}</button>}
    </fieldset>)}
    <button className="form-text-button" type="button" onClick={onAdd} disabled={sources.length >= 10}>Add another source</button>
  </fieldset>
}

function SubmissionForm({ kind, countries, csrfToken, fixedCountry, fixedCategory }) {
  const [values, setValues] = useState(() => createFormValues(kind, fixedCountry?.slug || '', fixedCategory || ''))
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState('')
  const [imageError, setImageError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState(null)
  const [errors, setErrors] = useState([])
  const submitLock = useRef(false)
  const imageInputRef = useRef(null)

  const isEntry = kind === 'entry'
  const categories = isEntry ? ENTRY_CATEGORIES : PLACE_TYPES

  useEffect(() => () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview)
  }, [imagePreview])

  function updateField(field, value) {
    setValues((current) => ({ ...current, [field]: value }))
  }

  function updateSource(index, field, value) {
    setValues((current) => ({
      ...current,
      sources: current.sources.map((source, sourceIndex) => sourceIndex === index ? { ...source, [field]: value } : source),
    }))
  }

  function addSource() {
    setValues((current) => current.sources.length >= 10 ? current : { ...current, sources: [...current.sources, createSource()] })
  }

  function removeSource(index) {
    setValues((current) => ({ ...current, sources: current.sources.filter((_, sourceIndex) => sourceIndex !== index) }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!imageFile) {
      const message = 'An image is required for every submission.'
      setImageError(message)
      setNotice({ type: 'error', message })
      return
    }
    if (imageError) {
      setNotice({ type: 'error', message: imageError })
      return
    }
    if (submitLock.current) return
    submitLock.current = true
    setSubmitting(true)
    setNotice(null)
    setErrors([])

    const sources = values.sources.map((source) => Object.fromEntries(
      Object.entries(source).filter(([, value]) => typeof value === 'string' && value.trim()),
    ))
    const payload = isEntry
      ? { title: values.title, category: values.category, summary: values.summary, content: values.content, region: values.region, sources }
      : { name: values.name, category: values.category, description: values.description, location: values.location, region: values.region, sources }

    const formData = new FormData()
    for (const [field, value] of Object.entries(payload)) {
      if (field === 'sources') formData.append(field, JSON.stringify(value))
      else formData.append(field, value || '')
    }
    if (imageFile) {
      formData.append('image', imageFile)
      formData.append('imageCaption', values.imageCaption || '')
      formData.append('imageRightsConfirmed', values.imageRightsConfirmed ? 'true' : 'false')
    }

    try {
      const submit = isEntry ? submitCulturalEntry : submitPlace
      const response = await submit(values.countrySlug, formData, csrfToken)
      setNotice({ type: 'success', message: response.message || 'Your contribution has been submitted for review.' })
      setValues(createFormValues(kind, fixedCountry?.slug || '', fixedCategory || ''))
      setImageFile(null)
      setImagePreview('')
      setImageError('')
      if (imageInputRef.current) imageInputRef.current.value = ''
    } catch (error) {
      const response = error.response?.data
      setNotice({ type: 'error', message: response?.message || 'We could not submit your contribution. Please try again.' })
      setErrors(Array.isArray(response?.errors) ? response.errors : [])
    } finally {
      submitLock.current = false
      setSubmitting(false)
    }
  }

  return <form className="contribution-form" onSubmit={handleSubmit}>
    {notice && <div className={`submission-notice is-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>
      <p>{notice.message}</p>
      {errors.length > 0 && <ul>{errors.map((error, index) => <li key={`${error.field}-${index}`}><strong>{error.field}:</strong> {error.message}</li>)}</ul>}
    </div>}
    <fieldset className="contribution-fields" disabled={submitting}>
      <legend className="sr-only">{isEntry ? 'Cultural entry submission' : 'Place submission'}</legend>
      {fixedCountry
        ? <div className="contribution-locked-value"><span>Country</span><strong>{fixedCountry.name}</strong></div>
        : <label>Country<select required value={values.countrySlug} onChange={(event) => updateField('countrySlug', event.target.value)}>
        <option value="">Choose a country</option>
        {countries.map((country) => <option value={country.slug} key={country.slug}>{country.name}</option>)}
      </select></label>}
      <label>{isEntry ? 'Entry title' : 'Place name'}<input required maxLength={180} value={isEntry ? values.title : values.name} onChange={(event) => updateField(isEntry ? 'title' : 'name', event.target.value)} /></label>
      {fixedCategory
        ? <div className="contribution-locked-value"><span>{isEntry ? 'Cultural category' : 'Place type'}</span><strong>{categories.find(([value]) => value === fixedCategory)?.[1] || 'Selected section'}</strong></div>
        : <label>{isEntry ? 'Cultural category' : 'Place type'}<select required value={values.category} onChange={(event) => updateField('category', event.target.value)}>
        <option value="" disabled>Choose a category</option>
        {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>}
      {isEntry && <label>Short summary <span className="form-optional">(optional)</span><textarea rows="3" maxLength={600} value={values.summary} onChange={(event) => updateField('summary', event.target.value)} /></label>}
      {!isEntry && <label>Location <span className="form-optional">(optional)</span><input maxLength={200} value={values.location} onChange={(event) => updateField('location', event.target.value)} placeholder="City or region" /></label>}
      <label>{isEntry ? 'Region' : 'Cultural region'} <span className="form-optional">(optional)</span><input maxLength={160} value={values.region} onChange={(event) => updateField('region', event.target.value)} /></label>
      <label className="form-span">{isEntry ? 'Description' : 'Place description'}<textarea required rows="7" maxLength={isEntry ? 20000 : 5000} value={isEntry ? values.content : values.description} onChange={(event) => updateField(isEntry ? 'content' : 'description', event.target.value)} /></label>
      <label className="form-span">Photograph <span className="required-marker" aria-hidden="true">*</span> <span className="form-optional">(JPEG, PNG, or WebP · up to 5 MB)</span>
        <span className="form-help">An image is required for every submission. Share only an image you own or have permission to use.</span>
        <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" required={!imageFile} aria-invalid={Boolean(imageError)} aria-describedby="contribution-image-help" aria-errormessage={imageError ? 'contribution-image-error' : undefined} onInvalid={() => setImageError('An image is required for every submission.')} onChange={(event) => {
          const selected = event.target.files?.[0] || null
          setImageError('')
          if (selected && !['image/jpeg', 'image/png', 'image/webp'].includes(selected.type)) { setImageError('Choose a JPEG, PNG, or WebP image.'); event.target.value = ''; setImageFile(null); setImagePreview(''); return }
          if (selected && selected.size === 0) { setImageError('The selected image is empty. Choose a different image.'); event.target.value = ''; setImageFile(null); setImagePreview(''); return }
          if (selected && selected.size > 5 * 1024 * 1024) { setImageError('Choose an image that is 5 MB or smaller.'); event.target.value = ''; setImageFile(null); setImagePreview(''); return }
          setImagePreview(selected ? URL.createObjectURL(selected) : '')
          setImageFile(selected)
        }} />
        <span id="contribution-image-help" className="sr-only">Required image, JPEG PNG or WebP, maximum 5 megabytes.</span>
      </label>
      {imageError && <p id="contribution-image-error" className="form-image-error form-span" role="alert">{imageError}</p>}
      {imageFile && <>
        <label className="form-span">Image caption <span className="form-optional">(optional)</span><input maxLength={240} value={values.imageCaption || ''} onChange={(event) => updateField('imageCaption', event.target.value)} /></label>
        <label className="form-span image-rights-confirm"><input type="checkbox" checked={Boolean(values.imageRightsConfirmed)} onChange={(event) => updateField('imageRightsConfirmed', event.target.checked)} /> I own this image or have permission to share it.</label>
        {imagePreview && <img className="contribution-image-preview form-span" src={imagePreview} alt="Preview of selected contribution image" />}
        <p className="form-help form-span">To replace this image, choose another file above.</p>
        <button className="form-text-button form-span" type="button" onClick={() => { setImagePreview(''); setImageFile(null); if (imageInputRef.current) imageInputRef.current.value = ''; setValues((current) => ({ ...current, imageCaption: '', imageRightsConfirmed: false })) }}>Remove selected image</button>
      </>}
    </fieldset>
    <SourceFields sources={values.sources} onChange={updateSource} onAdd={addSource} onRemove={removeSource} disabled={submitting} />
    <p className="submission-review-note">Submissions should be accurate, culturally respectful, and supported by reliable sources. Every contribution is reviewed; submission does not mean it will be published.</p>
    <button className="contribution-submit" type="submit" disabled={submitting}>
      {submitting ? 'Submitting…' : 'Submit for review'}<span aria-hidden="true">→</span>
    </button>
  </form>
}

export default function ContributionPage({ countries, loadState, errorMessage, onRetry, auth }) {
  const params = new URLSearchParams(window.location.search)
  const requestedKind = params.get('kind') === 'place' ? 'place' : 'entry'
  const [kind, setKind] = useState(requestedKind)
  const requestedSlug = params.get('country') || ''
  const requestedCategory = params.get('category') || ''
  const fixedCountry = countries.find((country) => country.slug === requestedSlug) || null
  const fixedCategory = requestedKind === 'place'
    ? (requestedCategory === 'cultural_destination' ? requestedCategory : '')
    : ENTRY_CATEGORIES.some(([category]) => category === requestedCategory) ? requestedCategory : ''
  const fixedSelection = Boolean(fixedCountry && fixedCategory && kind === requestedKind)
  const returnTo = `${window.location.pathname}${window.location.search}`

  return <main className="contribution-page">
    <header className="contribution-intro">
      <p className="eyebrow">Community contributions</p>
      <h1>Help document a culture.</h1>
      <p>Share a well-sourced cultural entry or place for editorial review. Submissions are not published automatically.</p>
    </header>
    <section className="contribution-workspace" aria-label="Submit a cultural contribution">
      {!fixedSelection && <div className="contribution-kind" role="group" aria-label="Contribution type">
        <button type="button" aria-pressed={kind === 'entry'} onClick={() => setKind('entry')}>Cultural entry</button>
        <button type="button" aria-pressed={kind === 'place'} onClick={() => setKind('place')}>Place</button>
      </div>}
      {loadState === 'loading' && <p className="contribution-feedback" role="status">Loading country list…</p>}
      {loadState === 'error' && <div className="contribution-feedback" role="alert"><p>{errorMessage || 'The country list could not be loaded.'}</p><button className="form-text-button" type="button" onClick={onRetry}>Try again</button></div>}
      {loadState === 'empty' && <p className="contribution-feedback" role="status">No countries are available for submissions right now.</p>}
      {auth?.status === 'loading' && <p className="contribution-feedback" role="status">Checking your account…</p>}
      {auth?.status === 'error' && <div className="contribution-feedback" role="alert"><p>Your account could not be checked.</p><button className="form-text-button" type="button" onClick={auth.retry}>Try again</button></div>}
      {loadState === 'ready' && auth?.status === 'ready' && !auth.user && <div className="contribution-feedback" role="status"><p>Sign in to submit a contribution for review. Your selected country and section will be ready when you return.</p><a className="contribution-sign-in" href={buildAuthPath('login', returnTo)}>Sign in to contribute</a></div>}
      {loadState === 'ready' && auth?.status === 'ready' && auth.user && <SubmissionForm key={`${kind}-${fixedCountry?.slug || ''}-${fixedCategory}`} kind={kind} countries={countries} csrfToken={auth.csrfToken} fixedCountry={fixedSelection ? fixedCountry : null} fixedCategory={fixedSelection ? fixedCategory : ''} />}
    </section>
  </main>
}
