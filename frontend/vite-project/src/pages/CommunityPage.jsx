import { useEffect, useMemo, useState } from 'react'
import { createCommunityPost, deleteCommunityPost, fetchCommunityPost, fetchCommunityPosts, updateCommunityPost } from '../services/api.js'
import { buildAuthPath } from '../services/authNavigation.js'

const PAGE_SIZE = 12
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function explainError(error, fallback) {
  return error.response?.data?.message || error.message || fallback
}

function PostForm({ countries, post, csrfToken, onCancel, onSaved }) {
  const [caption, setCaption] = useState(post?.caption || '')
  const [countryText, setCountryText] = useState(post?.country?.name || '')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')

  const selectedCountry = countries.find((country) => country.name.toLowerCase() === countryText.trim().toLowerCase())

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  function chooseFile(event) {
    const nextFile = event.target.files?.[0] || null
    setError('')
    if (!nextFile) {
      if (preview) URL.revokeObjectURL(preview)
      setPreview('')
      setFile(null)
      return
    }
    if (!ACCEPTED_TYPES.has(nextFile.type)) {
      setError('Choose a JPEG, PNG, or WebP image.')
      event.target.value = ''
      return
    }
    if (nextFile.size > MAX_IMAGE_BYTES) {
      setError('Images must be 5 MB or smaller.')
      event.target.value = ''
      return
    }
    if (preview) URL.revokeObjectURL(preview)
    setPreview(URL.createObjectURL(nextFile))
    setFile(nextFile)
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    const cleanCaption = caption.trim()
    if (!cleanCaption) return setError('Write a short caption before submitting.')
    if (cleanCaption.length > 1000) return setError('Caption must be 1,000 characters or fewer.')
    if (!selectedCountry) return setError('Choose a country from the available country list.')
    if (!post && !file) return setError('Choose a photo to share.')

    const payload = new FormData()
    payload.append('caption', cleanCaption)
    payload.append('countrySlug', selectedCountry.slug)
    if (file) payload.append('image', file)
    setBusy(true)
    setProgress(0)
    try {
      const onUploadProgress = (event) => {
        if (event.total) setProgress(Math.round((event.loaded / event.total) * 100))
      }
      const saved = post
        ? await updateCommunityPost(post.id, payload, csrfToken, onUploadProgress)
        : await createCommunityPost(payload, csrfToken, onUploadProgress)
      onSaved(post ? saved.data : saved, Boolean(post && saved.cleanupPending))
    } catch (requestError) {
      setError(explainError(requestError, 'Your post could not be saved. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  const filteredCountries = countries.filter((country) => !countryText.trim()
    || country.name.toLowerCase().includes(countryText.trim().toLowerCase())).slice(0, 8)

  return <form className="community-post-form" onSubmit={submit}>
    <div className="community-form-heading">
      <div><p className="eyebrow">{post ? 'Your contribution' : 'Share an experience'}</p><h2>{post ? 'Edit post' : 'Create a post'}</h2></div>
      <button type="button" className="community-text-button" onClick={onCancel} disabled={busy}>Cancel</button>
    </div>
    <label className="community-field">
      <span>Country</span>
      <input
        type="search"
        value={countryText}
        onChange={(event) => setCountryText(event.target.value)}
        list="community-country-options"
        placeholder="Search countries"
        autoComplete="off"
        required
      />
      <datalist id="community-country-options">
        {filteredCountries.map((country) => <option key={country.slug} value={country.name} />)}
      </datalist>
      {countryText && !selectedCountry && <small>Choose an exact country name from the suggestions.</small>}
    </label>
    <label className="community-field">
      <span>Caption <small>{caption.trim().length}/1,000</small></span>
      <textarea value={caption} onChange={(event) => setCaption(event.target.value)} rows="3" maxLength="1000" required placeholder="What would you like to share about this moment?" />
    </label>
    <div className="community-field">
      <span>Photograph {post ? '(optional replacement)' : ''}</span>
      <label className="community-file-control">
        <span>{file ? 'Choose a different photo' : post ? 'Replace photo' : 'Choose a photo'}</span>
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseFile} aria-label="Choose JPEG, PNG, or WebP photo" />
      </label>
      <small>JPEG, PNG, or WebP · up to 5 MB</small>
      {!post && <small>Share only photographs you own or have permission to use.</small>}
      {(preview || post?.image?.url) && <div className="community-preview-wrap">
        <img src={preview || post.image.url} alt="Preview of the selected community photo" className="community-preview" />
        {file && <button className="community-text-button" type="button" onClick={() => { if (preview) URL.revokeObjectURL(preview); setPreview(''); setFile(null) }} disabled={busy}>Remove selected photo</button>}
      </div>}
    </div>
    {error && <p className="community-form-error" role="alert">{error}</p>}
    {busy && <div className="community-progress" role="status"><span>{progress > 0 ? `Uploading · ${progress}%` : 'Saving your post…'}</span><progress max="100" value={progress} /></div>}
    <div className="community-form-actions">
      <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Saving…' : post ? 'Save changes' : 'Share post'}</button>
      <p>Your post is a personal contribution and is not treated as verified cultural information.</p>
    </div>
  </form>
}

export function CommunityPostCard({ post, owner, onEdit, onDelete }) {
  const date = new Date(post.createdAt)
  const dateLabel = Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
  return <article className="community-post" id={`community-post-${post.id}`}>
    <div className="community-post-meta">
      <span className="community-author">{post.author?.username || 'Community member'}</span>
      <time dateTime={post.createdAt}>{dateLabel}</time>
      <a href={`/countries/${encodeURIComponent(post.country?.slug || '')}`} className="community-country-label">
        {post.country?.flagEmoji && <span aria-hidden="true">{post.country.flagEmoji}</span>} {post.country?.name || 'Country'}
      </a>
    </div>
    <img className="community-post-image" src={post.image.url} alt={`Photograph shared from ${post.country?.name || 'a community member'}`} loading="lazy" />
    <div className="community-post-copy">
      <p>{post.caption}</p>
      {owner && <div className="community-owner-actions">
        <button type="button" className="community-text-button" onClick={() => onEdit(post)}>Edit</button>
        <button type="button" className="community-text-button community-danger-button" onClick={() => onDelete(post)}>Delete</button>
      </div>}
    </div>
  </article>
}

export function CommunityPostDetailPage({ postId, auth }) {
  const [post, setPost] = useState(null)
  const [state, setState] = useState({ type: 'loading', id: '' })
  const [retry, setRetry] = useState(0)
  const [actionMessage, setActionMessage] = useState('')
  const [removing, setRemoving] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    fetchCommunityPost(postId, { signal: controller.signal }).then((item) => {
      if (!controller.signal.aborted) { setPost(item); setState({ type: 'ready', id: postId }) }
    }).catch(() => { if (!controller.signal.aborted) setState({ type: 'error', id: postId }) })
    return () => controller.abort()
  }, [postId, retry])
  const currentState = state.id === postId ? state.type : 'loading'
  async function removePost() {
    if (!window.confirm('Delete this post? This cannot be undone.')) return
    setRemoving(true)
    setActionMessage('')
    try {
      await deleteCommunityPost(postId, auth.csrfToken)
      setPost(null)
      setState({ type: 'deleted', id: postId })
    } catch (error) {
      setActionMessage(error.response?.data?.message || 'The post could not be deleted. Please try again.')
    } finally { setRemoving(false) }
  }
  return <main className="community-page community-single-post">
    {currentState === 'loading' && <p role="status">Loading post…</p>}
    {currentState === 'error' && <div className="community-state" role="alert"><p>This post could not be loaded. It may have been removed.</p><button className="community-text-button" type="button" onClick={() => { setState({ type: 'loading', id: '' }); setRetry((value) => value + 1) }}>Try again</button></div>}
    {currentState === 'deleted' && <div className="community-state" role="status"><p>Your post was removed.</p><a className="detail-back-link" href="/community">Return to Community</a></div>}
    {currentState === 'ready' && post && <><a className="detail-back-link" href="/community">← Community</a><CommunityPostCard post={post} owner={false} />{actionMessage && <p className="community-form-error" role="alert">{actionMessage}</p>}{auth?.user?.id === post.author?.id && <div className="community-owner-actions"><a className="community-text-button" href={`/community?edit=${encodeURIComponent(post.id)}`}>Edit post</a><button className="community-text-button community-danger-button" type="button" onClick={removePost} disabled={removing}>{removing ? 'Deleting…' : 'Delete post'}</button></div>}</>}
  </main>
}

export default function CommunityPage({ auth, countries = [], loadState = 'loading', errorMessage = '', onRetry = () => {} }) {
  const [posts, setPosts] = useState([])
  const [pagination, setPagination] = useState({ page: 1, totalPages: 0, total: 0 })
  const [feedState, setFeedState] = useState('loading')
  const [feedError, setFeedError] = useState('')
  const [countryFilter, setCountryFilter] = useState('')
  const [page, setPage] = useState(1)
  const [formPost, setFormPost] = useState(() => new URLSearchParams(window.location.search).get('compose') === '1' ? null : undefined)
  const [notice, setNotice] = useState('')
  const [retry, setRetry] = useState(0)
  const [deletingId, setDeletingId] = useState('')

  useEffect(() => {
    if (auth?.status !== 'ready' || !auth.user) return
    const params = new URLSearchParams(window.location.search)
    const editId = params.get('edit')
    if (params.get('compose') !== '1' && !editId) return
    let active = true
    params.delete('compose')
    params.delete('edit')
    const query = params.toString()
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`)
    if (editId) fetchCommunityPost(editId).then((post) => {
      if (!active) return
      if (post.author?.id !== auth.user.id) { setNotice('Only the author can edit this post.'); return }
      setFormPost(post)
    }).catch(() => { if (active) setNotice('This post is no longer available to edit.') })
    return () => { active = false }
  }, [auth?.status, auth?.user])

  useEffect(() => {
    const controller = new AbortController()
    fetchCommunityPosts({ country: countryFilter, page, limit: PAGE_SIZE, signal: controller.signal })
      .then(({ posts: loadedPosts, pagination: nextPagination }) => {
        if (controller.signal.aborted) return
        setPosts((current) => page === 1 ? loadedPosts : [...current, ...loadedPosts])
        setPagination(nextPagination)
        setFeedState(loadedPosts.length ? 'ready' : page === 1 ? 'empty' : 'ready')
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setFeedError(explainError(error, 'The community feed could not be loaded.'))
        setFeedState('error')
      })
    return () => controller.abort()
  }, [countryFilter, page, retry])

  const ownPostIds = useMemo(() => new Set(posts.filter((post) => post.author?.id === auth?.user?.id).map((post) => post.id)), [posts, auth?.user?.id])

  function changeCountry(event) {
    setCountryFilter(event.target.value)
    setPage(1)
    setPosts([])
    setFeedState('loading')
    setFeedError('')
  }

  function loadMore() {
    setFeedState('loading')
    setPage((value) => value + 1)
  }

  function savePost(saved, cleanupPending = false) {
    setFormPost(undefined)
    setNotice(cleanupPending ? 'Your changes were saved. Removal of the previous image is pending.' : formPost ? 'Your changes were saved.' : 'Your post has been shared.')
    setPosts((current) => formPost ? current.map((post) => post.id === saved.id ? saved : post) : [saved, ...current])
    if (!formPost) setPagination((current) => ({ ...current, total: current.total + 1 }))
  }

  async function removePost(post) {
    if (!window.confirm('Delete this post? This cannot be undone.')) return
    setDeletingId(post.id)
    setNotice('')
    try {
      const response = await deleteCommunityPost(post.id, auth.csrfToken)
      setPosts((current) => current.filter((item) => item.id !== post.id))
      setPagination((current) => ({ ...current, total: Math.max(0, current.total - 1) }))
      setNotice(response.message || 'Your post was removed.')
    } catch (error) {
      setNotice(explainError(error, 'The post could not be removed. Please try again.'))
    } finally { setDeletingId('') }
  }

  return <main className="community-page">
    <header className="community-page-heading">
      <div><p className="eyebrow">Shared experiences, place by place</p><h1>Community</h1><p>Share photographs and stories from the places and cultural moments that matter to you.</p></div>
      {auth?.status === 'ready' && auth.user
        ? <button type="button" className="primary-button" onClick={() => { setFormPost(null); setNotice('') }}>Create Post</button>
        : auth?.status === 'ready' && !auth.user
          ? <a className="primary-button" href={buildAuthPath('login', '/community?compose=1')}>Sign in to create a post</a>
          : auth?.status === 'error'
            ? <span className="community-auth-error" role="status">Account status unavailable. <button className="community-text-button" type="button" onClick={auth.retry}>Retry</button></span>
            : <span className="community-auth-wait" role="status">Checking account…</span>}
    </header>

    {formPost !== undefined && auth?.status === 'ready' && auth.user && loadState === 'ready' && <PostForm
      countries={countries}
      post={formPost || undefined}
      csrfToken={auth.csrfToken}
      onCancel={() => setFormPost(undefined)}
      onSaved={savePost}
    />}

    <section className="community-feed-section" aria-label="Community posts">
      <div className="community-feed-toolbar">
        <div><h2>Latest stories</h2><span>{pagination.total} {pagination.total === 1 ? 'post' : 'posts'}</span></div>
        <label className="community-filter">Filter by country
          <select value={countryFilter} onChange={changeCountry} disabled={loadState !== 'ready'}>
            <option value="">All countries</option>
            {countries.map((country) => <option value={country.slug} key={country.slug}>{country.name}</option>)}
          </select>
        </label>
      </div>

      {loadState === 'loading' && <p className="community-state" role="status">Loading countries…</p>}
      {loadState === 'error' && <div className="community-state" role="alert"><p>{errorMessage}</p><button className="community-text-button" type="button" onClick={onRetry}>Retry countries</button></div>}
      {feedState === 'loading' && <p className="community-state" role="status">Loading community posts…</p>}
      {feedState === 'error' && <div className="community-state" role="alert"><p>{feedError}</p><button className="community-text-button" type="button" onClick={() => setRetry((value) => value + 1)}>Retry feed</button></div>}
      {feedState === 'empty' && loadState === 'ready' && <div className="community-state community-empty"><h3>No community posts yet</h3><p>When people share photographs and stories, they will appear here. Be the first to contribute.</p></div>}
      {notice && <p className="community-notice" role="status">{notice}{deletingId && ' Removing…'}</p>}
      {posts.length > 0 && <div className="community-feed-grid">
        {posts.map((post) => <CommunityPostCard key={post.id} post={post} owner={ownPostIds.has(post.id) && !deletingId} onEdit={setFormPost} onDelete={removePost} />)}
      </div>}
      {feedState === 'ready' && pagination.page < pagination.totalPages && <button className="community-load-more" type="button" onClick={loadMore}>Load more stories</button>}
    </section>
  </main>
}
