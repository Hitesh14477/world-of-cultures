import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, scryptSync } from 'node:crypto'
import { createApp } from '../src/app.js'
import { createCommunityImageStorage } from '../src/services/communityImageStorage.js'

const ORIGIN = 'http://localhost:5173'
const USER_SECRET = 'community-test-session-secret-0123456789-abcdef'
const USER_ONE = '65fabc1234567890abcdef01'
const USER_TWO = '65fabc1234567890abcdef02'
const COUNTRY_ID = '65fabc1234567890abcdef11'
const POST_ONE = '65fabc1234567890abcdef21'
const COMMENT_ONE = '65fabc1234567890abcdef31'
const COUNTRY = { _id: COUNTRY_ID, slug: 'india', name: 'India', flagEmoji: '🇮🇳' }
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/xioAAAAASUVORK5CYII=', 'base64')
const ADMIN_PASSWORD = 'community admin password 1234'
const ADMIN_SALT = randomBytes(16)
const ADMIN_HASH = `scrypt$${ADMIN_SALT.toString('base64url')}$${scryptSync(ADMIN_PASSWORD, ADMIN_SALT, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString('base64url')}`
const ADMIN_ENV = {
  NODE_ENV: 'test',
  FRONTEND_ORIGIN: ORIGIN,
  ADMIN_USERNAME: 'editor',
  ADMIN_PASSWORD_HASH: ADMIN_HASH,
  ADMIN_SESSION_SECRET: 'community-admin-session-secret-0123456789',
}

function query(getValue) {
  const chain = {
    populate() { return this },
    sort() { return this },
    skip(value) { this.offset = value; return this },
    limit(value) { this.maximum = value; return this },
    select() { return this },
    lean() { return this },
    then(resolve, reject) {
      return Promise.resolve().then(() => getValue(this)).then(resolve, reject)
    },
  }
  return chain
}

function makeUserModel() {
  const records = []
  return {
    records,
    async create(document) {
      const user = { _id: records.length ? USER_TWO : USER_ONE, ...document, createdAt: new Date() }
      records.push(user)
      return user
    },
    findOne(filter) { return query(() => records.find((record) => (filter.adminIdentity ? record.adminIdentity === filter.adminIdentity : filter.email ? record.email === filter.email : record.username === filter.username)) || null) },
    findById(id) { return query(() => records.find((record) => String(record._id) === String(id)) || null) },
  }
}

function makeCountryModel() {
  return {
    findOne(filter) { return query(() => filter.slug === COUNTRY.slug ? COUNTRY : null) },
  }
}

function makePostModel(initial = [], users = []) {
  const records = structuredClone(initial)
  function populated(row) {
    if (!row) return null
    return {
      ...structuredClone(row),
      author: { _id: row.author, username: users.find((user) => String(user._id) === String(row.author))?.username || row.username || 'reader' },
      country: structuredClone(COUNTRY),
    }
  }
  return {
    records,
    find(filter) {
      return query(({ offset = 0, maximum = Infinity }) => records
        .filter((row) => row.status === filter.status && (!filter.country || String(row.country) === String(filter.country)) && (!filter.author || String(row.author) === String(filter.author)))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(offset, offset + maximum).map(populated))
    },
    countDocuments(filter) { return Promise.resolve(records.filter((row) => row.status === filter.status && (!filter.country || String(row.country) === String(filter.country)) && (!filter.author || String(row.author) === String(filter.author))).length) },
    async create(document) {
      const row = { _id: POST_ONE, ...document, createdAt: new Date(), updatedAt: new Date() }
      records.push(row)
      return row
    },
    findById(id) { return query(() => populated(records.find((row) => String(row._id) === String(id)) || null)) },
    findOne(filter) {
      return query(() => {
        const row = records.find((item) => String(item._id) === String(filter._id)
          && (!filter.author || String(item.author) === String(filter.author)) && item.status === filter.status)
        return filter.author ? populated(row) : row ? structuredClone(row) : null
      })
    },
    async findOneAndUpdate(filter, update) {
      const row = records.find((item) => String(item._id) === String(filter._id)
        && String(item.author) === String(filter.author) && item.status === filter.status)
      if (!row) return null
      Object.assign(row, update.$set, { updatedAt: new Date() })
      if (update.$addToSet?.pendingImageCleanupIds) {
        row.pendingImageCleanupIds ||= []
        if (!row.pendingImageCleanupIds.includes(update.$addToSet.pendingImageCleanupIds)) row.pendingImageCleanupIds.push(update.$addToSet.pendingImageCleanupIds)
      }
      return row
    },
    async updateOne(filter, update) {
      const row = records.find((item) => String(item._id) === String(filter._id)
        && (!filter.author || String(item.author) === String(filter.author))
        && (!filter.status || item.status === filter.status)
        && (filter.likesCount?.$gt === undefined || (item.likesCount || 0) > filter.likesCount.$gt)
        && (filter.commentsCount?.$gt === undefined || (item.commentsCount || 0) > filter.commentsCount.$gt))
      if (row) {
        if (update.$set) Object.assign(row, update.$set)
        if (update.$inc) for (const [key, amount] of Object.entries(update.$inc)) row[key] = (row[key] || 0) + amount
        if (update.$pull?.pendingImageCleanupIds) row.pendingImageCleanupIds = (row.pendingImageCleanupIds || []).filter((id) => id !== update.$pull.pendingImageCleanupIds)
      }
      return { modifiedCount: row ? 1 : 0 }
    },
  }
}

function makeLikeModel() {
  const records = []
  return {
    records,
    async create(document) {
      if (records.some((row) => String(row.post) === String(document.post) && String(row.user) === String(document.user))) throw Object.assign(new Error('duplicate'), { code: 11000 })
      records.push({ _id: `like-${records.length + 1}`, ...document })
    },
    async exists(filter) { return records.some((row) => String(row.post) === String(filter.post) && String(row.user) === String(filter.user)) },
    async deleteOne(filter) {
      const index = records.findIndex((row) => String(row.post) === String(filter.post) && String(row.user) === String(filter.user))
      if (index < 0) return { deletedCount: 0 }
      records.splice(index, 1)
      return { deletedCount: 1 }
    },
  }
}

function makeCommentModel(users) {
  const records = []
  return {
    records,
    async create(document) {
      const comment = { _id: records.length === 0 ? COMMENT_ONE : `65fabc1234567890abcdef${String(31 + records.length).padStart(2, '0')}`, ...document, createdAt: new Date() }
      records.push(comment)
      return comment
    },
    find(filter) {
      return query(() => records.filter((row) => String(row.post) === String(filter.post) && row.status === filter.status)
        .map((row) => ({ ...row, author: { _id: row.author, username: users.find((user) => String(user._id) === String(row.author))?.username || 'reader' } })))
    },
    findOne(filter) {
      return query(() => records.find((row) => String(row._id) === String(filter._id) && String(row.post) === String(filter.post)
        && (!filter.author || String(row.author) === String(filter.author)) && row.status === filter.status) || null)
    },
    async findOneAndUpdate(filter, update) {
      const row = records.find((item) => String(item._id) === String(filter._id) && String(item.post) === String(filter.post)
        && (!filter.author || String(item.author) === String(filter.author)) && item.status === filter.status)
      if (!row) return null
      Object.assign(row, update.$set)
      return row
    },
  }
}

function makeNotificationModel() {
  const records = []
  return {
    records,
    async create(document) { const row = { _id: `65fabc1234567890abcdef${String(41 + records.length).padStart(2, '0')}`, ...document, isRead: false, createdAt: new Date() }; records.push(row); return row },
    countDocuments(filter) { return Promise.resolve(records.filter((row) => String(row.recipient) === String(filter.recipient) && (filter.isRead === undefined || row.isRead === filter.isRead)).length) },
    find(filter) {
      let offset = 0; let maximum = Infinity
      const chain = { populate() { return this }, sort() { return this }, skip(value) { offset = value; return this }, limit(value) { maximum = value; return this }, lean() { return Promise.resolve(records.filter((row) => String(row.recipient) === String(filter.recipient) && (filter.isRead === undefined || row.isRead === filter.isRead)).slice().reverse().slice(offset, offset + maximum)) } }
      return chain
    },
    async findOneAndUpdate(filter, update) { const row = records.find((item) => String(item._id) === String(filter._id) && String(item.recipient) === String(filter.recipient)); if (row) Object.assign(row, update.$set); return row || null },
    async updateMany(filter, update) { for (const row of records) if (String(row.recipient) === String(filter.recipient) && row.isRead === filter.isRead) Object.assign(row, update.$set); return { modifiedCount: 1 } },
    async deleteOne(filter) { const index = records.findIndex((row) => String(row._id) === String(filter._id) && String(row.recipient) === String(filter.recipient)); if (index < 0) return { deletedCount: 0 }; records.splice(index, 1); return { deletedCount: 1 } },
  }
}

async function withCommunityServer(run, { initialPosts = [], uploadImpl, removeImpl, adminEnv = {} } = {}) {
  const UserModel = makeUserModel()
  const CommunityPostModel = makePostModel(initialPosts, UserModel.records)
  const CommunityLikeModel = makeLikeModel()
  const CommunityCommentModel = makeCommentModel(UserModel.records)
  const NotificationModel = makeNotificationModel()
  const uploads = []
  const removals = []
  const imageStorage = {
    async upload(buffer) {
      uploads.push(buffer)
      if (uploadImpl) return uploadImpl(buffer)
      return { url: 'https://images.example.test/community/photo.webp', publicId: `community/test-${uploads.length}` }
    },
    async remove(publicId) {
      removals.push(publicId)
      if (removeImpl) return removeImpl(publicId)
    },
  }
  const app = createApp({
    UserModel,
    CountryModel: makeCountryModel(),
    CommunityPostModel,
    CommunityLikeModel,
    CommunityCommentModel,
    NotificationModel,
    CommunityLikeModel,
    CommunityCommentModel,
    communityImageStorage: imageStorage,
    userEnv: { USER_SESSION_SECRET: USER_SECRET, FRONTEND_ORIGIN: ORIGIN },
    adminEnv,
  })
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject) })
  const address = server.address()
  try { await run(`http://127.0.0.1:${address.port}`, { UserModel, CommunityPostModel, CommunityLikeModel, CommunityCommentModel, NotificationModel, uploads, removals }) }
  finally { await new Promise((resolve) => server.close(resolve)) }
}

async function register(baseUrl, username) {
  const response = await fetch(`${baseUrl}/api/users/register`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email: `${username}@example.test`, password: 'correct-horse-example-password' }),
  })
  const body = await response.json()
  assert.equal(response.status, 201)
  return { cookie: response.headers.get('set-cookie').split(';')[0], csrf: body.data.csrfToken, user: body.data.user }
}

async function loginAdmin(baseUrl) {
  const response = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'editor', password: ADMIN_PASSWORD }),
  })
  const body = await response.json()
  assert.equal(response.status, 200)
  return { cookie: response.headers.get('set-cookie').split(';')[0], csrf: body.data.csrfToken }
}

function postForm({ caption = 'A shared moment.', countrySlug = 'india', image = true } = {}) {
  const form = new FormData()
  if (caption !== undefined) form.append('caption', caption)
  if (countrySlug !== undefined) form.append('countrySlug', countrySlug)
  if (image) form.append('image', new Blob([PNG], { type: 'image/png' }), 'photo.png')
  return form
}

async function sendForm(baseUrl, path, form, session, method = 'POST') {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { Origin: ORIGIN, Cookie: session.cookie, 'X-CSRF-Token': session.csrf },
    body: form,
  })
}

test('community creation requires a verified member session and valid evidence of an image format', async () => {
  await withCommunityServer(async (baseUrl, { uploads }) => {
    const guestResponse = await fetch(`${baseUrl}/api/community`, {
      method: 'POST', headers: { Origin: ORIGIN }, body: postForm(),
    })
    assert.equal(guestResponse.status, 401)
    assert.equal(uploads.length, 0)

    const session = await register(baseUrl, 'reader_one')
    const invalidImage = new FormData()
    invalidImage.append('caption', 'Not really a PNG.')
    invalidImage.append('countrySlug', 'india')
    invalidImage.append('image', new Blob(['not image bytes'], { type: 'image/png' }), 'photo.png')
    const invalidResponse = await sendForm(baseUrl, '/api/community', invalidImage, session)
    assert.equal(invalidResponse.status, 415)
    assert.equal(uploads.length, 0)
  })
})

test('administrator session restores a stable member identity and can publish a community post', async () => {
  await withCommunityServer(async (baseUrl, { UserModel, CommunityPostModel }) => {
    const admin = await loginAdmin(baseUrl)
    assert.match(admin.cookie, /^woc_admin_session=/)
    const memberResponse = await fetch(`${baseUrl}/api/admin/member-session`, { headers: { Cookie: admin.cookie } })
    assert.equal(memberResponse.status, 200)
    const member = (await memberResponse.json()).data.member
    assert.equal(member.displayName, 'editor')
    assert.equal(UserModel.records.length, 1)
    assert.ok(UserModel.records[0].adminIdentity)
    assert.doesNotMatch(JSON.stringify(member), /passwordHash|adminIdentity/)

    const postResponse = await sendForm(baseUrl, '/api/community', postForm({ caption: 'A moment from India.' }), admin)
    const postBody = await postResponse.json()
    assert.equal(postResponse.status, 201)
    assert.equal(postBody.data.author.id, member.id)
    assert.equal(CommunityPostModel.records[0].author, member.id)
    assert.equal(CommunityPostModel.records[0].status, 'published')

    const refreshedMember = await fetch(`${baseUrl}/api/admin/member-session`, { headers: { Cookie: admin.cookie } })
    assert.equal((await refreshedMember.json()).data.member.id, member.id)
  }, { adminEnv: ADMIN_ENV })
})

test('missing image-storage configuration fails clearly without making a provider request', async () => {
  let configured = false
  const storage = createCommunityImageStorage({
    env: {},
    client: { config() { configured = true }, uploader: { upload_stream() { configured = true } } },
  })
  await assert.rejects(async () => storage.upload(PNG), (error) => error.statusCode === 503 && error.message === 'Community image storage is not configured.')
  assert.equal(configured, false)
})

test('image provider failures have an actionable public message without leaking provider details', async () => {
  const storage = createCommunityImageStorage({
    env: { CLOUDINARY_CLOUD_NAME: 'cloud', CLOUDINARY_API_KEY: 'private-key', CLOUDINARY_API_SECRET: 'private-secret' },
    client: { config() {}, uploader: { upload_stream(_options, callback) { callback(new Error('private provider credential detail')); return { end() {} } } } },
  })
  await assert.rejects(storage.upload(PNG), (error) => {
    assert.equal(error.statusCode, 502)
    assert.equal(error.publicMessage, 'Your photo could not be uploaded. Please check your connection and try again.')
    assert.doesNotMatch(error.publicMessage, /private|credential|secret|key/i)
    return true
  })
})

test('image-storage configuration errors return an actionable safe message to post authors', async () => {
  const safeMessage = 'Photo sharing is temporarily unavailable because image storage is not configured.'
  await withCommunityServer(async (baseUrl) => {
    const session = await register(baseUrl, 'reader_one')
    const response = await sendForm(baseUrl, '/api/community', postForm(), session)
    const body = await response.json()
    assert.equal(response.status, 503)
    assert.equal(body.message, safeMessage)
    assert.doesNotMatch(JSON.stringify(body), /secret|credential|stack|cloudinary.*key/i)
  }, {
    uploadImpl: async () => {
      throw Object.assign(new Error('private cloud configuration detail'), {
        statusCode: 503,
        publicMessage: safeMessage,
      })
    },
  })
})

test('authenticated user can create an image post with server-owned author and published feed visibility', async () => {
  await withCommunityServer(async (baseUrl, { CommunityPostModel, uploads }) => {
    const session = await register(baseUrl, 'reader_one')
    const response = await sendForm(baseUrl, '/api/community', postForm({ caption: '  A shared moment.  ' }), session)
    const body = await response.json()
    assert.equal(response.status, 201)
    assert.equal(body.data.caption, 'A shared moment.')
    assert.equal(body.data.author.username, 'reader_one')
    assert.equal(body.data.country.slug, 'india')
    assert.equal(CommunityPostModel.records[0].author, session.user.id)
    assert.equal(CommunityPostModel.records[0].status, 'published')
    assert.equal(uploads.length, 1)
  })
})

test('empty captions and invalid country references are rejected before image upload', async () => {
  await withCommunityServer(async (baseUrl, { uploads }) => {
    const session = await register(baseUrl, 'reader_one')
    const empty = await sendForm(baseUrl, '/api/community', postForm({ caption: '  ' }), session)
    assert.equal(empty.status, 400)
    const badCountry = await sendForm(baseUrl, '/api/community', postForm({ countrySlug: 'not-a-country' }), session)
    assert.equal(badCountry.status, 400)
    assert.equal(uploads.length, 0)
  })
})

test('oversized uploads and client-supplied moderation fields are rejected', async () => {
  await withCommunityServer(async (baseUrl, { uploads }) => {
    const session = await register(baseUrl, 'reader_one')
    const oversized = new FormData()
    oversized.append('caption', 'A shared moment.')
    oversized.append('countrySlug', 'india')
    oversized.append('image', new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/png' }), 'large.png')
    const tooLarge = await sendForm(baseUrl, '/api/community', oversized, session)
    assert.equal(tooLarge.status, 413)

    const forgedStatus = postForm()
    forgedStatus.append('status', 'pending_review')
    const forged = await sendForm(baseUrl, '/api/community', forgedStatus, session)
    assert.equal(forged.status, 400)
    assert.equal(uploads.length, 0)
  })
})

test('public feed filters out non-published posts and applies bounded pagination and country filtering', async () => {
  const rows = [
    { _id: POST_ONE, author: USER_ONE, country: COUNTRY_ID, username: 'one', image: { url: 'https://images.example.test/1', publicId: 'one' }, caption: 'Visible', status: 'published', createdAt: new Date('2026-01-02') },
    { _id: '65fabc1234567890abcdef22', author: USER_ONE, country: COUNTRY_ID, username: 'one', image: { url: 'https://images.example.test/2', publicId: 'two' }, caption: 'Pending', status: 'pending_review', createdAt: new Date('2026-01-03') },
    { _id: '65fabc1234567890abcdef23', author: USER_TWO, country: COUNTRY_ID, username: 'two', image: { url: 'https://images.example.test/3', publicId: 'three' }, caption: 'Removed', status: 'removed', createdAt: new Date('2026-01-04') },
  ]
  await withCommunityServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/community?country=india&page=1&limit=1`)
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.data.length, 1)
    assert.equal(body.data[0].caption, 'Visible')
    assert.equal(body.pagination.total, 1)
    assert.equal(body.pagination.totalPages, 1)
    const invalid = await fetch(`${baseUrl}/api/community?limit=31`)
    assert.equal(invalid.status, 400)
  }, { initialPosts: rows })
})

test('post ownership is enforced for edits and deletion hides the owner post and cleans its stored image', async () => {
  await withCommunityServer(async (baseUrl, { CommunityPostModel, removals }) => {
    const owner = await register(baseUrl, 'reader_one')
    const other = await register(baseUrl, 'reader_two')
    const created = await sendForm(baseUrl, '/api/community', postForm(), owner)
    assert.equal(created.status, 201)

    const denied = await sendForm(baseUrl, `/api/community/${POST_ONE}`, postForm({ caption: 'Changed by another' }), other, 'PATCH')
    assert.equal(denied.status, 404)
    assert.equal(CommunityPostModel.records[0].caption, 'A shared moment.')

    const edited = await sendForm(baseUrl, `/api/community/${POST_ONE}`, postForm({ caption: 'Owner update', image: false }), owner, 'PATCH')
    assert.equal(edited.status, 200)
    assert.equal((await edited.json()).data.caption, 'Owner update')

    const removed = await fetch(`${baseUrl}/api/community/${POST_ONE}`, {
      method: 'DELETE', headers: { Origin: ORIGIN, Cookie: owner.cookie, 'X-CSRF-Token': owner.csrf },
    })
    assert.equal(removed.status, 200)
    assert.equal(CommunityPostModel.records[0].status, 'removed')
    assert.deepEqual(removals, ['community/test-1'])
  })
})

test('administrator post actions require the separate admin session and notify owners when posts are removed', async () => {
  await withCommunityServer(async (baseUrl, { CommunityPostModel, NotificationModel }) => {
    const owner = await register(baseUrl, 'reader_one')
    const admin = await loginAdmin(baseUrl)
    const created = await sendForm(baseUrl, '/api/community', postForm(), owner)
    assert.equal(created.status, 201)

    const denied = await sendForm(baseUrl, `/api/community/moderation/${POST_ONE}`, postForm({ caption: 'Wrong session' }), owner, 'PATCH')
    assert.equal(denied.status, 401)
    assert.equal(CommunityPostModel.records[0].caption, 'A shared moment.')

    const changed = await sendForm(baseUrl, `/api/community/moderation/${POST_ONE}`, postForm({ caption: 'Reviewed by admin', image: false }), admin, 'PATCH')
    assert.equal(changed.status, 200)
    assert.equal((await changed.json()).data.caption, 'Reviewed by admin')
    const removed = await fetch(`${baseUrl}/api/community/moderation/${POST_ONE}`, { method: 'DELETE', headers: { Origin: ORIGIN, Cookie: admin.cookie, 'X-CSRF-Token': admin.csrf } })
    assert.equal(removed.status, 200)
    assert.equal(NotificationModel.records.length, 1)
    assert.equal(NotificationModel.records[0].type, 'community_post_removed')
    assert.equal(String(NotificationModel.records[0].recipient), owner.user.id)
  }, { adminEnv: ADMIN_ENV })
})

test('a failed old-image cleanup stays tracked after the replacement is saved', async () => {
  await withCommunityServer(async (baseUrl, { CommunityPostModel }) => {
    const owner = await register(baseUrl, 'reader_one')
    const created = await sendForm(baseUrl, '/api/community', postForm(), owner)
    assert.equal(created.status, 201)
    const replacement = await sendForm(baseUrl, `/api/community/${POST_ONE}`, postForm({ caption: 'New image and caption' }), owner, 'PATCH')
    const body = await replacement.json()
    assert.equal(replacement.status, 200)
    assert.equal(body.cleanupPending, true)
    assert.equal(CommunityPostModel.records[0].image.publicId, 'community/test-2')
    assert.deepEqual(CommunityPostModel.records[0].pendingImageCleanupIds, ['community/test-1'])
  }, { removeImpl: async () => { throw new Error('provider unavailable') } })
})

test('likes are authenticated, idempotent, and notify only the post owner once', async () => {
  await withCommunityServer(async (baseUrl, { CommunityPostModel, CommunityLikeModel, NotificationModel }) => {
    const owner = await register(baseUrl, 'reader_one')
    const other = await register(baseUrl, 'reader_two')
    const created = await sendForm(baseUrl, '/api/community', postForm(), owner)
    assert.equal(created.status, 201)

    const guest = await fetch(`${baseUrl}/api/community/${POST_ONE}/likes`, { method: 'POST', headers: { Origin: ORIGIN } })
    assert.equal(guest.status, 401)
    const status = await fetch(`${baseUrl}/api/community/${POST_ONE}/likes/status`, { headers: { Cookie: other.cookie } })
    assert.equal(status.status, 200)
    assert.equal((await status.json()).data.liked, false)

    const firstLike = await fetch(`${baseUrl}/api/community/${POST_ONE}/likes`, { method: 'POST', headers: { Origin: ORIGIN, Cookie: other.cookie, 'X-CSRF-Token': other.csrf } })
    const duplicateLike = await fetch(`${baseUrl}/api/community/${POST_ONE}/likes`, { method: 'POST', headers: { Origin: ORIGIN, Cookie: other.cookie, 'X-CSRF-Token': other.csrf } })
    assert.equal(firstLike.status, 201)
    assert.equal(duplicateLike.status, 200)
    assert.equal(CommunityLikeModel.records.length, 1)
    assert.equal(CommunityPostModel.records[0].likesCount, 1)
    assert.equal(NotificationModel.records.length, 1)
    assert.equal(NotificationModel.records[0].type, 'community_like')
    assert.equal(String(NotificationModel.records[0].recipient), owner.user.id)

    const selfLike = await fetch(`${baseUrl}/api/community/${POST_ONE}/likes`, { method: 'POST', headers: { Origin: ORIGIN, Cookie: owner.cookie, 'X-CSRF-Token': owner.csrf } })
    assert.equal(selfLike.status, 201)
    assert.equal(NotificationModel.records.length, 1)
    const selfUnlike = await fetch(`${baseUrl}/api/community/${POST_ONE}/likes`, { method: 'DELETE', headers: { Origin: ORIGIN, Cookie: owner.cookie, 'X-CSRF-Token': owner.csrf } })
    assert.equal(selfUnlike.status, 200)

    const unliked = await fetch(`${baseUrl}/api/community/${POST_ONE}/likes`, { method: 'DELETE', headers: { Origin: ORIGIN, Cookie: other.cookie, 'X-CSRF-Token': other.csrf } })
    assert.equal(unliked.status, 200)
    assert.equal(CommunityLikeModel.records.length, 0)
    assert.equal(CommunityPostModel.records[0].likesCount, 0)
  })
})

test('comments are public to read, authenticated to write, and removable only by their author or an administrator', async () => {
  await withCommunityServer(async (baseUrl, { CommunityPostModel, CommunityCommentModel, NotificationModel }) => {
    const owner = await register(baseUrl, 'reader_one')
    const other = await register(baseUrl, 'reader_two')
    const post = await sendForm(baseUrl, '/api/community', postForm(), owner)
    assert.equal(post.status, 201)

    const guestWrite = await fetch(`${baseUrl}/api/community/${POST_ONE}/comments`, {
      method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ content: 'Guest comment' }),
    })
    assert.equal(guestWrite.status, 401)

    const created = await fetch(`${baseUrl}/api/community/${POST_ONE}/comments`, {
      method: 'POST', headers: { Origin: ORIGIN, Cookie: owner.cookie, 'X-CSRF-Token': owner.csrf, 'Content-Type': 'application/json' }, body: JSON.stringify({ content: '  A thoughtful note.  ' }),
    })
    assert.equal(created.status, 201)
    assert.equal((await created.json()).data.content, 'A thoughtful note.')
    assert.equal(CommunityPostModel.records[0].commentsCount, 1)
    assert.equal(NotificationModel.records.length, 0)

    const listing = await fetch(`${baseUrl}/api/community/${POST_ONE}/comments`)
    assert.equal(listing.status, 200)
    assert.equal((await listing.json()).data.length, 1)
    const denied = await fetch(`${baseUrl}/api/community/${POST_ONE}/comments/${COMMENT_ONE}`, {
      method: 'DELETE', headers: { Origin: ORIGIN, Cookie: other.cookie, 'X-CSRF-Token': other.csrf },
    })
    assert.equal(denied.status, 404)
    assert.equal(CommunityCommentModel.records[0].status, 'published')

    const removed = await fetch(`${baseUrl}/api/community/${POST_ONE}/comments/${COMMENT_ONE}`, {
      method: 'DELETE', headers: { Origin: ORIGIN, Cookie: owner.cookie, 'X-CSRF-Token': owner.csrf },
    })
    assert.equal(removed.status, 200)
    assert.equal(CommunityCommentModel.records[0].status, 'removed')
    assert.equal(CommunityPostModel.records[0].commentsCount, 0)
    const afterRemoval = await fetch(`${baseUrl}/api/community/${POST_ONE}/comments`)
    assert.equal((await afterRemoval.json()).data.length, 0)

    const anotherComment = await fetch(`${baseUrl}/api/community/${POST_ONE}/comments`, {
      method: 'POST', headers: { Origin: ORIGIN, Cookie: owner.cookie, 'X-CSRF-Token': owner.csrf, 'Content-Type': 'application/json' }, body: JSON.stringify({ content: 'A second note.' }),
    })
    assert.equal(anotherComment.status, 201)
    const admin = await loginAdmin(baseUrl)
    const moderated = await fetch(`${baseUrl}/api/community/moderation/${POST_ONE}/comments/65fabc1234567890abcdef32`, {
      method: 'DELETE', headers: { Origin: ORIGIN, Cookie: admin.cookie, 'X-CSRF-Token': admin.csrf },
    })
    assert.equal(moderated.status, 200)
    assert.equal(CommunityCommentModel.records[1].status, 'removed')
    assert.equal(CommunityPostModel.records[0].commentsCount, 0)

    const anotherUsersComment = await fetch(`${baseUrl}/api/community/${POST_ONE}/comments`, {
      method: 'POST', headers: { Origin: ORIGIN, Cookie: other.cookie, 'X-CSRF-Token': other.csrf, 'Content-Type': 'application/json' }, body: JSON.stringify({ content: 'A note on the post owner’s story.' }),
    })
    assert.equal(anotherUsersComment.status, 201)
    assert.equal(NotificationModel.records.length, 1)
    assert.equal(NotificationModel.records[0].type, 'community_comment')
    assert.equal(String(NotificationModel.records[0].recipient), owner.user.id)
    const ownerModeration = await fetch(`${baseUrl}/api/community/${POST_ONE}/comments/65fabc1234567890abcdef33`, {
      method: 'DELETE', headers: { Origin: ORIGIN, Cookie: owner.cookie, 'X-CSRF-Token': owner.csrf },
    })
    assert.equal(ownerModeration.status, 200)
    assert.equal(CommunityCommentModel.records[2].status, 'removed')
    assert.equal(CommunityPostModel.records[0].commentsCount, 0)
  }, { adminEnv: ADMIN_ENV })
})

test('notification APIs require a user session and scope listing, reads, and deletes to its owner', async () => {
  await withCommunityServer(async (baseUrl, { NotificationModel }) => {
    const owner = await register(baseUrl, 'notify_owner')
    const other = await register(baseUrl, 'notify_other')
    const unauthenticated = await fetch(`${baseUrl}/api/users/me/notifications/unread-count`)
    assert.equal(unauthenticated.status, 401)
    const item = await NotificationModel.create({ recipient: owner.user.id, type: 'community_like', message: 'A member liked your post.', targetType: 'community-post', targetId: POST_ONE, link: `/community/posts/${POST_ONE}` })
    const ownCount = await fetch(`${baseUrl}/api/users/me/notifications/unread-count`, { headers: { Cookie: owner.cookie } })
    assert.equal((await ownCount.json()).data.unreadCount, 1)
    const otherCount = await fetch(`${baseUrl}/api/users/me/notifications/unread-count`, { headers: { Cookie: other.cookie } })
    assert.equal((await otherCount.json()).data.unreadCount, 0)
    const listing = await fetch(`${baseUrl}/api/users/me/notifications?filter=unread`, { headers: { Cookie: owner.cookie } })
    assert.equal((await listing.json()).data[0].message, 'A member liked your post.')
    const deniedRead = await fetch(`${baseUrl}/api/users/me/notifications/${item._id}/read`, { method: 'PATCH', headers: { Origin: ORIGIN, Cookie: other.cookie, 'X-CSRF-Token': other.csrf, 'Content-Type': 'application/json' }, body: '{}' })
    assert.equal(deniedRead.status, 404)
    const read = await fetch(`${baseUrl}/api/users/me/notifications/${item._id}/read`, { method: 'PATCH', headers: { Origin: ORIGIN, Cookie: owner.cookie, 'X-CSRF-Token': owner.csrf, 'Content-Type': 'application/json' }, body: '{}' })
    assert.equal(read.status, 200)
    const updatedCount = await fetch(`${baseUrl}/api/users/me/notifications/unread-count`, { headers: { Cookie: owner.cookie } })
    assert.equal((await updatedCount.json()).data.unreadCount, 0)
  })
})

test('public member profiles return only public profile fields and published posts', async () => {
  await withCommunityServer(async (baseUrl, { UserModel, CommunityPostModel }) => {
    const owner = await register(baseUrl, 'profile_reader')
    const created = await sendForm(baseUrl, '/api/community', postForm(), owner)
    assert.equal(created.status, 201)
    CommunityPostModel.records.push({ ...structuredClone(CommunityPostModel.records[0]), _id: '65fabc1234567890abcdef22', status: 'pending_review', caption: 'Not public' })
    const response = await fetch(`${baseUrl}/api/users/public/profile_reader`)
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.data.user.username, 'profile_reader')
    assert.equal('passwordHash' in body.data.user, false)
    assert.equal(body.data.posts.length, 1)
    assert.equal(body.data.posts[0].caption, 'A shared moment.')
    assert.equal(body.data.totalPosts, 1)
    const missing = await fetch(`${baseUrl}/api/users/public/not_a_member`)
    assert.equal(missing.status, 404)
  })
})
