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

export default apiClient
