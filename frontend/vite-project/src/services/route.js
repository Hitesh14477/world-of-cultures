function decodeSegment(value) {
  try {
    const decoded = decodeURIComponent(value)
    return decoded.includes('/') || decoded.includes('\\') ? null : decoded
  } catch {
    return null
  }
}

export function resolveAppRoute(pathname = '/') {
  const normalizedPath = pathname.replace(/^\/+|\/+$/g, '')
  if (!normalizedPath) return { type: 'home' }
  if (normalizedPath === 'admin/login') return { type: 'adminLogin' }
  if (normalizedPath === 'admin/profile') return { type: 'adminProfile' }
  if (normalizedPath === 'admin') return { type: 'adminDashboard' }
  if (normalizedPath === 'search') return { type: 'search' }
  if (normalizedPath === 'register') return { type: 'register' }
  if (normalizedPath === 'login') return { type: 'login' }
  if (normalizedPath === 'my-collection') return { type: 'myCollection' }
  if (normalizedPath === 'notifications') return { type: 'notifications' }
  if (normalizedPath === 'profile') return { type: 'profile' }
  const memberProfileMatch = normalizedPath.match(/^members\/([^/]+)$/)
  if (memberProfileMatch) {
    const username = decodeSegment(memberProfileMatch[1])
    return username ? { type: 'memberProfile', username } : { type: 'notFound' }
  }
  if (normalizedPath === 'countries') return { type: 'directory' }
  if (normalizedPath === 'contribute') return { type: 'contribute' }
  if (normalizedPath === 'community') return { type: 'community' }
  const communityPostMatch = normalizedPath.match(/^community\/posts\/([^/]+)$/)
  if (communityPostMatch) {
    const postId = decodeSegment(communityPostMatch[1])
    return postId ? { type: 'communityPost', postId } : { type: 'notFound' }
  }

  const entryMatch = normalizedPath.match(/^countries\/([^/]+)\/cultural-entries\/([^/]+)$/)
  if (entryMatch) {
    const slug = decodeSegment(entryMatch[1])
    const entryId = decodeSegment(entryMatch[2])
    return slug && entryId ? { type: 'culturalEntry', slug, entryId } : { type: 'notFound' }
  }

  const placeMatch = normalizedPath.match(/^countries\/([^/]+)\/places\/([^/]+)$/)
  if (placeMatch) {
    const slug = decodeSegment(placeMatch[1])
    const placeId = decodeSegment(placeMatch[2])
    return slug && placeId ? { type: 'place', slug, placeId } : { type: 'notFound' }
  }

  const countryMatch = normalizedPath.match(/^countries\/([^/]+)$/)
  if (countryMatch) {
    const slug = decodeSegment(countryMatch[1])
    return slug ? { type: 'country', slug } : { type: 'notFound' }
  }

  return { type: 'home' }
}
