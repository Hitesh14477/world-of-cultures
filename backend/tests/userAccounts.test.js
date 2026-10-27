import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createApp } from '../src/app.js'
import User from '../src/models/User.js'
import { hashPassword } from '../src/services/passwords.js'

const ORIGIN = 'http://localhost:5173'
const USER_SECRET = 'independent-user-session-secret-for-tests-12345'
const USER_A = '65fabc1234567890abcdef01'
const USER_B = '65fabc1234567890abcdef02'
const COUNTRY_ID = '65fabc1234567890abcdef11'
const ENTRY_ID = '65fabc1234567890abcdef12'
const PENDING_ID = '65fabc1234567890abcdef13'
const REJECTED_ID = '65fabc1234567890abcdef14'
const PLACE_ID = '65fabc1234567890abcdef15'
const ADMIN_SALT = randomBytes(16).toString('base64url')
const ADMIN_HASH = `scrypt$${ADMIN_SALT}$${randomBytes(64).toString('base64url')}`

const countryRecords = [{
  _id: COUNTRY_ID,
  slug: 'india',
  name: 'India',
  officialName: 'Republic of India',
  flagEmoji: '🇮🇳',
  continent: 'Asia',
  region: 'Southern Asia',
  capital: ['New Delhi'],
}]
const entryRecords = [
  { _id: ENTRY_ID, country: COUNTRY_ID, title: 'Published entry', category: 'history', summary: 'Published summary.', content: 'Published content.', reviewStatus: 'published' },
  { _id: PENDING_ID, country: COUNTRY_ID, title: 'Pending entry', category: 'history', content: 'Private pending content.', reviewStatus: 'pending_review' },
  { _id: REJECTED_ID, country: COUNTRY_ID, title: 'Rejected entry', category: 'history', content: 'Private rejected content.', reviewStatus: 'rejected' },
]
const placeRecords = [{ _id: PLACE_ID, country: COUNTRY_ID, name: 'Published place', category: 'heritage_site', description: 'Published place description.', reviewStatus: 'published' }]

function queryResult(getValue, beforeRead = null) {
  const options = { offset: 0, maximum: Infinity }
  return {
    select() { return this },
    populate() { return this },
    sort() { return this },
    skip(value) { options.offset = value; return this },
    limit(value) { options.maximum = value; return this },
    async lean() {
      if (beforeRead) await beforeRead()
      const value = getValue(options)
      return value == null ? null : structuredClone(value)
    },
  }
}

function makeUsers() {
  const records = []
  return {
    records,
    async create(document) {
      if (records.some((user) => user.email === document.email)) throw Object.assign(new Error('duplicate email'), { code: 11000, keyPattern: { email: 1 } })
      if (records.some((user) => user.username === document.username)) throw Object.assign(new Error('duplicate username'), { code: 11000, keyPattern: { username: 1 } })
      const user = { _id: records.length === 0 ? USER_A : USER_B, ...document, createdAt: new Date('2026-01-01T00:00:00.000Z') }
      records.push(user)
      return user
    },
    findOne(filter) {
      return queryResult(() => records.find((user) => (filter.email ? user.email === filter.email : true)
        && (filter.username ? user.username === filter.username : true)
        && (filter._id?.$ne ? String(user._id) !== String(filter._id.$ne) : true)) || null)
    },
    findById(id) {
      return queryResult(() => records.find((user) => user._id === String(id)) || null)
    },
    findByIdAndUpdate(id, update) {
      return queryResult(() => {
        const user = records.find((row) => String(row._id) === String(id))
        if (user) Object.assign(user, update.$set)
        return user || null
      })
    },
  }
}

function makeTargetModel(rows, { countries = countryRecords, populateCountry = false } = {}) {
  return {
    records: rows,
    findOne(filter) {
      return queryResult(() => rows.find((row) => {
        if (filter.slug && row.slug !== filter.slug) return false
        if (filter._id && row._id !== String(filter._id)) return false
        if (filter.reviewStatus && row.reviewStatus !== filter.reviewStatus) return false
        return true
      }) || null)
    },
    find(filter) {
      const matching = (row) => {
        if (filter._id?.$in && !filter._id.$in.some((id) => String(id) === String(row._id))) return false
        if (filter.reviewStatus && row.reviewStatus !== filter.reviewStatus) return false
        if (filter.submittedBy && String(row.submittedBy) !== String(filter.submittedBy)) return false
        return true
      }
      return queryResult(({ offset, maximum }) => rows.filter(matching).map((row) => {
        if (!populateCountry || typeof row.country !== 'string') return row
        return { ...row, country: countries.find((country) => country._id === row.country) || null }
      }).slice(offset, offset + maximum))
    },
    countDocuments(filter) { return Promise.resolve(rows.filter((row) => (!filter.submittedBy || String(row.submittedBy) === String(filter.submittedBy))).length) },
  }
}

function makeFavourites() {
  const records = []
  return {
    records,
    async create(document) {
      const duplicate = records.some((item) => item.user === String(document.user)
        && item.targetType === document.targetType && String(item.targetId) === String(document.targetId))
      if (duplicate) throw Object.assign(new Error('duplicate'), { code: 11000 })
      const item = { _id: `favourite-${records.length + 1}`, ...document, user: String(document.user), targetId: String(document.targetId), createdAt: new Date() }
      records.push(item)
      return item
    },
    find(filter) {
      return queryResult(() => records.filter((item) => item.user === String(filter.user)))
    },
    findOne(filter) {
      return queryResult(() => records.find((item) => item.user === String(filter.user)
        && item.targetType === filter.targetType && String(item.targetId) === String(filter.targetId)) || null)
    },
    countDocuments(filter) { return Promise.resolve(records.filter((item) => String(item.user) === String(filter.user)).length) },
    findOneAndDelete(filter) {
      let removed = null
      return queryResult(() => removed, () => {
        const index = records.findIndex((item) => item.user === String(filter.user)
          && item.targetType === filter.targetType && String(item.targetId) === String(filter.targetId))
        if (index >= 0) [removed] = records.splice(index, 1)
      })
    },
  }
}

function makeCommunityPosts(rows = []) {
  return {
    records: rows,
    find(filter) {
      return queryResult(({ offset, maximum }) => rows.filter((row) => String(row.author) === String(filter.author) && row.status !== 'removed').slice(offset, offset + maximum).map((row) => ({ ...row, country: countryRecords.find((country) => country._id === row.country) || row.country })))
    },
    countDocuments(filter) { return Promise.resolve(rows.filter((row) => String(row.author) === String(filter.author) && row.status !== 'removed').length) },
  }
}

async function withUserServer(run, { adminPasswordHash = ADMIN_HASH, communityPosts = [], culturalEntryModel = null } = {}) {
  const UserModel = makeUsers()
  const UserFavouriteModel = makeFavourites()
  const CommunityPostModel = makeCommunityPosts(communityPosts)
  const CountryModel = makeTargetModel(countryRecords)
  const CulturalEntryModel = culturalEntryModel || makeTargetModel(entryRecords, { populateCountry: true })
  const PlaceModel = makeTargetModel(placeRecords, { populateCountry: true })
  const app = createApp({
    CountryModel,
    CulturalEntryModel,
    PlaceModel,
    UserModel,
    UserFavouriteModel,
    CommunityPostModel,
    userEnv: { USER_SESSION_SECRET: USER_SECRET, FRONTEND_ORIGIN: ORIGIN, NODE_ENV: 'test' },
    adminEnv: { ADMIN_USERNAME: 'admin', ADMIN_SESSION_SECRET: 'admin-session-secret-for-isolation-tests', ADMIN_PASSWORD_HASH: adminPasswordHash, FRONTEND_ORIGIN: ORIGIN },
  })
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  try {
    await run(`http://127.0.0.1:${server.address().port}`, { UserModel, UserFavouriteModel, CommunityPostModel, CountryModel, CulturalEntryModel, PlaceModel })
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

async function post(baseUrl, path, body, { cookie = '', csrf = '' } = {}) {
  const headers = { 'Content-Type': 'application/json', Origin: ORIGIN }
  if (cookie) headers.Cookie = cookie
  if (csrf) headers['X-CSRF-Token'] = csrf
  const response = await fetch(`${baseUrl}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await response.text()
  return { response, body: text ? JSON.parse(text) : null, cookie: response.headers.get('set-cookie')?.split(';')[0] || '' }
}

async function register(baseUrl, email, password = 'a strong password 123', username = email.split('@')[0]) {
  return post(baseUrl, '/api/users/register', { username, email, password })
}

function userHeaders(cookie, csrf = '') {
  const headers = { Cookie: cookie }
  if (csrf) {
    headers.Origin = ORIGIN
    headers['X-CSRF-Token'] = csrf
  }
  return headers
}

test('registration validates email/password, rejects extra privilege fields, and handles duplicate accounts', async () => {
  await withUserServer(async (baseUrl, { UserModel }) => {
    for (const invalid of [
      { payload: { username: 'reader', email: 'not-an-email', password: 'a strong password 123' } },
      { payload: { username: 'reader', email: 'reader@example.org', password: 'short' } },
      { payload: { username: 'reader', email: 'reader@example.org', password: 'a strong password 123', role: 'admin' } },
      ...['', 'ab', 'two words', 'name-with-hyphen', 'üser', 'a'.repeat(25)].map((username) => ({
        payload: { username, email: 'reader@example.org', password: 'a strong password 123' },
      })),
    ]) {
      const response = await post(baseUrl, '/api/users/register', invalid.payload)
      assert.equal(response.response.status, 400)
    }
    assert.equal(UserModel.records.length, 0)

    const created = await register(baseUrl, 'Reader@Example.org', undefined, 'Atlas_Reader')
    assert.equal(created.response.status, 201)
    assert.equal(created.body.data.user.email, 'reader@example.org')
    assert.equal(created.body.data.user.username, 'atlas_reader')
    assert.ok(created.cookie.startsWith('woc_user_session='))
    assert.equal(JSON.stringify(created.body).includes('passwordHash'), false)
    assert.equal(JSON.stringify(created.body).includes(UserModel.records[0].passwordHash), false)
    assert.match(UserModel.records[0].passwordHash, /^scrypt\$/)
    assert.notEqual(UserModel.records[0].passwordHash, 'a strong password 123')

    const duplicate = await register(baseUrl, 'reader@example.org')
    assert.equal(duplicate.response.status, 409)
    assert.equal(UserModel.records.length, 1)

    const duplicateUsername = await register(baseUrl, 'other@example.org', undefined, 'ATLAS_READER')
    assert.equal(duplicateUsername.response.status, 409)
    assert.equal(duplicateUsername.body.message, 'That username is already taken.')
    assert.equal(UserModel.records.length, 1)
  })
})

test('username is optional for legacy user records and has a partial unique index', async () => {
  const legacyUser = new User({
    email: 'legacy@example.org',
    passwordHash: `scrypt$${randomBytes(16).toString('base64url')}$${randomBytes(64).toString('base64url')}`,
  })
  await legacyUser.validate()
  const usernameIndex = User.schema.indexes().find(([fields]) => fields.username === 1)
  assert.equal(usernameIndex[1].unique, true)
  assert.deepEqual(usernameIndex[1].partialFilterExpression, { username: { $type: 'string' } })
})

test('login succeeds, wrong credentials fail safely, current session omits hashes, and logout revokes the session', async () => {
  await withUserServer(async (baseUrl) => {
    await register(baseUrl, 'reader@example.org')
    const signedIn = await post(baseUrl, '/api/users/login', { email: 'READER@example.org', password: 'a strong password 123' })
    assert.equal(signedIn.response.status, 200)
    assert.ok(signedIn.body.data.csrfToken)
    assert.equal(JSON.stringify(signedIn.body).includes('passwordHash'), false)
    assert.match(signedIn.response.headers.get('set-cookie'), /woc_user_session=.*; Path=\/api; HttpOnly; SameSite=Strict/)
    assert.doesNotMatch(signedIn.response.headers.get('set-cookie'), /; Secure(?:;|$)/)

    const loggedOutSession = await fetch(`${baseUrl}/api/users/session`, { headers: { Origin: ORIGIN } })
    assert.equal(loggedOutSession.status, 401)
    assert.equal(loggedOutSession.headers.get('access-control-allow-origin'), ORIGIN)
    assert.equal(loggedOutSession.headers.get('access-control-allow-credentials'), 'true')

    const wrong = await post(baseUrl, '/api/users/login', { email: 'reader@example.org', password: 'wrong password' })
    assert.equal(wrong.response.status, 401)
    assert.equal(wrong.body.message, 'The email or password is incorrect.')
    assert.equal(wrong.cookie, '')

    const session = await fetch(`${baseUrl}/api/users/session`, { headers: userHeaders(signedIn.cookie) })
    assert.equal(session.status, 200)
    const sessionBody = await session.json()
    assert.equal(sessionBody.data.user.email, 'reader@example.org')
    assert.equal(JSON.stringify(sessionBody).includes('passwordHash'), false)

    const logout = await post(baseUrl, '/api/users/logout', {}, { cookie: signedIn.cookie, csrf: signedIn.body.data.csrfToken })
    assert.equal(logout.response.status, 200)
    assert.match(logout.response.headers.get('set-cookie'), /Max-Age=0/)
    const afterLogout = await fetch(`${baseUrl}/api/users/session`, { headers: userHeaders(signedIn.cookie) })
    assert.equal(afterLogout.status, 401)
  })
})

test('regular-user and administrator logout revoke only their own sessions', async () => {
  const adminPasswordHash = await hashPassword('a strong administrator password')
  await withUserServer(async (baseUrl) => {
    const firstUser = await register(baseUrl, 'first@example.org')
    const admin = await post(baseUrl, '/api/admin/login', { username: 'admin', password: 'a strong administrator password' })
    assert.equal(admin.response.status, 200)

    const userLogout = await post(baseUrl, '/api/users/logout', {}, { cookie: firstUser.cookie, csrf: firstUser.body.data.csrfToken })
    assert.equal(userLogout.response.status, 200)
    const userSessionAfterLogout = await fetch(`${baseUrl}/api/users/session`, { headers: userHeaders(firstUser.cookie) })
    const adminSessionAfterUserLogout = await fetch(`${baseUrl}/api/admin/session`, { headers: { Cookie: admin.cookie } })
    assert.equal(userSessionAfterLogout.status, 401)
    assert.equal(adminSessionAfterUserLogout.status, 200)

    const secondUser = await register(baseUrl, 'second@example.org')
    const adminLogout = await post(baseUrl, '/api/admin/logout', {}, { cookie: admin.cookie, csrf: admin.body.data.csrfToken })
    assert.equal(adminLogout.response.status, 200)
    const adminSessionAfterLogout = await fetch(`${baseUrl}/api/admin/session`, { headers: { Cookie: admin.cookie } })
    const userSessionAfterAdminLogout = await fetch(`${baseUrl}/api/users/session`, { headers: userHeaders(secondUser.cookie) })
    assert.equal(adminSessionAfterLogout.status, 401)
    assert.equal(userSessionAfterAdminLogout.status, 200)
  }, { adminPasswordHash })
})

test('profile endpoints return only the authenticated account data and allow safe field updates', async () => {
  const myEntry = { _id: ENTRY_ID, country: COUNTRY_ID, submittedBy: USER_A, title: 'My pending entry', category: 'history', reviewStatus: 'pending_review', createdAt: new Date('2026-02-02') }
  const otherEntry = { _id: PENDING_ID, country: COUNTRY_ID, submittedBy: USER_B, title: 'Another user entry', category: 'history', reviewStatus: 'pending_review', createdAt: new Date('2026-02-03') }
  const entryModel = makeTargetModel([...entryRecords, myEntry, otherEntry], { populateCountry: true })
  await withUserServer(async (baseUrl, { UserModel, CommunityPostModel }) => {
    const guest = await fetch(`${baseUrl}/api/users/me/profile`)
    assert.equal(guest.status, 401)

    const first = await register(baseUrl, 'profile-owner@example.org', undefined, 'profile_owner')
    const second = await register(baseUrl, 'profile-other@example.org', undefined, 'profile_other')
    const profileResponse = await fetch(`${baseUrl}/api/users/me/profile`, { headers: userHeaders(first.cookie) })
    const profile = await profileResponse.json()
    assert.equal(profileResponse.status, 200)
    assert.equal(profile.data.user.email, 'profile-owner@example.org')
    assert.equal(profile.data.counts.contributions, 1)
    assert.equal(JSON.stringify(profile).includes('passwordHash'), false)

    const contributionsResponse = await fetch(`${baseUrl}/api/users/me/contributions`, { headers: userHeaders(first.cookie) })
    const contributions = await contributionsResponse.json()
    assert.deepEqual(contributions.data.map((item) => item.title), ['My pending entry'])
    assert.equal(contributions.data[0].reviewStatus, 'pending_review')
    assert.equal(contributions.data[0].country.slug, 'india')

    CommunityPostModel.records.push({ _id: 'post-owner', author: USER_A, country: COUNTRY_ID, caption: 'My post', image: { url: 'https://images.example.test/p.webp', publicId: 'p' }, status: 'published', createdAt: new Date() })
    CommunityPostModel.records.push({ _id: 'post-other', author: USER_B, country: COUNTRY_ID, caption: 'Other post', image: { url: 'https://images.example.test/q.webp', publicId: 'q' }, status: 'published', createdAt: new Date() })
    const postsResponse = await fetch(`${baseUrl}/api/users/me/community-posts`, { headers: userHeaders(first.cookie) })
    const posts = await postsResponse.json()
    assert.deepEqual(posts.data.map((item) => item.caption), ['My post'])
    assert.equal(posts.data[0].country.name, 'India')

    const update = await fetch(`${baseUrl}/api/users/me/profile`, {
      method: 'PATCH',
      headers: { ...userHeaders(first.cookie, first.body.data.csrfToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Updated_Name', displayName: 'Atlas Reader', bio: 'A short profile.' }),
    })
    assert.equal(update.status, 200)
    const updated = await update.json()
    assert.equal(updated.data.username, 'updated_name')
    assert.equal(updated.data.displayName, 'Atlas Reader')
    assert.equal(UserModel.records[0].bio, 'A short profile.')

    const forbidden = await fetch(`${baseUrl}/api/users/me/profile`, {
      method: 'PATCH',
      headers: { ...userHeaders(first.cookie, first.body.data.csrfToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'admin' }),
    })
    assert.equal(forbidden.status, 400)
    const duplicate = await fetch(`${baseUrl}/api/users/me/profile`, {
      method: 'PATCH',
      headers: { ...userHeaders(first.cookie, first.body.data.csrfToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'profile_other' }),
    })
    assert.equal(duplicate.status, 409)
    assert.equal(second.response.status, 201)
  }, { communityPosts: [], culturalEntryModel: entryModel })
})

test('unauthenticated favourite reads and writes are rejected', async () => {
  await withUserServer(async (baseUrl) => {
    const get = await fetch(`${baseUrl}/api/users/me/favourites`)
    const add = await post(baseUrl, '/api/users/me/favourites', { type: 'country', id: 'india' })
    const remove = await fetch(`${baseUrl}/api/users/me/favourites/country/india`, { method: 'DELETE', headers: { Origin: ORIGIN } })
    assert.equal(get.status, 401)
    assert.equal(add.response.status, 401)
    assert.equal(remove.status, 401)
  })
})

test('favourites support country, published entry, and place; duplicates are idempotent', async () => {
  await withUserServer(async (baseUrl, { UserFavouriteModel }) => {
    const account = await register(baseUrl, 'reader@example.org')
    const auth = { cookie: account.cookie, csrf: account.body.data.csrfToken }
    for (const target of [
      { type: 'country', id: 'india' },
      { type: 'cultural-entry', id: ENTRY_ID },
      { type: 'place', id: PLACE_ID },
    ]) {
      const saved = await post(baseUrl, '/api/users/me/favourites', target, auth)
      assert.equal(saved.response.status, 201)
      const duplicate = await post(baseUrl, '/api/users/me/favourites', target, auth)
      assert.equal(duplicate.response.status, 200)
      assert.equal(duplicate.body.data.alreadySaved, true)
    }
    assert.equal(UserFavouriteModel.records.length, 3)

    const collection = await fetch(`${baseUrl}/api/users/me/favourites`, { headers: userHeaders(auth.cookie) })
    const body = await collection.json()
    assert.equal(collection.status, 200)
    assert.equal(body.data.countries[0].country.name, 'India')
    assert.deepEqual(body.data.culturalEntries.map((item) => item.id), [ENTRY_ID])
    assert.deepEqual(body.data.places.map((item) => item.id), [PLACE_ID])
    assert.equal(JSON.stringify(body).includes('passwordHash'), false)

    const status = await fetch(`${baseUrl}/api/users/me/favourites/place/${PLACE_ID}`, { headers: userHeaders(auth.cookie) })
    assert.equal((await status.json()).data.isSaved, true)
    const removed = await fetch(`${baseUrl}/api/users/me/favourites/place/${PLACE_ID}`, {
      method: 'DELETE',
      headers: userHeaders(auth.cookie, auth.csrf),
    })
    assert.equal(removed.status, 200)
    const removedEntry = await fetch(`${baseUrl}/api/users/me/favourites/cultural-entry/${ENTRY_ID}`, {
      method: 'DELETE',
      headers: userHeaders(auth.cookie, auth.csrf),
    })
    const removedCountry = await fetch(`${baseUrl}/api/users/me/favourites/country/india`, {
      method: 'DELETE',
      headers: userHeaders(auth.cookie, auth.csrf),
    })
    assert.equal(removedEntry.status, 200)
    assert.equal(removedCountry.status, 200)
    assert.equal(UserFavouriteModel.records.length, 0)
    const refreshedCollection = await fetch(`${baseUrl}/api/users/me/favourites`, { headers: userHeaders(auth.cookie) })
    const refreshedBody = await refreshedCollection.json()
    assert.deepEqual(refreshedBody.data, { countries: [], culturalEntries: [], places: [] })
  })
})

test('favourites are private to the owner and users cannot access administrator routes', async () => {
  await withUserServer(async (baseUrl, { UserFavouriteModel }) => {
    const first = await register(baseUrl, 'first@example.org')
    const second = await register(baseUrl, 'second@example.org')
    await post(baseUrl, '/api/users/me/favourites', { type: 'country', id: 'india' }, { cookie: first.cookie, csrf: first.body.data.csrfToken })

    const secondCollection = await fetch(`${baseUrl}/api/users/me/favourites`, { headers: userHeaders(second.cookie) })
    assert.deepEqual((await secondCollection.json()).data.countries, [])
    const secondStatus = await fetch(`${baseUrl}/api/users/me/favourites/country/india`, { headers: userHeaders(second.cookie) })
    assert.equal((await secondStatus.json()).data.isSaved, false)
    const attemptedRemoval = await fetch(`${baseUrl}/api/users/me/favourites/country/india`, {
      method: 'DELETE',
      headers: userHeaders(second.cookie, second.body.data.csrfToken),
    })
    assert.equal(attemptedRemoval.status, 404)
    assert.equal(UserFavouriteModel.records.length, 1)

    const adminQueue = await fetch(`${baseUrl}/api/admin/pending`, { headers: userHeaders(first.cookie) })
    assert.equal(adminQueue.status, 401)
  })
})

test('nonexistent records and pending or rejected cultural content cannot be favourited', async () => {
  await withUserServer(async (baseUrl) => {
    const account = await register(baseUrl, 'reader@example.org')
    const auth = { cookie: account.cookie, csrf: account.body.data.csrfToken }
    for (const target of [
      { type: 'cultural-entry', id: PENDING_ID },
      { type: 'cultural-entry', id: REJECTED_ID },
      { type: 'place', id: '65fabc1234567890abcdef16' },
      { type: 'country', id: 'not-a-country' },
    ]) {
      const response = await post(baseUrl, '/api/users/me/favourites', target, auth)
      assert.equal(response.response.status, 404)
    }
  })
})

test('collection reads safely omit favourite references whose content was deleted or unpublished', async () => {
  await withUserServer(async (baseUrl, { CulturalEntryModel }) => {
    const account = await register(baseUrl, 'reader@example.org')
    const auth = { cookie: account.cookie, csrf: account.body.data.csrfToken }
    await post(baseUrl, '/api/users/me/favourites', { type: 'cultural-entry', id: ENTRY_ID }, auth)

    CulturalEntryModel.records.splice(0, 1)
    const response = await fetch(`${baseUrl}/api/users/me/favourites`, { headers: userHeaders(auth.cookie) })
    const collection = await response.json()
    assert.equal(response.status, 200)
    assert.deepEqual(collection.data.culturalEntries, [])
  })
})

test('CSRF and body validation protect favourite writes', async () => {
  await withUserServer(async (baseUrl, { UserFavouriteModel }) => {
    const account = await register(baseUrl, 'reader@example.org')
    const noCsrf = await post(baseUrl, '/api/users/me/favourites', { type: 'country', id: 'india' }, { cookie: account.cookie })
    const extraFields = await post(baseUrl, '/api/users/me/favourites', { type: 'country', id: 'india', user: USER_B }, { cookie: account.cookie, csrf: account.body.data.csrfToken })
    assert.equal(noCsrf.response.status, 403)
    assert.equal(extraFields.response.status, 400)
    assert.equal(UserFavouriteModel.records.length, 0)
  })
})
