import { useEffect, useMemo, useRef, useState } from 'react'
import { addFavourite, createCommunityComment, createCommunityPost, deleteCommunityComment, deleteCommunityPost, fetchCommunityComments, fetchCommunityLikeStatus, fetchCommunityPost, fetchCommunityPosts, fetchFavouriteStatus, fetchMyProfile, fetchPublicMemberProfile, moderateCommunityPost, removeFavourite, setCommunityPostLiked, updateCommunityPost } from '../services/api.js'
import { buildAuthPath } from '../services/authNavigation.js'
import CountryFlag from '../components/CountryFlag.jsx'

function relativeTime(value) {
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return ''
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000))
  const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]]
  const [unit, size] = units.find(([, unitSize]) => seconds >= unitSize) || ['second', 1]
  return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(-Math.floor(seconds / size), unit)
}

const PAGE_SIZE = 12
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function explainError(error, fallback) {
  return error.response?.data?.message || error.message || fallback
}

function PostForm({ countries, post, csrfToken, onCancel, onSaved, onBusyChange }) {
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
    onBusyChange(true)
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
      onBusyChange(false)
    }
  }

  const filteredCountries = countries.filter((country) => !countryText.trim()
    || country.name.toLowerCase().includes(countryText.trim().toLowerCase())).slice(0, 8)

  return <form className="community-post-form" onSubmit={submit}>
    <div className="community-form-heading">
      <div><p className="eyebrow">{post ? 'Your contribution' : 'Share an experience'}</p><h2 id="community-post-form-title">{post ? 'Edit post' : 'Create a post'}</h2></div>
      <button type="button" className="community-text-button" onClick={onCancel} disabled={busy}>Cancel</button>
    </div>
    <p className="community-form-intro">{post ? 'Update the country, story, or photo for your post.' : 'To create a post: choose a country, write a caption, then add a photo.'}</p>
    <label className="community-field">
      <span><strong>1. Choose a country</strong></span>
      <input
        type="search"
        value={countryText}
        onChange={(event) => setCountryText(event.target.value)}
        list="community-country-options"
        placeholder="Type a country name"
        autoComplete="off"
        required
      />
      <datalist id="community-country-options">
        {filteredCountries.map((country) => <option key={country.slug} value={country.name} />)}
      </datalist>
      <small className="community-field-help">Select the country connected to your photo or experience.</small>
      {countryText && !selectedCountry && <small className="community-field-help">Choose an exact country name from the suggestions.</small>}
    </label>
    <label className="community-field">
      <span><strong>2. Write your story</strong><small>{caption.trim().length}/1,000 characters</small></span>
      <textarea value={caption} onChange={(event) => setCaption(event.target.value)} rows="5" maxLength="1000" required placeholder="What happened? What would you like others to know about this place or experience?" />
      <small className="community-field-help">A few sentences in your own words help others understand the moment.</small>
    </label>
    <div className="community-field">
      <span><strong>3. Add a photo{post ? ' (optional replacement)' : ' (required)'}</strong></span>
      <label className="community-file-control">
        <span>{file ? 'Choose a different photo' : post ? 'Select a replacement photo' : 'Select a photo to upload'}</span>
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseFile} aria-label="Choose JPEG, PNG, or WebP photo" />
      </label>
      <small className="community-field-help">JPEG, PNG, or WebP · up to 5 MB. {post ? 'You can keep the current photo.' : 'A photo is needed to share your post.'}</small>
      {!post && <small className="community-field-help">Only upload photographs you own or have permission to use.</small>}
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

export function CommunityPostCard({ post, owner, onEdit, onDelete, auth, adminAuth, removing = false }) {
  const dateLabel = relativeTime(post.createdAt)
  const [likes, setLikes] = useState(Number(post.likesCount) || 0)
  const [liked, setLiked] = useState(false)
  const [likeLoading, setLikeLoading] = useState(false)
  const [savedStatus, setSavedStatus] = useState(null)
  const [saveBusy, setSaveBusy] = useState(false)
  const [comments, setComments] = useState([])
  const [commentCount, setCommentCount] = useState(Number(post.commentsCount) || 0)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [commentBusy, setCommentBusy] = useState(false)
  const [interactionError, setInteractionError] = useState('')
  const [imageOpen, setImageOpen] = useState(false)
  const [showAllComments, setShowAllComments] = useState(false)
  const [shareMessage, setShareMessage] = useState('')
  const loggedIn = auth?.status === 'ready' && Boolean(auth.user)
  const signedOut = auth?.status === 'ready' && !auth.user
  const isAdmin = adminAuth?.status === 'ready' && Boolean(adminAuth.session)
  const returnTo = `/community/posts/${encodeURIComponent(post.id)}`
  const loginHref = buildAuthPath('login', returnTo)
  const saved = loggedIn && savedStatus?.userId === auth.user.id && Boolean(savedStatus.isSaved)
  const checkingSaved = loggedIn && savedStatus?.userId !== auth.user.id

  useEffect(() => {
    if (!loggedIn) return undefined
    const controller = new AbortController()
    fetchCommunityLikeStatus(post.id, { signal: controller.signal }).then((status) => {
      if (!controller.signal.aborted) { setLiked(Boolean(status?.liked)); setLikes(Number(status?.likesCount) || 0) }
    }).catch(() => {})
    return () => controller.abort()
  }, [post.id, loggedIn, auth?.user?.id])

  useEffect(() => {
    if (!loggedIn) return undefined
    const controller = new AbortController()
    fetchFavouriteStatus('community-post', post.id, { signal: controller.signal }).then((status) => {
      if (!controller.signal.aborted) setSavedStatus({ userId: auth.user.id, isSaved: Boolean(status?.isSaved) })
    }).catch(() => {
      if (!controller.signal.aborted) setInteractionError('Saved status could not be checked. Try again.')
    })
    return () => controller.abort()
  }, [post.id, loggedIn, auth?.user?.id])

  useEffect(() => {
    if (!imageOpen) return undefined
    function closeOnEscape(event) { if (event.key === 'Escape') setImageOpen(false) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [imageOpen])

  async function toggleLike() {
    if (!loggedIn) return
    setLikeLoading(true)
    setInteractionError('')
    try {
      const next = !liked
      await setCommunityPostLiked(post.id, next, auth.csrfToken)
      setLiked(next)
      setLikes((count) => Math.max(0, count + (next ? 1 : -1)))
    } catch (error) { setInteractionError(explainError(error, 'Your like could not be saved. Please try again.')) }
    finally { setLikeLoading(false) }
  }

  async function toggleSaved() {
    if (!loggedIn || saveBusy || checkingSaved) return
    setSaveBusy(true)
    setInteractionError('')
    try {
      if (saved) await removeFavourite('community-post', post.id, auth.csrfToken)
      else await addFavourite('community-post', post.id, auth.csrfToken)
      setSavedStatus({ userId: auth.user.id, isSaved: !saved })
    } catch (error) { setInteractionError(explainError(error, 'This post could not be saved. Please try again.')) }
    finally { setSaveBusy(false) }
  }

  async function toggleComments() {
    const opening = !commentsOpen
    setCommentsOpen(opening)
    if (!opening || comments.length) return
    setCommentsLoading(true)
    setInteractionError('')
    try { setComments(await fetchCommunityComments(post.id)) }
    catch (error) { setInteractionError(explainError(error, 'Comments could not be loaded. Please try again.')) }
    finally { setCommentsLoading(false) }
  }

  async function submitComment(event) {
    event.preventDefault()
    const content = commentText.trim()
    if (!content) return setInteractionError('Write a comment before submitting.')
    if (content.length > 1000) return setInteractionError('Comments must be 1,000 characters or fewer.')
    setCommentBusy(true)
    setInteractionError('')
    try {
      const saved = await createCommunityComment(post.id, content, auth.csrfToken)
      setComments((current) => [...current, saved])
      setCommentCount((count) => count + 1)
      setCommentText('')
    } catch (error) { setInteractionError(explainError(error, 'Your comment could not be posted. Please try again.')) }
    finally { setCommentBusy(false) }
  }

  async function removeComment(comment) {
    setInteractionError('')
    try {
      const commentOwner = auth?.user?.id === comment.author?.id
      const canManageAsUser = commentOwner || owner
      const csrfToken = canManageAsUser ? auth?.csrfToken : adminAuth?.session?.csrfToken
      await deleteCommunityComment(post.id, comment.id, csrfToken, { admin: !canManageAsUser })
      setComments((current) => current.filter((item) => item.id !== comment.id))
      setCommentCount((count) => Math.max(0, count - 1))
    } catch (error) { setInteractionError(explainError(error, 'The comment could not be removed. Please try again.')) }
  }

  async function sharePost() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/community/posts/${encodeURIComponent(post.id)}`)
      setShareMessage('Link copied.')
      window.setTimeout(() => setShareMessage(''), 2200)
    } catch { setInteractionError('Could not copy the link. Open the post to copy its address from your browser.') }
  }

  return <article className="community-post" id={`community-post-${post.id}`}>
    <div className="community-post-meta">
      <div className="community-author-block">
        {post.author?.username
          ? <a className="community-avatar-link" href={`/members/${encodeURIComponent(post.author.username)}`} aria-label={`Open ${post.author.displayName || post.author.username}’s profile`}>
            {post.author.avatarUrl ? <img className="community-author-avatar" src={post.author.avatarUrl} alt="" /> : <span className="community-author-avatar community-author-initial" aria-hidden="true">{(post.author.username || 'C').slice(0, 1).toUpperCase()}</span>}
          </a>
          : post.author?.avatarUrl ? <img className="community-author-avatar" src={post.author.avatarUrl} alt="" /> : <span className="community-author-avatar community-author-initial" aria-hidden="true">C</span>}
        {post.author?.username
          ? <a className="community-author-link" href={`/members/${encodeURIComponent(post.author.username)}`}>
            <span className="community-author">{post.author.displayName || post.author.username}</span><small>@{post.author.username}</small>
          </a>
          : <span className="community-author">Community member</span>}
      </div>
      <time dateTime={post.createdAt} title={post.createdAt ? new Date(post.createdAt).toLocaleString() : undefined}>{dateLabel}</time>
      <a href={`/countries/${encodeURIComponent(post.country?.slug || '')}`} className="community-country-label">
        {post.country?.flagEmoji && <span className="community-country-flag" aria-hidden="true">{post.country.flagEmoji}</span>} {post.country?.name || 'Country'}
      </a>
      {(owner || isAdmin) && <details className="community-action-menu"><summary aria-label="Post actions">•••</summary><div>
        {owner && <button type="button" className="community-text-button" onClick={() => onEdit(post)}>Edit post</button>}
        <button type="button" className="community-text-button community-danger-button" onClick={() => onDelete(post, !owner)} disabled={removing}>{removing ? 'Removing…' : owner ? 'Delete post' : 'Remove post'}</button>
      </div></details>}
    </div>
    <button type="button" className="community-image-button" onClick={() => setImageOpen(true)} aria-label={`View photograph from ${post.country?.name || 'Community'}`}>
      <img className="community-post-image" src={post.image.url} alt={`Photograph shared from ${post.country?.name || 'a community member'}`} loading="lazy" />
    </button>
    <div className="community-post-copy">
      <p><strong className="community-caption-author">{post.author?.username || 'Community member'}</strong> {post.caption}</p>
      {!commentsOpen && <button className="community-comments-preview-link" type="button" onClick={toggleComments}>{commentCount > 0 ? `View all ${commentCount} ${commentCount === 1 ? 'comment' : 'comments'}` : 'Be the first to comment'}</button>}
      <div className="community-interactions">
        {loggedIn
          ? <button type="button" className={`community-text-button ${liked ? 'community-liked' : ''}`} onClick={toggleLike} disabled={likeLoading} aria-pressed={liked}>{likeLoading ? 'Saving…' : liked ? '♥ Liked' : '♡ Like'} <span>{likes}</span></button>
          : signedOut ? <a className="community-text-button" href={loginHref} aria-label="Sign in to like this post">♡ Like <span>{likes}</span></a>
            : <span className="community-auth-wait" role="status">♡ Like <span>{likes}</span></span>}
        <button type="button" className="community-text-button" onClick={toggleComments} aria-expanded={commentsOpen}>{commentsOpen ? 'Hide comments' : 'Comment'} <span>{commentCount}</span></button>
        {loggedIn
          ? <button type="button" className={`community-text-button community-save-action ${saved ? 'community-saved' : ''}`} onClick={toggleSaved} disabled={saveBusy || checkingSaved} aria-pressed={saved}>{saveBusy ? 'Saving…' : checkingSaved ? 'Checking…' : saved ? '▣ Saved' : '▢ Save'}</button>
          : signedOut ? <a className="community-text-button community-save-action" href={loginHref}>▢ Save</a>
            : <span className="community-auth-wait community-save-action" role="status">▢ Save</span>}
        <button type="button" className="community-text-button community-share-action" onClick={sharePost}>Share</button>
      </div>
      {shareMessage && <p className="community-share-message" role="status">{shareMessage}</p>}
      {interactionError && <p className="community-form-error" role="alert">{interactionError}</p>}
      {commentsOpen && <section className="community-comments" aria-label="Comments">
        {commentsLoading && <p role="status">Loading comments…</p>}
        {!commentsLoading && comments.length === 0 && <p className="community-comment-empty">No comments yet.</p>}
        {comments.slice(0, showAllComments ? comments.length : 2).map((comment) => <article className="community-comment" key={comment.id}>
          <div className="community-comment-person">{comment.author?.avatarUrl ? <img src={comment.author.avatarUrl} alt="" /> : <span aria-hidden="true">{(comment.author?.username || 'C').slice(0, 1).toUpperCase()}</span>}<p>{comment.author?.username ? <a href={`/members/${encodeURIComponent(comment.author.username)}`}><strong>{comment.author.displayName || comment.author.username}</strong></a> : <strong>Community member</strong>} {comment.content}</p></div>
          {(auth?.user?.id === comment.author?.id || owner || isAdmin) && <button type="button" className="community-text-button community-danger-button" onClick={() => removeComment(comment)}>Remove</button>}
        </article>)}
        {!commentsLoading && comments.length > 2 && <button type="button" className="community-text-button" onClick={() => setShowAllComments((value) => !value)}>{showAllComments ? 'Show fewer comments' : `View all ${comments.length} comments`}</button>}
        {loggedIn
          ? <form className="community-comment-form" onSubmit={submitComment}><label className="sr-only" htmlFor={`community-comment-${post.id}`}>Write a comment</label><textarea id={`community-comment-${post.id}`} value={commentText} maxLength="1000" rows="2" onChange={(event) => setCommentText(event.target.value)} placeholder="Write a comment…" /><button type="submit" className="community-text-button" disabled={commentBusy || !commentText.trim()}>{commentBusy ? 'Posting…' : 'Post'}</button></form>
          : signedOut ? <a className="community-signin-comment" href={loginHref}>Sign in to join the conversation</a>
            : <span className="community-auth-wait" role="status">Checking account…</span>}
      </section>}
    </div>
    {imageOpen && <div className="community-image-viewer" role="dialog" aria-modal="true" aria-label="Community photograph" onClick={() => setImageOpen(false)}>
      <button type="button" className="community-image-close" onClick={() => setImageOpen(false)} aria-label="Close photograph">×</button>
      <img src={post.image.url} alt={`Photograph shared from ${post.country?.name || 'a community member'}`} onClick={(event) => event.stopPropagation()} />
    </div>}
  </article>
}

export function CommunityPostDetailPage({ postId, auth, adminAuth }) {
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
  async function removePost(asAdmin = false) {
    if (!window.confirm('Delete this post? This cannot be undone.')) return
    setRemoving(true)
    setActionMessage('')
    try {
      if (asAdmin) await moderateCommunityPost(postId, adminAuth.session.csrfToken)
      else await deleteCommunityPost(postId, auth.csrfToken)
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
    {currentState === 'ready' && post && <><a className="detail-back-link" href="/community">← Community</a><CommunityPostCard post={post} auth={auth} adminAuth={adminAuth} owner={auth?.user?.id === post.author?.id} removing={removing} onEdit={() => { window.location.href = `/community?edit=${encodeURIComponent(post.id)}` }} onDelete={(_selectedPost, asAdmin) => removePost(asAdmin)} />{actionMessage && <p className="community-form-error" role="alert">{actionMessage}</p>}</>}
  </main>
}

export function MemberProfilePage({ username, auth, adminAuth }) {
  const [member, setMember] = useState(null)
  const [state, setState] = useState('loading')
  const [retry, setRetry] = useState(0)
  const [deleteError, setDeleteError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    fetchPublicMemberProfile(username, { signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return
      setMember(result)
      setState('ready')
    }).catch(() => { if (!controller.signal.aborted) setState('error') })
    return () => controller.abort()
  }, [username, retry])
  return <main className="community-page member-profile-page">
    {state === 'loading' && <p role="status">Loading community profile…</p>}
    {state === 'error' && <section className="community-state" role="alert"><h1>Profile unavailable</h1><p>This community member could not be found.</p><button type="button" className="community-text-button" onClick={() => { setState('loading'); setRetry((value) => value + 1) }}>Try again</button></section>}
    {state === 'ready' && member && <>
      <header className="member-profile-header">
        {member.user.avatarUrl ? <img src={member.user.avatarUrl} alt="" /> : <span aria-hidden="true">{(member.user.displayName || member.user.username || 'W').slice(0, 1).toUpperCase()}</span>}
        <div><p className="eyebrow">Community member</p><h1>{member.user.displayName || member.user.username}</h1><p className="member-profile-username">@{member.user.username}</p>{member.user.bio && <p className="member-profile-bio">{member.user.bio}</p>}</div>
        <div className="member-profile-total"><strong>{member.totalPosts}</strong><span>{member.totalPosts === 1 ? 'post' : 'posts'}</span></div>
      </header>
      <section className="member-profile-posts"><h2>Published posts</h2>{deleteError && <p className="community-form-error" role="alert">{deleteError}</p>}{member.posts.length === 0 ? <p className="community-empty">This member has not shared a post yet.</p> : <div className="community-feed-grid">{member.posts.map((post) => <CommunityPostCard key={post.id} post={post} auth={auth} adminAuth={adminAuth} owner={auth?.user?.id === post.author?.id} onEdit={() => { window.location.assign(`/community?edit=${encodeURIComponent(post.id)}`) }} onDelete={async (selectedPost, asAdmin) => {
        if (!window.confirm('Remove this post?')) return
        setDeleteError('')
        try {
          if (asAdmin) await moderateCommunityPost(selectedPost.id, adminAuth.session.csrfToken)
          else await deleteCommunityPost(selectedPost.id, auth.csrfToken)
          setMember((current) => ({ ...current, posts: current.posts.filter((item) => item.id !== selectedPost.id), totalPosts: Math.max(0, current.totalPosts - 1) }))
        } catch (error) { setDeleteError(explainError(error, 'The post could not be removed. Please try again.')) }
      }} />)}</div>}</section>
    </>}
  </main>
}

export default function CommunityPage({ auth, adminAuth, countries = [], loadState = 'loading', errorMessage = '', onRetry = () => {} }) {
  const [posts, setPosts] = useState([])
  const [pagination, setPagination] = useState({ page: 1, totalPages: 0, total: 0 })
  const [feedState, setFeedState] = useState('loading')
  const [feedError, setFeedError] = useState('')
  const [countryFilter, setCountryFilter] = useState('')
  const [page, setPage] = useState(1)
  const [formPost, setFormPost] = useState(() => new URLSearchParams(window.location.search).get('compose') === '1' ? null : undefined)
  const [postFormBusy, setPostFormBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [retry, setRetry] = useState(0)
  const [deletingId, setDeletingId] = useState('')
  const [myProfileSummary, setMyProfileSummary] = useState(null)
  const postModalRef = useRef(null)
  const postFormBusyRef = useRef(false)
  const postFormOpen = formPost !== undefined && auth?.status === 'ready' && Boolean(auth.user) && loadState === 'ready'
  const currentUserId = auth?.user?.id

  useEffect(() => {
    if (!postFormOpen) return undefined
    const previousFocus = document.activeElement
    const modal = postModalRef.current
    document.body.style.overflow = 'hidden'
    modal?.querySelector('input:not([type="file"]), textarea, button')?.focus()

    function handleModalKey(event) {
      if (event.key === 'Escape' && !postFormBusyRef.current) {
        setFormPost(undefined)
        return
      }
      if (event.key !== 'Tab' || !modal) return
      const focusable = [...modal.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]')]
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }

    window.addEventListener('keydown', handleModalKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleModalKey)
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
  }, [postFormOpen])

  function updatePostFormBusy(busy) {
    postFormBusyRef.current = busy
    setPostFormBusy(busy)
  }

  useEffect(() => {
    if (auth?.status !== 'ready' || !currentUserId) return undefined
    const controller = new AbortController()
    const timer = window.setTimeout(() => fetchMyProfile({ signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) setMyProfileSummary({ userId: currentUserId, ...result })
    }).catch(() => {}), 0)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [auth?.status, currentUserId])

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

  async function removePost(post, asAdmin = false) {
    if (!window.confirm('Delete this post? This cannot be undone.')) return
    setDeletingId(post.id)
    setNotice('')
    try {
      const response = asAdmin
        ? await moderateCommunityPost(post.id, adminAuth.session.csrfToken)
        : await deleteCommunityPost(post.id, auth.csrfToken)
      setPosts((current) => current.filter((item) => item.id !== post.id))
      setPagination((current) => ({ ...current, total: Math.max(0, current.total - 1) }))
      setNotice(response.message || 'Your post was removed.')
    } catch (error) {
      setNotice(explainError(error, 'The post could not be removed. Please try again.'))
    } finally { setDeletingId('') }
  }

  return <main className="community-page">
    <div className="community-layout">
      <aside className="community-sidebar community-sidebar-left" aria-label="Your Community shortcuts">
        {auth?.status === 'ready' && auth.user
          ? <section className="community-side-card community-profile-card">
            <div className="community-profile-cover" />
            <a className="community-profile-avatar" href="/profile" aria-label="Open your profile">{auth.user.avatarUrl ? <img src={auth.user.avatarUrl} alt="" /> : <span>{(auth.user.username || auth.user.email || 'W').slice(0, 1).toUpperCase()}</span>}</a>
            <div className="community-profile-copy"><h2>{myProfileSummary?.userId === auth.user.id ? myProfileSummary.user.displayName || auth.user.username : auth.user.displayName || auth.user.username}</h2><span>@{auth.user.username || auth.user.email}</span>{myProfileSummary?.userId === auth.user.id && <p>{myProfileSummary.counts.communityPosts} community {myProfileSummary.counts.communityPosts === 1 ? 'post' : 'posts'}</p>}<a href="/profile">View profile →</a></div>
            <nav aria-label="Account shortcuts"><a href="/countries">Explore countries</a><a href="/my-collection">My Collection</a><a href="/profile#My%20Community%20Posts">My posts</a></nav>
          </section>
          : <section className="community-side-card community-signin-card"><p className="eyebrow">Join the conversation</p><h2>Your perspective belongs here.</h2><p>Sign in to share a photo, leave a comment, or save moments from the community.</p><a className="primary-button" href={buildAuthPath('login', '/community?compose=1')}>Sign in to contribute</a><a href="/register">Create an account</a></section>}
      </aside>

      <section className="community-feed-section" aria-label="Community posts">
        {auth?.status === 'ready' && auth.user
          ? <div className="community-composer">
            {auth.user.avatarUrl ? <img src={auth.user.avatarUrl} alt="" /> : <span aria-hidden="true">{(auth.user.username || 'W').slice(0, 1).toUpperCase()}</span>}
            <button type="button" className="community-composer-prompt" onClick={() => { setFormPost(null); setNotice('') }}>Share something about a culture…</button>
            <button type="button" className="community-composer-photo" onClick={() => { setFormPost(null); setNotice('') }}><span aria-hidden="true">▧</span> Add photo</button>
            <button type="button" className="primary-button" onClick={() => { setFormPost(null); setNotice('') }}>Create Post</button>
          </div>
          : auth?.status === 'ready' && !auth.user
            ? <a className="community-composer community-composer-signed-out" href={buildAuthPath('login', '/community?compose=1')}><span className="community-composer-avatar" aria-hidden="true">W</span><span>Sign in to share a cultural moment</span><strong>Contribute →</strong></a>
            : auth?.status === 'error'
              ? <p className="community-auth-error" role="status">Account status unavailable. <button className="community-text-button" type="button" onClick={auth.retry}>Retry</button></p>
              : <p className="community-auth-wait" role="status">Checking account…</p>}

        {postFormOpen && <div className="community-post-modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !postFormBusy) setFormPost(undefined)
        }}>
          <section className="community-post-modal" role="dialog" aria-modal="true" aria-labelledby="community-post-form-title" ref={postModalRef}>
            <PostForm
              countries={countries}
              post={formPost || undefined}
              csrfToken={auth.csrfToken}
              onCancel={() => setFormPost(undefined)}
              onSaved={savePost}
              onBusyChange={updatePostFormBusy}
            />
          </section>
        </div>}

        {notice && <p className="community-notice" role="status">{notice}{deletingId && ' Removing…'}</p>}
      <div className="community-feed-toolbar">
        <div><h2>Latest posts</h2><span>{pagination.total} {pagination.total === 1 ? 'post' : 'posts'}</span></div>
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
      {feedState === 'empty' && loadState === 'ready' && <div className="community-state community-empty"><h3>No posts here yet.</h3><p>When people share photos and cultural experiences, they will appear here. Start a conversation with a moment of your own.</p>{auth?.user && <button className="primary-button" type="button" onClick={() => setFormPost(null)}>Share the first post</button>}</div>}
      {posts.length > 0 && <div className="community-feed-grid">
        {posts.map((post) => <CommunityPostCard key={post.id} post={post} auth={auth} adminAuth={adminAuth} owner={ownPostIds.has(post.id) && !deletingId} removing={deletingId === post.id} onEdit={setFormPost} onDelete={removePost} />)}
      </div>}
      {feedState === 'ready' && pagination.page < pagination.totalPages && <button className="community-load-more" type="button" onClick={loadMore}>Load more stories</button>}
      </section>

      <aside className="community-sidebar community-sidebar-right" aria-label="Explore Community">
        <section className="community-side-card"><header><h2>Explore countries</h2><a href="/countries">All countries</a></header>
          {loadState === 'loading' && <p className="community-side-muted">Loading country directory…</p>}
          {loadState === 'error' && <p className="community-side-muted">Country suggestions are unavailable.</p>}
          {loadState === 'ready' && countries.slice(0, 4).map((country) => <a className="community-country-row" href={`/countries/${encodeURIComponent(country.slug)}`} key={country.slug}><CountryFlag country={country} className="community-mini-flag" /><span>{country.name}<small>{[country.region, country.continent].filter(Boolean).join(' · ')}</small></span><span aria-hidden="true">→</span></a>)}
        </section>
        <section className="community-side-card"><header><h2>Recent posts</h2></header>
          {posts.slice(0, 3).map((post) => <a className="community-recent-row" href={`/community/posts/${encodeURIComponent(post.id)}`} key={post.id}><span>{post.author?.displayName || post.author?.username || 'Community member'}</span><small>{post.country?.name || 'Community'} · {relativeTime(post.createdAt)}</small><p>{post.caption}</p></a>)}
          {feedState === 'empty' && <p className="community-side-muted">New discussions will appear here.</p>}
          <a className="community-side-explore-link" href="/countries">Explore cultures <span aria-hidden="true">→</span></a>
        </section>
      </aside>
    </div>
  </main>
}
