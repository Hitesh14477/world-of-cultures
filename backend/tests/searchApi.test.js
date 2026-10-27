import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/app.js'

const countryOne = {
  _id: 'country-atlas', name: 'Atlas Country', officialName: 'Atlas Example Nation', slug: 'atlas-country',
  cca2: 'AT', cca3: 'ATL', capital: ['Atlas City'], flagEmoji: '🏳️', flagImageUrl: '',
  continent: 'Asia', region: 'East Asia', subregion: 'Eastern Asia', languages: [{ name: 'Atlasian' }],
}
const countryTwo = {
  _id: 'country-other', name: 'Other Country', officialName: 'Other Example Nation', slug: 'other-country',
  cca2: 'OT', cca3: 'OTH', capital: ['Other City'], continent: 'Europe', region: 'Southern Europe', subregion: 'Western Europe',
}

const countryRows = [countryOne, countryTwo]
const entryRows = [
  { _id: 'entry-published', country: countryOne._id, title: 'Atlas cultural entry', category: 'history', summary: 'An atlas reference.', content: 'A fixture used only by search tests.', reviewStatus: 'published', sourceKey: 'test:private-key', rejectionReason: 'private review note' },
  { _id: 'entry-pending', country: countryOne._id, title: 'Atlas pending entry', category: 'history', content: 'Not public.', reviewStatus: 'pending_review' },
  { _id: 'entry-rejected', country: countryOne._id, title: 'Atlas rejected entry', category: 'history', content: 'Not public.', reviewStatus: 'rejected', rejectionReason: 'private reason' },
  { _id: 'entry-other-country', country: countryTwo._id, title: 'Other cultural entry', category: 'traditional_food', content: 'Another fixture.', reviewStatus: 'published' },
]
const placeRows = [
  { _id: 'place-published', country: countryOne._id, name: 'Atlas place', category: 'heritage_site', description: 'An atlas place fixture.', reviewStatus: 'published', rejectionReason: 'private review note' },
  { _id: 'place-pending', country: countryOne._id, name: 'Atlas pending place', category: 'landmark', description: 'Not public.', reviewStatus: 'pending_review' },
  { _id: 'place-rejected', country: countryOne._id, name: 'Atlas rejected place', category: 'landmark', description: 'Not public.', reviewStatus: 'rejected', rejectionReason: 'private reason' },
]

function pathValues(record, path) {
  return path.split('.').reduce((values, key) => values.flatMap((value) => Array.isArray(value)
    ? value.map((item) => item?.[key])
    : [value?.[key]]), [record]).flat(Infinity)
}

function matches(record, filter) {
  return Object.entries(filter || {}).every(([key, expected]) => {
    if (key === '$and') return expected.every((clause) => matches(record, clause))
    if (key === '$or') return expected.some((clause) => matches(record, clause))
    const actualValues = pathValues(record, key)
    if (expected instanceof RegExp) return actualValues.some((actual) => typeof actual === 'string' && expected.test(actual))
    if (expected && typeof expected === 'object' && '$in' in expected) {
      return expected.$in.some((candidate) => actualValues.some((actual) => String(actual) === String(candidate)))
    }
    return actualValues.some((actual) => String(actual) === String(expected))
  })
}

function fakeModel(rows, { failCount = false, populatedCountries = countryRows } = {}) {
  return {
    find(filter) {
      let selected = rows.filter((record) => matches(record, filter))
      let skipCount = 0
      let resultLimit = Number.POSITIVE_INFINITY
      let shouldPopulate = false
      return {
        select() { return this },
        populate() { shouldPopulate = true; return this },
        sort(order) {
          const [field, direction] = Object.entries(order)[0]
          selected = [...selected].sort((a, b) => String(a[field]).localeCompare(String(b[field])) * direction)
          return this
        },
        skip(count) { skipCount = count; return this },
        limit(count) { resultLimit = count; return this },
        async lean() {
          return structuredClone(selected.slice(skipCount, skipCount + resultLimit).map((record) => {
            if (!shouldPopulate || typeof record.country !== 'string') return record
            return { ...record, country: populatedCountries.find((country) => country._id === record.country) || null }
          }))
        },
      }
    },
    countDocuments(filter) {
      if (failCount) return Promise.reject(new Error('private database detail'))
      return Promise.resolve(rows.filter((record) => matches(record, filter)).length)
    },
  }
}

async function withSearchServer(run, options = {}) {
  const CountryModel = fakeModel(countryRows, options)
  const CulturalEntryModel = fakeModel(entryRows, options)
  const PlaceModel = fakeModel(placeRows, options)
  const app = createApp({ CountryModel, CulturalEntryModel, PlaceModel })
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  try {
    const { port } = server.address()
    await run(`http://127.0.0.1:${port}`)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

test('global search returns country, published entry, and place results with stable combined pagination', async () => {
  await withSearchServer(async (baseUrl) => {
    const first = await fetch(`${baseUrl}/api/search?q=atlas&limit=2`)
    const firstBody = await first.json()
    assert.equal(first.status, 200)
    assert.deepEqual(firstBody.data.map(({ type }) => type), ['country', 'cultural-entry'])
    assert.equal(firstBody.pagination.total, 3)
    assert.equal(firstBody.pagination.totalPages, 2)
    assert.equal(firstBody.data[0].country.slug, 'atlas-country')
    assert.equal(firstBody.data[0].country.flagEmoji, '🏳️')
    assert.match(firstBody.data[0].description, /Atlas City/)
    assert.equal('reviewStatus' in firstBody.data[1], false)
    assert.equal('rejectionReason' in firstBody.data[1], false)
    assert.equal('sourceKey' in firstBody.data[1], false)

    const second = await fetch(`${baseUrl}/api/search?q=atlas&limit=2&page=2`)
    const secondBody = await second.json()
    assert.deepEqual(secondBody.data.map(({ type }) => type), ['place'])
    assert.equal(secondBody.pagination.page, 2)
  })
})

test('type, country, continent, region, and cultural category filters are applied server-side', async () => {
  await withSearchServer(async (baseUrl) => {
    const entryResponse = await fetch(`${baseUrl}/api/search?q=atlas&country=atlas-country&continent=Asia&region=East&type=cultural-entry&category=history`)
    const entryBody = await entryResponse.json()
    assert.equal(entryResponse.status, 200)
    assert.deepEqual(entryBody.data.map(({ id }) => id), ['entry-published'])

    const placesResponse = await fetch(`${baseUrl}/api/search?continent=Asia&region=Eastern&type=place`)
    const placesBody = await placesResponse.json()
    assert.deepEqual(placesBody.data.map(({ id }) => id), ['place-published'])

    const countriesResponse = await fetch(`${baseUrl}/api/search?country=atlas-country&type=country`)
    assert.deepEqual((await countriesResponse.json()).data.map(({ id }) => id), ['atlas-country'])
  })
})

test('country search covers official names, capitals, languages, and geography fields', async () => {
  await withSearchServer(async (baseUrl) => {
    for (const q of ['Atlas Example Nation', 'Atlas City', 'Atlasian', 'Eastern Asia']) {
      const response = await fetch(`${baseUrl}/api/search?q=${encodeURIComponent(q)}&type=country`)
      const body = await response.json()
      assert.equal(response.status, 200, q)
      assert.deepEqual(body.data.map(({ id }) => id), ['atlas-country'], q)
    }
  })
})

test('pending and rejected entries and places never appear, including without a text query', async () => {
  await withSearchServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/search?q=atlas`)
    const body = await response.json()
    const visibleIds = body.data.map(({ id }) => id)
    assert.deepEqual(visibleIds, ['atlas-country', 'entry-published', 'place-published'])
    assert.equal(visibleIds.includes('entry-pending'), false)
    assert.equal(visibleIds.includes('entry-rejected'), false)
    assert.equal(visibleIds.includes('place-pending'), false)
    assert.equal(visibleIds.includes('place-rejected'), false)

    const filteredBrowse = await fetch(`${baseUrl}/api/search?type=cultural-entry&continent=Asia`)
    const filteredBody = await filteredBrowse.json()
    assert.deepEqual(filteredBody.data.map(({ id }) => id), ['entry-published'])
  })
})

test('empty queries, special characters, and malformed query parameters are handled safely', async () => {
  await withSearchServer(async (baseUrl) => {
    const empty = await fetch(`${baseUrl}/api/search`)
    assert.deepEqual((await empty.json()).data, [])

    const special = await fetch(`${baseUrl}/api/search?q=%5B%2A%5D`)
    assert.equal(special.status, 200)
    assert.deepEqual((await special.json()).data, [])

    for (const query of [
      'limit=51', 'page=0', 'page=1001', 'type=admin', 'continent=Atlantis',
      'category=not-real', 'type=country&category=history', 'country=bad%2Fslug',
      'q=one&q=two', 'unknown=value',
    ]) {
      const response = await fetch(`${baseUrl}/api/search?${query}`)
      assert.equal(response.status, 400, query)
      assert.doesNotMatch(await response.text(), /stack|node_modules/i)
    }
  })
})

test('database failures return a generic error without leaking internal details', async () => {
  await withSearchServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/search?q=atlas`)
    assert.equal(response.status, 500)
    const body = await response.text()
    assert.match(body, /unexpected server error/i)
    assert.doesNotMatch(body, /private database detail|stack/i)
  }, { failCount: true })
})
