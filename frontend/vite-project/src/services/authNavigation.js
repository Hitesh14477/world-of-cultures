export const DEFAULT_AUTH_RETURN_TO = '/my-collection'

const INTERNAL_ORIGIN = 'https://world-of-cultures.invalid'
const AUTH_ROUTES = new Set(['/login', '/register', '/admin/login'])

function hasControlCharacters(value) {
  return [...value].some((character) => character.codePointAt(0) <= 31 || character.codePointAt(0) === 127)
}

export function safeInternalPath(candidate, fallback = DEFAULT_AUTH_RETURN_TO) {
  if (typeof candidate !== 'string' || candidate.length === 0 || candidate.length > 2048) return fallback
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\') || hasControlCharacters(candidate)) return fallback

  try {
    const target = new URL(candidate, INTERNAL_ORIGIN)
    if (target.origin !== INTERNAL_ORIGIN || target.username || target.password || target.pathname.startsWith('//')) return fallback
    let normalizedPath
    try { normalizedPath = decodeURIComponent(target.pathname).replace(/\/+$/, '') || '/' } catch { return fallback }
    if (AUTH_ROUTES.has(normalizedPath.toLowerCase())) return fallback
    return `${target.pathname}${target.search}${target.hash}`
  } catch {
    return fallback
  }
}

export function getAuthReturnTo(search = '') {
  const params = new URLSearchParams(search)
  return safeInternalPath(params.get('returnTo'))
}

export function buildAuthPath(mode, returnTo) {
  const route = mode === 'register' ? '/register' : '/login'
  if (returnTo === undefined || returnTo === null || returnTo === '') return route
  const params = new URLSearchParams({ returnTo: safeInternalPath(returnTo) })
  return `${route}?${params.toString()}`
}

export function getCurrentInternalPath(location = globalThis.location) {
  if (!location) return '/'
  return safeInternalPath(`${location.pathname || '/'}${location.search || ''}${location.hash || ''}`, '/')
}

export function getAuthPrompt(returnTo) {
  const path = safeInternalPath(returnTo)
  if (path === '/community' || path.startsWith('/community?compose=1')) return 'Sign in to create a Community post. You will return to your post form afterward.'
  if (path.startsWith('/community?edit=')) return 'Sign in to continue editing your Community post.'
  if (path === '/contribute' || path.startsWith('/contribute?')) return 'Sign in to contribute cultural information. Your selected country and section will be ready when you return.'
  if (path === '/my-collection') return 'Sign in to save and manage your personal collection.'
  return 'Sign in to continue where you left off.'
}
