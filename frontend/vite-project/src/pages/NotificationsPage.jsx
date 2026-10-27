import { useCallback, useEffect, useState } from 'react'
import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from '../services/api.js'

function relativeTime(value) {
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return ''
  const seconds = Math.round((timestamp - Date.now()) / 1000)
  const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]]
  const [unit, size] = units.find(([, unitSize]) => Math.abs(seconds) >= unitSize) || ['second', 1]
  return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(Math.round(seconds / size), unit)
}

export default function NotificationsPage({ auth }) {
  const [filter, setFilter] = useState('all')
  const [items, setItems] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 })
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState(0)

  const load = useCallback(async (signal) => {
    try {
      const result = await fetchNotifications({ page: 1, limit: 20, filter, signal })
      if (signal?.aborted) return
      setItems(result.notifications)
      setUnreadCount(result.unreadCount)
      setPagination(result.pagination || { page: 1, totalPages: 1 })
      setState('ready')
      setError('')
    } catch (requestError) {
      if (signal?.aborted) return
      setState('error')
      setError(requestError.response?.data?.message || 'Notifications could not be loaded. Please try again.')
    }
  }, [filter])

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => load(controller.signal), 0)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [load, retry])

  async function openNotification(item) {
    if (!item.isRead) {
      try {
        await markNotificationRead(item.id, auth.csrfToken)
        setItems((current) => filter === 'unread' ? current.filter((row) => row.id !== item.id) : current.map((row) => row.id === item.id ? { ...row, isRead: true } : row))
        setUnreadCount((count) => Math.max(0, count - 1))
        window.dispatchEvent(new Event('woc:notifications-changed'))
      } catch {
        setError('This notification could not be marked as read. Please try again.')
        return
      }
    }
    window.location.assign(item.link)
  }

  async function markAllRead() {
    if (busy || unreadCount === 0) return
    setBusy(true)
    setError('')
    try {
      await markAllNotificationsRead(auth.csrfToken)
      setItems((current) => current.map((item) => ({ ...item, isRead: true })))
      setUnreadCount(0)
      window.dispatchEvent(new Event('woc:notifications-changed'))
    } catch {
      setError('Notifications could not be marked as read. Please try again.')
    } finally { setBusy(false) }
  }

  if (!auth.user) return <main className="notifications-page"><p role="status">Sign in to view your notifications.</p></main>

  return <main className="notifications-page">
    <header className="notifications-heading"><div><p className="eyebrow">Your account</p><h1>Notifications</h1><p>Updates about your Community posts and cultural contributions.</p></div><button type="button" onClick={markAllRead} disabled={busy || unreadCount === 0}>{busy ? 'Updating…' : 'Mark all as read'}</button></header>
    <div className="notifications-toolbar"><div role="tablist" aria-label="Filter notifications"><button type="button" role="tab" aria-selected={filter === 'all'} onClick={() => setFilter('all')}>All</button><button type="button" role="tab" aria-selected={filter === 'unread'} onClick={() => setFilter('unread')}>Unread {unreadCount > 0 && <span>{unreadCount}</span>}</button></div><span>{unreadCount} unread</span></div>
    {error && <div className="notifications-error" role="alert"><p>{error}</p>{state === 'error' && <button type="button" onClick={() => { setState('loading'); setRetry((value) => value + 1) }}>Try again</button>}</div>}
    {state === 'loading' && <p className="notifications-feedback" role="status">Loading your notifications…</p>}
    {state === 'ready' && items.length === 0 && <section className="notifications-empty"><span aria-hidden="true">✓</span><h2>{filter === 'unread' ? 'You’re all caught up.' : 'No notifications yet.'}</h2><p>{filter === 'unread' ? 'Unread updates will appear here.' : 'You’ll find updates about your posts and contributions here.'}</p></section>}
    {state === 'ready' && items.length > 0 && <ul className="notifications-list">{items.map((item) => <li key={item.id} className={item.isRead ? 'is-read' : 'is-unread'}>
      {item.actor?.avatarUrl ? <img className="notifications-avatar" src={item.actor.avatarUrl} alt="" /> : <span className="notifications-avatar notifications-avatar-fallback" aria-hidden="true">{(item.actor?.username || 'W').slice(0, 1).toUpperCase()}</span>}
      <button className="notifications-open" type="button" onClick={() => openNotification(item)}><span>{item.message}</span><small>{relativeTime(item.createdAt)}</small></button>
      {!item.isRead && <span className="notifications-unread-dot" aria-label="Unread" />}
    </li>)}</ul>}
    {state === 'ready' && pagination.page < pagination.totalPages && <button className="notifications-load-more" type="button" onClick={async () => {
      try {
        const nextPage = pagination.page + 1
        const result = await fetchNotifications({ page: nextPage, limit: 20, filter })
        setItems((current) => [...current, ...result.notifications])
        setPagination(result.pagination)
      } catch { setError('More notifications could not be loaded.') }
    }}>Load more</button>}
  </main>
}
