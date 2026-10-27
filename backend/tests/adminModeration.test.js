import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, scryptSync } from 'node:crypto'
import { createApp } from '../src/app.js'

const ORIGIN = 'http://localhost:5173'
const PASSWORD = 'correct horse battery staple'
const SALT = randomBytes(16)
const PASSWORD_HASH = `scrypt$${SALT.toString('base64url')}$${scryptSync(PASSWORD, SALT, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString('base64url')}`
const entryId = '65fabc1234567890abcdef12'
const placeId = '65fabc1234567890abcdef13'

function makeRecord(id, values) {
  return {
    _id: id,
    country: { _id: '65fabc1234567890abcdef99', name: 'India', slug: 'india', flagEmoji: '🇮🇳' },
    reviewStatus: 'pending_review',
    sources: [{ title: 'Reference', publisher: 'Institution', url: 'https://example.org/source' }],
    image: { url: 'https://images.example.org/submission.jpg', publicId: 'woc/submission', rightsConfirmed: true, rightsConfirmedAt: new Date() },
    ...values,
  }
}

function fakeModel(records) {
  const query = (getValue, beforeValue = null) => ({
    select() { return this },
    populate() { return this },
    sort() { return this },
    limit() { return this },
    async lean() {
      if (beforeValue) await beforeValue()
      return getValue() ? structuredClone(getValue()) : null
    },
  })

  return {
    records,
    find(filter) {
      return query(() => records.filter((record) => record.reviewStatus === filter.reviewStatus))
    },
    findOne(filter) {
      return query(() => records.find((record) => record._id === filter._id && record.reviewStatus === filter.reviewStatus))
    },
    findOneAndUpdate(filter, update) {
      let found
      return query(() => found, () => {
        found = records.find((record) => record._id === filter._id && record.reviewStatus === filter.reviewStatus)
        if (!found) return
        Object.assign(found, update.$set)
      })
    },
  }
}

function testEnv() {
  return {
    NODE_ENV: 'test',
    FRONTEND_ORIGIN: ORIGIN,
    ADMIN_USERNAME: 'editor',
    ADMIN_PASSWORD_HASH: PASSWORD_HASH,
    ADMIN_SESSION_SECRET: 'test-session-secret-with-more-than-32-characters',
  }
}

async function withServer({ entries, places, env = testEnv() }, run) {
  const server = createApp({
    CountryModel: {
      findOne() { return { select() { return this }, lean() { return Promise.resolve({ _id: '65fabc1234567890abcdef99' }) } } },
    },
    CulturalEntryModel: fakeModel(entries),
    PlaceModel: fakeModel(places),
    adminEnv: env,
  }).listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  const address = server.address()
  try {
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

async function login(baseUrl, credentials = { username: 'editor', password: PASSWORD }) {
  const response = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify(credentials),
  })
  return { response, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
}

function authenticatedOptions(cookie, csrfToken, method = 'GET', body) {
  const headers = { Cookie: cookie }
  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json'
    headers.Origin = ORIGIN
    headers['X-CSRF-Token'] = csrfToken
  }
  return { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }
}

test('every moderation endpoint rejects unauthenticated requests', async () => {
  await withServer({ entries: [], places: [] }, async (baseUrl) => {
    const requests = [
      ['GET', '/api/admin/session'],
      ['GET', '/api/admin/pending'],
      ['GET', `/api/admin/submissions/cultural-entries/${entryId}`],
      ['POST', `/api/admin/submissions/places/${placeId}/approve`],
      ['POST', `/api/admin/submissions/places/${placeId}/reject`],
      ['POST', '/api/admin/logout'],
    ]
    for (const [method, path] of requests) {
      const response = await fetch(`${baseUrl}${path}`, { method, headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: method === 'POST' ? '{}' : undefined })
      assert.equal(response.status, 401, `${method} ${path}`)
    }
  })
})

test('invalid administrator credentials are rejected without leaking authentication details', async () => {
  await withServer({ entries: [], places: [] }, async (baseUrl) => {
    const { response, body } = await login(baseUrl, { username: 'editor', password: 'wrong password' })
    assert.equal(response.status, 401)
    assert.equal(body.message, 'The username or password is incorrect.')
    assert.equal(JSON.stringify(body).includes(PASSWORD_HASH), false)
    assert.equal(response.headers.get('set-cookie'), null)
  })
})

test('login abuse protection limits repeated failures and authentication setup errors stay safe', async () => {
  await withServer({ entries: [], places: [] }, async (baseUrl) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { response } = await login(baseUrl, { username: 'editor', password: 'incorrect' })
      assert.equal(response.status, 401)
    }
    const limited = await login(baseUrl, { username: 'editor', password: 'incorrect' })
    assert.equal(limited.response.status, 429)
  })
  await withServer({ entries: [], places: [], env: { FRONTEND_ORIGIN: ORIGIN } }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ username: 'editor', password: 'unused' }),
    })
    assert.equal(response.status, 503)
    assert.doesNotMatch(await response.text(), /password|hash|secret/i)
  })
})

test('authorized administrator can list pending entries and places with sources', async () => {
  const entries = [makeRecord(entryId, { title: 'Pending history', category: 'history', content: 'Research notes.' })]
  const places = [makeRecord(placeId, { name: 'Pending place', category: 'heritage_site', description: 'A place.' })]
  await withServer({ entries, places }, async (baseUrl) => {
    const auth = await login(baseUrl)
    assert.equal(auth.response.status, 200)
    assert.match(auth.cookie, /^woc_admin_session=/)
    assert.ok(auth.body.data.csrfToken)
    const response = await fetch(`${baseUrl}/api/admin/pending`, authenticatedOptions(auth.cookie, auth.body.data.csrfToken))
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.data.culturalEntries[0].record.title, 'Pending history')
    assert.equal(body.data.places[0].record.name, 'Pending place')
    assert.equal(body.data.culturalEntries[0].record.sources[0].url, 'https://example.org/source')
  })
})

test('administrator can inspect and approve both record types without rewriting content or sources', async () => {
  const entries = [makeRecord(entryId, { title: 'A cultural entry', category: 'history', content: 'Original entry text.' })]
  const places = [makeRecord(placeId, { name: 'A heritage place', category: 'heritage_site', description: 'Original place text.' })]
  const originalEntrySource = structuredClone(entries[0].sources)
  const originalPlaceSource = structuredClone(places[0].sources)
  await withServer({ entries, places }, async (baseUrl) => {
    const auth = await login(baseUrl)
    for (const [type, id] of [['cultural-entries', entryId], ['places', placeId]]) {
      const detailResponse = await fetch(`${baseUrl}/api/admin/submissions/${type}/${id}`, authenticatedOptions(auth.cookie, auth.body.data.csrfToken))
      assert.equal(detailResponse.status, 200)
      assert.match((await detailResponse.json()).data.record.image.url, /^https:\/\//)
      const path = `${baseUrl}/api/admin/submissions/${type}/${id}/approve`
      const response = await fetch(path, authenticatedOptions(auth.cookie, auth.body.data.csrfToken, 'POST', {}))
      assert.equal(response.status, 200)
      assert.equal((await response.json()).data.record.reviewStatus, 'published')
    }
    assert.equal(entries[0].content, 'Original entry text.')
    assert.deepEqual(entries[0].sources, originalEntrySource)
    assert.equal(places[0].description, 'Original place text.')
    assert.deepEqual(places[0].sources, originalPlaceSource)
    assert.equal(entries[0].reviewStatus, 'published')
    assert.equal(places[0].reviewStatus, 'published')
  })
})

test('administrator cannot publish a legacy pending submission without a valid image', async () => {
  const entries = [makeRecord(entryId, { title: 'Legacy text-only entry', image: undefined })]
  await withServer({ entries, places: [] }, async (baseUrl) => {
    const auth = await login(baseUrl)
    const response = await fetch(
      `${baseUrl}/api/admin/submissions/cultural-entries/${entryId}/approve`,
      authenticatedOptions(auth.cookie, auth.body.data.csrfToken, 'POST', {}),
    )
    assert.equal(response.status, 409)
    assert.match((await response.json()).message, /valid image/i)
    assert.equal(entries[0].reviewStatus, 'pending_review')
  })
})

test('administrator can reject entry and place submissions with an optional reason', async () => {
  const entries = [makeRecord(entryId, { title: 'Pending entry' })]
  const places = [makeRecord(placeId, { name: 'Pending place' })]
  await withServer({ entries, places }, async (baseUrl) => {
    const auth = await login(baseUrl)
    const entryResponse = await fetch(`${baseUrl}/api/admin/submissions/cultural-entries/${entryId}/reject`, authenticatedOptions(auth.cookie, auth.body.data.csrfToken, 'POST', { reason: 'Please add stronger references.' }))
    const placeResponse = await fetch(`${baseUrl}/api/admin/submissions/places/${placeId}/reject`, authenticatedOptions(auth.cookie, auth.body.data.csrfToken, 'POST', {}))
    assert.equal(entryResponse.status, 200)
    assert.equal(places[0].reviewStatus, 'rejected')
    assert.equal(entries[0].reviewStatus, 'rejected')
    assert.equal(entries[0].rejectionReason, 'Please add stronger references.')
    assert.equal(places[0].rejectionReason, undefined)
    assert.equal(placeResponse.status, 200)
  })
})

test('csrf, type, identifier, approval body, and rejection reason validation fail safely', async () => {
  const entries = [makeRecord(entryId, { title: 'Pending entry' })]
  await withServer({ entries, places: [] }, async (baseUrl) => {
    const auth = await login(baseUrl)
    const requests = [
      [`/api/admin/submissions/cultural-entries/${entryId}/approve`, 'POST', {}, '', 403],
      [`/api/admin/submissions/unsupported/${entryId}`, 'GET', undefined, undefined, 400],
      ['/api/admin/submissions/places/not-an-object-id/approve', 'POST', {}, auth.body.data.csrfToken, 400],
      [`/api/admin/submissions/cultural-entries/${entryId}/approve`, 'POST', { title: 'rewrite attempt' }, auth.body.data.csrfToken, 400],
      [`/api/admin/submissions/cultural-entries/${entryId}/reject`, 'POST', { reason: 'x'.repeat(1001) }, auth.body.data.csrfToken, 400],
      [`/api/admin/submissions/cultural-entries/${entryId}/reject`, 'POST', { reviewStatus: 'published' }, auth.body.data.csrfToken, 400],
    ]
    for (const [path, method, body, csrf, expected] of requests) {
      const response = await fetch(`${baseUrl}${path}`, authenticatedOptions(auth.cookie, csrf, method, body))
      assert.equal(response.status, expected, path)
    }
    assert.equal(entries[0].reviewStatus, 'pending_review')
  })
})

test('logout clears the session cookie and subsequent session reads require login', async () => {
  await withServer({ entries: [], places: [] }, async (baseUrl) => {
    const auth = await login(baseUrl)
    const logoutResponse = await fetch(`${baseUrl}/api/admin/logout`, authenticatedOptions(auth.cookie, auth.body.data.csrfToken, 'POST', {}))
    assert.equal(logoutResponse.status, 200)
    assert.match(logoutResponse.headers.get('set-cookie'), /Max-Age=0/)
    const afterLogout = await fetch(`${baseUrl}/api/admin/session`, authenticatedOptions(auth.cookie, auth.body.data.csrfToken))
    assert.equal(afterLogout.status, 401)
  })
})

test('public country APIs continue to hide pending and rejected content', async () => {
  const entries = [
    makeRecord(entryId, { title: 'Published entry', reviewStatus: 'published' }),
    makeRecord('65fabc1234567890abcdef14', { title: 'Pending entry', reviewStatus: 'pending_review' }),
    makeRecord('65fabc1234567890abcdef15', { title: 'Rejected entry', reviewStatus: 'rejected' }),
  ]
  const places = [
    makeRecord(placeId, { name: 'Published place', reviewStatus: 'published' }),
    makeRecord('65fabc1234567890abcdef16', { name: 'Pending place', reviewStatus: 'pending_review' }),
    makeRecord('65fabc1234567890abcdef17', { name: 'Rejected place', reviewStatus: 'rejected' }),
  ]
  await withServer({ entries, places }, async (baseUrl) => {
    const entriesResponse = await fetch(`${baseUrl}/api/countries/india/cultural-entries`)
    const placesResponse = await fetch(`${baseUrl}/api/countries/india/places`)
    assert.deepEqual((await entriesResponse.json()).data.map(({ title }) => title), ['Published entry'])
    assert.deepEqual((await placesResponse.json()).data.map(({ name }) => name), ['Published place'])
  })
})
