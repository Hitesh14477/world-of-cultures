import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { fetchNotifications, fetchUnreadNotificationCount, markAllNotificationsRead, markNotificationRead } from '../services/api.js'
import { buildAuthPath } from '../services/authNavigation.js'

function relativeTime(value) {
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return ''
  const seconds = Math.round((timestamp - Date.now()) / 1000)
  const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]]
  const [unit, size] = units.find(([, unitSize]) => Math.abs(seconds) >= unitSize) || ['second', 1]
  return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(Math.round(seconds / size), unit)
}

export default function NotificationBell({ user, csrfToken }) {
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(0)
  const [items, setItems] = useState([])
  const [state, setState] = useState('idle')
  const [error, setError] = useState('')
  const [markingRead, setMarkingRead] = useState(false)
  const root = useRef(null)
  const userId = user?.id

  const refreshCount = useCallback(async (signal) => {
    if (!userId) return
    try { setCount(await fetchUnreadNotificationCount({ signal })) } catch (requestError) {
      if (signal?.aborted) return
      if (requestError.response?.status === 401) {
        setCount(0)
        setItems([])
        setError('Your session expired. Sign in again to view notifications.')
      } else setError('Notifications are temporarily unavailable.')
    }
  }, [userId])

  useEffect(() => {
    if (!userId) return undefined
    const controller = new AbortController()
    const initialLoad = window.setTimeout(() => refreshCount(controller.signal), 0)
    const timer = window.setInterval(() => refreshCount(controller.signal), 60000)
    const onChanged = () => refreshCount(controller.signal)
    window.addEventListener('woc:notifications-changed', onChanged)
    return () => { controller.abort(); window.clearTimeout(initialLoad); window.clearInterval(timer); window.removeEventListener('woc:notifications-changed', onChanged) }
  }, [userId, refreshCount])

  useEffect(() => {
    if (!open) return undefined
    const closeOutside = (event) => { if (!root.current?.contains(event.target)) setOpen(false) }
    const closeEscape = (event) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeEscape)
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeEscape) }
  }, [open])

  async function toggle() {
    if (!userId) return
    const next = !open
    setOpen(next)
    setError('')
    if (!next) return
    setState('loading')
    try {
      const result = await fetchNotifications({ page: 1, limit: 5, filter: 'all' })
      setItems(result.notifications)
      setCount(result.unreadCount)
      setState('ready')
    } catch (requestError) {
      setState('error')
      setError(requestError.response?.status === 401 ? 'Your session expired. Sign in again to view notifications.' : 'Could not load notifications. Try again shortly.')
    }
  }

  async function openNotification(item) {
    if (!item.isRead) {
      try {
        await markNotificationRead(item.id, csrfToken)
        setItems((current) => current.map((notification) => notification.id === item.id ? { ...notification, isRead: true } : notification))
        setCount((current) => Math.max(0, current - 1))
        window.dispatchEvent(new Event('woc:notifications-changed'))
      } catch {
        setError('This notification could not be marked as read. You can still open it from Notifications.')
        return
      }
    }
    window.location.assign(item.link)
  }

  async function markAllRead() {
    if (markingRead || count === 0) return
    setMarkingRead(true)
    setError('')
    try {
      await markAllNotificationsRead(csrfToken)
      setItems((current) => current.map((item) => ({ ...item, isRead: true })))
      setCount(0)
      window.dispatchEvent(new Event('woc:notifications-changed'))
    } catch {
      setError('Notifications could not be marked as read. Please try again.')
    } finally {
      setMarkingRead(false)
    }
  }

  const loginPath = buildAuthPath('login', '/notifications')
  return <div className="notification-bell-wrap" ref={root}>
    {userId
      ? <button type="button" className="notification-bell" aria-label={`Notifications${count ? `, ${count} unread` : ''}`} aria-expanded={open} aria-controls="notification-dropdown" onClick={toggle}>
        <Bell size={19} strokeWidth={1.7} aria-hidden="true" />
        {count > 0 && <span className="notification-badge" aria-label={`${count} unread notifications`}>{count > 99 ? '99+' : count}</span>}
      </button>
      : <a className="notification-bell" href={loginPath} aria-label="Sign in to view notifications"><Bell size={19} strokeWidth={1.7} aria-hidden="true" /></a>}
    {open && <section className="notification-dropdown" id="notification-dropdown" aria-label="Recent notifications">
      <header><h2>Notifications</h2>{count > 0 && <div className="notification-dropdown-actions"><span>{count} unread</span><button type="button" onClick={markAllRead} disabled={markingRead}>{markingRead ? 'Updating…' : 'Mark as read'}</button></div>}</header>
      {state === 'loading' && <p role="status">Loading notifications…</p>}
      {state === 'error' && <p role="alert">{error}</p>}
      {state === 'ready' && items.length === 0 && <p>You’re all caught up. New activity will appear here.</p>}
      {state === 'ready' && items.length > 0 && <ul>{items.map((item) => <li key={item.id} className={item.isRead ? 'is-read' : 'is-unread'}>
        {item.actor?.avatarUrl ? <img src={item.actor.avatarUrl} alt="" /> : <span className="notification-avatar" aria-hidden="true">{(item.actor?.username || 'W').slice(0, 1).toUpperCase()}</span>}
        <button type="button" onClick={() => openNotification(item)}><span>{item.message}</span><small>{relativeTime(item.createdAt)}</small></button>
      </li>)}</ul>}
      {error && state !== 'error' && <p role="alert">{error}</p>}
      <a className="notification-view-all" href={userId ? '/notifications' : loginPath}>View all notifications <span aria-hidden="true">→</span></a>
    </section>}
  </div>
}
