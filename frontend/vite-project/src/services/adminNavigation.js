const INTERNAL_ORIGIN = 'https://world-of-cultures.invalid'

export function safeAdminReturnTo(value, fallback = '/admin') {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback
  for (const character of value) if (character.charCodeAt(0) < 32) return fallback
  try {
    const url = new URL(value, INTERNAL_ORIGIN)
    if (url.origin !== INTERNAL_ORIGIN || !(url.pathname === '/admin' || url.pathname.startsWith('/admin/')) || url.pathname === '/admin/login') return fallback
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return fallback
  }
}

export function buildAdminLoginPath(returnTo = '/admin') {
  const safeDestination = safeAdminReturnTo(returnTo)
  return `/admin/login?returnTo=${encodeURIComponent(safeDestination)}`
}
