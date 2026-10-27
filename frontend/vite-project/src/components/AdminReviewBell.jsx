import { useEffect, useRef, useState } from 'react'
import { fetchAdminOverview } from '../services/api.js'

const NOTIFICATIONS_URL = '/admin/profile#Notifications'

export default function AdminReviewBell({ session }) {
  const [counts, setCounts] = useState(null)
  const [state, setState] = useState('loading')
  const [open, setOpen] = useState(false)
  const [retry, setRetry] = useState(0)
  const rootRef = useRef(null)
  const refreshRef = useRef(() => {})
  const total = counts ? counts.culturalEntries + counts.places : 0

  useEffect(() => {
    if (!session) return undefined
    let controller
    let active = true
    const refresh = () => {
      controller?.abort()
      const requestController = new AbortController()
      controller = requestController
      fetchAdminOverview({ signal: requestController.signal }).then((overview) => {
        if (!active || requestController.signal.aborted) return
        const statistics = overview?.statistics || {}
        setCounts({
          culturalEntries: Number(statistics.pendingCulturalEntries) || 0,
          places: Number(statistics.pendingPlaces) || 0,
        })
        setState('ready')
      }).catch(() => {
        if (!active || requestController.signal.aborted) return
        setState('error')
      })
    }
    refreshRef.current = refresh
    refresh()
    const timer = window.setInterval(refresh, 60_000)
    window.addEventListener('woc:admin-review-counts-changed', refresh)
    return () => {
      active = false
      controller?.abort()
      window.clearInterval(timer)
      window.removeEventListener('woc:admin-review-counts-changed', refresh)
    }
  }, [session, retry])

  useEffect(() => {
    if (!open) return undefined
    function closeOnOutsideClick(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    function closeOnEscape(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', closeOnOutsideClick)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('pointerdown', closeOnOutsideClick)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const label = total > 0
    ? `Review notifications, ${total} submissions awaiting review`
    : 'Review notifications'

  return <div className="notification-bell-wrap admin-notification-bell" ref={rootRef}>
    <button className="notification-bell" type="button" aria-label={label} aria-expanded={open} aria-controls="admin-review-notifications" onClick={() => {
      setOpen((current) => !current)
      refreshRef.current()
    }}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
      {total > 0 && <span className="notification-badge" aria-hidden="true">{total > 99 ? '99+' : total}</span>}
    </button>
    {open && <section className="notification-dropdown admin-notification-dropdown" id="admin-review-notifications" aria-label="Administrator review notifications" aria-live="polite">
      <header><h2>Review notifications</h2>{total > 0 && <span>{total} waiting</span>}</header>
      {state === 'loading' && <p role="status">Checking submissions awaiting review…</p>}
      {state === 'error' && <div className="admin-notification-error" role="alert"><p>Review notifications could not be loaded.</p><button type="button" onClick={() => { setState('loading'); setRetry((value) => value + 1) }}>Try again</button></div>}
      {state === 'ready' && total === 0 && <p>You’re all caught up. No submissions are waiting for review.</p>}
      {state === 'ready' && total > 0 && <ul>
        {counts.culturalEntries > 0 && <li><a href="/admin#cultural-contributions"><strong>{counts.culturalEntries}</strong><span>{counts.culturalEntries === 1 ? 'cultural contribution is' : 'cultural contributions are'} awaiting review</span><span aria-hidden="true">→</span></a></li>}
        {counts.places > 0 && <li><a href="/admin#places"><strong>{counts.places}</strong><span>{counts.places === 1 ? 'place submission is' : 'place submissions are'} awaiting review</span><span aria-hidden="true">→</span></a></li>}
      </ul>}
      <a className="notification-view-all" href={NOTIFICATIONS_URL}>View all notifications <span aria-hidden="true">→</span></a>
    </section>}
  </div>
}
