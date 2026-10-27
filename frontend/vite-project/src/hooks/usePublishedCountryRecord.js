import { useEffect, useState } from 'react'
import { fetchCountry, fetchCulturalEntries, fetchPlaces } from '../services/api.js'

const fetchRecords = {
  culturalEntry: fetchCulturalEntries,
  place: fetchPlaces,
}

export default function usePublishedCountryRecord({ slug, recordId, type }) {
  const [result, setResult] = useState({ status: 'loading', country: null, record: null, message: '' })
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const fetchItems = fetchRecords[type]
    if (!fetchItems) return () => controller.abort()
    Promise.all([
      fetchCountry(slug, { signal: controller.signal }),
      fetchItems(slug, { signal: controller.signal }),
    ]).then(([country, records]) => {
      if (!country) {
        setResult({ status: 'not-found', country: null, record: null, message: 'We could not find this country.' })
        return
      }
      if (!Array.isArray(records)) throw new Error('The published content response was invalid.')
      const record = records.find((item) => item.reviewStatus === 'published' && String(item._id) === recordId)
      if (!record) {
        setResult({ status: 'not-found', country, record: null, message: 'This published item could not be found.' })
        return
      }
      setResult({ status: 'ready', country, record, message: '' })
    }).catch((error) => {
      if (controller.signal.aborted) return
      const notFound = error.response?.status === 404
      setResult({
        status: notFound ? 'not-found' : 'error',
        country: null,
        record: null,
        message: notFound
          ? 'We could not find this country or published item.'
          : 'The cultural information could not be loaded. Please try again.',
      })
    })

    return () => controller.abort()
  }, [slug, recordId, type, retry])

  function onRetry() {
    setResult({ status: 'loading', country: null, record: null, message: '' })
    setRetry((value) => value + 1)
  }

  if (!fetchRecords[type]) {
    return { status: 'not-found', country: null, record: null, message: 'This page is unavailable.', onRetry }
  }

  return { ...result, onRetry }
}
