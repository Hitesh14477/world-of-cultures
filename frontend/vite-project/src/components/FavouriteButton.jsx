import { useEffect, useState } from 'react'
import { addFavourite, fetchFavouriteStatus, removeFavourite } from '../services/api.js'
import { buildAuthPath, getCurrentInternalPath } from '../services/authNavigation.js'

export default function FavouriteButton({ auth, type, targetId }) {
  const userId = auth?.user?.id || ''
  const stateKey = `${userId}:${type}:${targetId}`
  const [state, setState] = useState({ key: '', status: 'loading', message: '' })
  const [retry, setRetry] = useState(0)
  const [busy, setBusy] = useState(false)
  const currentStatus = state.key === stateKey ? state.status : 'loading'

  useEffect(() => {
    if (!userId || !targetId) return undefined
    const controller = new AbortController()
    fetchFavouriteStatus(type, targetId, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setState({ key: stateKey, status: data.isSaved ? 'saved' : 'available', message: '' })
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setState({ key: stateKey, status: 'error', message: error.response?.data?.message || 'Saved status could not be checked.' })
      })
    return () => controller.abort()
  }, [userId, type, targetId, stateKey, retry])

  async function toggle() {
    if (busy || !auth?.csrfToken) return
    setBusy(true)
    setState((current) => ({ ...current, message: '' }))
    try {
      if (currentStatus === 'saved') {
        await removeFavourite(type, targetId, auth.csrfToken)
        setState({ key: stateKey, status: 'available', message: 'Removed from your collection.' })
      } else {
        const response = await addFavourite(type, targetId, auth.csrfToken)
        setState({ key: stateKey, status: 'saved', message: response.data?.alreadySaved ? 'Already in your collection.' : 'Saved to your collection.' })
      }
    } catch (error) {
      setState((current) => ({ ...current, status: currentStatus, message: error.response?.data?.message || 'This item could not be saved. Please try again.' }))
    } finally {
      setBusy(false)
    }
  }

  if (auth?.status === 'loading') {
    return <div className="favourite-control"><span role="status">Checking account…</span></div>
  }
  if (auth?.status === 'error') {
    return <div className="favourite-control"><p role="alert">{auth.error}</p><button className="favourite-link-button" type="button" onClick={auth.retry}>Try again</button></div>
  }
  if (!auth?.user) {
    return <div className="favourite-control"><a className="favourite-signin" href={buildAuthPath('login', getCurrentInternalPath())}>Sign in to save to your collection</a></div>
  }
  if (currentStatus === 'error') {
    return <div className="favourite-control"><p role="alert">{state.message}</p><button className="favourite-link-button" type="button" onClick={() => setRetry((value) => value + 1)}>Try again</button></div>
  }

  return <div className="favourite-control">
    <button className="favourite-link-button" type="button" onClick={toggle} disabled={busy || currentStatus === 'loading'} aria-pressed={currentStatus === 'saved'}>
      {busy ? 'Saving…' : currentStatus === 'loading' ? 'Checking collection…' : currentStatus === 'saved' ? 'Remove from my collection' : 'Save to my collection'}
    </button>
    {state.key === stateKey && state.message && <p role="status">{state.message}</p>}
  </div>
}
