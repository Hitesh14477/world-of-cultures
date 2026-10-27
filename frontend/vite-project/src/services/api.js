import axios from 'axios'

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5001/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

export async function fetchCountries({ signal } = {}) {
  const firstResponse = await apiClient.get('/countries', {
    params: { page: 1, limit: 100, sort: 'name' },
    signal,
  })
  const firstItems = firstResponse.data?.data
  const totalPages = firstResponse.data?.pagination?.totalPages ?? 1
  if (!Array.isArray(firstItems) || !Number.isInteger(totalPages) || totalPages < 0) {
    throw new Error('The country directory returned an unexpected response.')
  }

  const remainingPages = await Promise.all(Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) =>
    apiClient.get('/countries', {
      params: { page: index + 2, limit: 100, sort: 'name' },
      signal,
    }),
  ))
  const pages = [firstItems, ...remainingPages.map((response) => response.data?.data)]
  if (pages.some((items) => !Array.isArray(items))) {
    throw new Error('The country directory returned an unexpected response.')
  }
  return pages.flat()
}

export async function fetchCountry(slug, { signal } = {}) {
  const response = await apiClient.get(`/countries/${encodeURIComponent(slug)}`, { signal })
  return response.data?.data
}

export async function fetchCulturalEntries(slug, { signal } = {}) {
  const response = await apiClient.get(`/countries/${encodeURIComponent(slug)}/cultural-entries`, { signal })
  return response.data?.data
}

export async function fetchPlaces(slug, { signal } = {}) {
  const response = await apiClient.get(`/countries/${encodeURIComponent(slug)}/places`, { signal })
  return response.data?.data
}

export async function fetchGlobalSearch(params, { signal } = {}) {
  const response = await apiClient.get('/search', { params, signal })
  const data = response.data?.data
  const pagination = response.data?.pagination
  if (!Array.isArray(data) || !pagination || !Number.isInteger(pagination.totalPages)) {
    throw new Error('Search returned an unexpected response.')
  }
  return { results: data, pagination }
}

export async function submitCulturalEntry(slug, payload, csrfToken) {
  const isMultipart = typeof FormData !== 'undefined' && payload instanceof FormData
  const response = await apiClient.post(`/countries/${encodeURIComponent(slug)}/cultural-entries`, payload, { headers: { 'X-CSRF-Token': csrfToken, ...(isMultipart ? { 'Content-Type': 'multipart/form-data' } : {}) } })
  return response.data
}

export async function submitPlace(slug, payload, csrfToken) {
  const isMultipart = typeof FormData !== 'undefined' && payload instanceof FormData
  const response = await apiClient.post(`/countries/${encodeURIComponent(slug)}/places`, payload, { headers: { 'X-CSRF-Token': csrfToken, ...(isMultipart ? { 'Content-Type': 'multipart/form-data' } : {}) } })
  return response.data
}

export async function adminLogin(credentials) {
  const response = await apiClient.post('/admin/login', credentials)
  return response.data?.data
}

export async function fetchAdminSession({ signal } = {}) {
  const response = await apiClient.get('/admin/session', { signal })
  return response.data?.data
}

export async function fetchPendingSubmissions({ signal } = {}) {
  const response = await apiClient.get('/admin/pending', { signal })
  return response.data?.data
}

export async function fetchPendingSubmission(type, id, { signal } = {}) {
  const response = await apiClient.get(`/admin/submissions/${encodeURIComponent(type)}/${encodeURIComponent(id)}`, { signal })
  return response.data?.data
}

export async function approveSubmission(type, id, csrfToken) {
  const response = await apiClient.post(`/admin/submissions/${encodeURIComponent(type)}/${encodeURIComponent(id)}/approve`, {}, {
    headers: { 'X-CSRF-Token': csrfToken },
  })
  return response.data
}

export async function rejectSubmission(type, id, csrfToken, reason = '') {
  const response = await apiClient.post(`/admin/submissions/${encodeURIComponent(type)}/${encodeURIComponent(id)}/reject`, { reason }, {
    headers: { 'X-CSRF-Token': csrfToken },
  })
  return response.data
}

export async function adminLogout(csrfToken) {
  const response = await apiClient.post('/admin/logout', {}, { headers: { 'X-CSRF-Token': csrfToken } })
  return response.data
}

export async function registerUser(credentials) {
  const response = await apiClient.post('/users/register', credentials)
  return response.data?.data
}

export async function loginUser(credentials) {
  const response = await apiClient.post('/users/login', credentials)
  return response.data?.data
}

export async function fetchUserSession({ signal } = {}) {
  const response = await apiClient.get('/users/session', { signal })
  return response.data?.data
}

export async function logoutUser(csrfToken) {
  const response = await apiClient.post('/users/logout', {}, { headers: { 'X-CSRF-Token': csrfToken } })
  return response.data
}

export async function fetchMyFavourites({ signal } = {}) {
  const response = await apiClient.get('/users/me/favourites', { signal })
  return response.data?.data
}

export async function fetchMyProfile({ signal } = {}) {
  const response = await apiClient.get('/users/me/profile', { signal })
  return response.data?.data
}

export async function updateMyProfile(payload, csrfToken) {
  const response = await apiClient.patch('/users/me/profile', payload, { headers: { 'X-CSRF-Token': csrfToken } })
  return response.data?.data
}

export async function fetchMyContributions({ page = 1, limit = 12, signal } = {}) {
  const response = await apiClient.get('/users/me/contributions', { params: { page, limit }, signal })
  return response.data
}

export async function fetchMyCommunityPosts({ page = 1, limit = 12, signal } = {}) {
  const response = await apiClient.get('/users/me/community-posts', { params: { page, limit }, signal })
  return response.data
}

export async function fetchCommunityPost(postId, { signal } = {}) {
  const response = await apiClient.get(`/community/${encodeURIComponent(postId)}`, { signal })
  return response.data?.data
}

export async function fetchCommunityPosts({ country = '', page = 1, limit = 12, signal } = {}) {
  const response = await apiClient.get('/community', {
    params: { ...(country ? { country } : {}), page, limit },
    signal,
  })
  if (!Array.isArray(response.data?.data) || !response.data?.pagination) {
    throw new Error('The community feed returned an unexpected response.')
  }
  return { posts: response.data.data, pagination: response.data.pagination }
}

export async function createCommunityPost(formData, csrfToken, onUploadProgress) {
  const response = await apiClient.post('/community', formData, {
    headers: { 'X-CSRF-Token': csrfToken, 'Content-Type': 'multipart/form-data' },
    onUploadProgress,
  })
  return response.data?.data
}

export async function updateCommunityPost(postId, formData, csrfToken, onUploadProgress) {
  const response = await apiClient.patch(`/community/${encodeURIComponent(postId)}`, formData, {
    headers: { 'X-CSRF-Token': csrfToken, 'Content-Type': 'multipart/form-data' },
    onUploadProgress,
  })
  return response.data
}

export async function deleteCommunityPost(postId, csrfToken) {
  const response = await apiClient.delete(`/community/${encodeURIComponent(postId)}`, {
    headers: { 'X-CSRF-Token': csrfToken },
  })
  return response.data
}

export async function fetchFavouriteStatus(type, id, { signal } = {}) {
  const response = await apiClient.get(`/users/me/favourites/${encodeURIComponent(type)}/${encodeURIComponent(id)}`, { signal })
  return response.data?.data
}

export async function addFavourite(type, id, csrfToken) {
  const response = await apiClient.post('/users/me/favourites', { type, id }, { headers: { 'X-CSRF-Token': csrfToken } })
  return response.data
}

export async function removeFavourite(type, id, csrfToken) {
  const response = await apiClient.delete(`/users/me/favourites/${encodeURIComponent(type)}/${encodeURIComponent(id)}`, {
    headers: { 'X-CSRF-Token': csrfToken },
  })
  return response.data
}

export default apiClient
