import test from 'node:test'
import assert from 'node:assert/strict'
import { createNotificationController } from '../src/controllers/notificationController.js'

const OWNER = '65fabc1234567890abcdef01'
const OTHER = '65fabc1234567890abcdef02'
const NOTIFICATION = '65fabc1234567890abcdef41'

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } }
}

function mockModel() {
  const rows = [{ _id: NOTIFICATION, recipient: OWNER, actor: { _id: OTHER, username: 'reader_two', avatarUrl: '' }, type: 'community_like', message: 'reader_two liked your post.', targetType: 'community-post', targetId: '65fabc1234567890abcdef21', link: '/community/posts/65fabc1234567890abcdef21', isRead: false, createdAt: new Date() }]
  return {
    rows,
    countDocuments(filter) { return Promise.resolve(rows.filter((row) => String(row.recipient) === String(filter.recipient) && (filter.isRead === undefined || row.isRead === filter.isRead)).length) },
    find(filter) {
      let offset = 0; let limit = Infinity
      return { populate() { return this }, sort() { return this }, skip(value) { offset = value; return this }, limit(value) { limit = value; return this }, lean() { return Promise.resolve(rows.filter((row) => String(row.recipient) === String(filter.recipient) && (filter.isRead === undefined || row.isRead === filter.isRead)).slice(offset, offset + limit)) } }
    },
    async findOneAndUpdate(filter, update) { const row = rows.find((item) => String(item._id) === String(filter._id) && String(item.recipient) === String(filter.recipient)); if (row) Object.assign(row, update.$set); return row || null },
    async updateMany(filter, update) { rows.filter((row) => String(row.recipient) === String(filter.recipient) && row.isRead === filter.isRead).forEach((row) => Object.assign(row, update.$set)); return { modifiedCount: 1 } },
    async deleteOne(filter) { const index = rows.findIndex((row) => String(row._id) === String(filter._id) && String(row.recipient) === String(filter.recipient)); if (index < 0) return { deletedCount: 0 }; rows.splice(index, 1); return { deletedCount: 1 } },
  }
}

test('notification list and unread count are scoped to the authenticated recipient', async () => {
  const Model = mockModel()
  const controller = createNotificationController({ NotificationModel: Model })
  const listed = response()
  await controller.list({ user: { id: OWNER }, query: { page: '1', limit: '20', filter: 'unread' } }, listed, (error) => { throw error })
  assert.equal(listed.body.data.length, 1)
  assert.equal(listed.body.data[0].actor.username, 'reader_two')
  assert.equal(listed.body.unreadCount, 1)
  const count = response()
  await controller.unreadCount({ user: { id: OTHER } }, count, (error) => { throw error })
  assert.equal(count.body.data.unreadCount, 0)
})

test('notification reads, bulk reads, and deletes cannot affect another user’s records', async () => {
  const Model = mockModel()
  const controller = createNotificationController({ NotificationModel: Model })
  const denied = response()
  await controller.markRead({ user: { id: OTHER }, params: { id: NOTIFICATION } }, denied, (error) => { denied.status(error.statusCode).json({ message: error.message }) })
  assert.equal(denied.statusCode, 404)
  assert.equal(Model.rows[0].isRead, false)
  const read = response()
  await controller.markRead({ user: { id: OWNER }, params: { id: NOTIFICATION } }, read, (error) => { throw error })
  assert.equal(read.body.data.isRead, true)
  const bulk = response()
  await controller.markAllRead({ user: { id: OWNER } }, bulk, (error) => { throw error })
  assert.equal(bulk.body.data.unreadCount, 0)
  const deleteDenied = response()
  await controller.remove({ user: { id: OTHER }, params: { id: NOTIFICATION } }, deleteDenied, (error) => { deleteDenied.status(error.statusCode).json({ message: error.message }) })
  assert.equal(deleteDenied.statusCode, 404)
  assert.equal(Model.rows.length, 1)
})

test('notification filters and pagination are validated', async () => {
  const controller = createNotificationController({ NotificationModel: mockModel() })
  const result = response()
  await controller.list({ user: { id: OWNER }, query: { filter: 'secret' } }, result, (error) => { result.status(error.statusCode).json({ message: error.message }) })
  assert.equal(result.statusCode, 400)
})
