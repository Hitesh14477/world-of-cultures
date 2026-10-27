import mongoose from 'mongoose'

const MAX_PAGE = 100000
const MAX_LIMIT = 50

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode })
}

function parsePage(query) {
  const page = query.page === undefined ? 1 : Number(query.page)
  const limit = query.limit === undefined ? 20 : Number(query.limit)
  if ((query.page !== undefined && (typeof query.page !== 'string' || !/^\d+$/.test(query.page)))
    || (query.limit !== undefined && (typeof query.limit !== 'string' || !/^\d+$/.test(query.limit)))
    || !Number.isSafeInteger(page) || page < 1 || page > MAX_PAGE
    || !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw httpError(400, 'Page or limit is outside the allowed range.')
  }
  return { page, limit }
}

function serialize(row) {
  return {
    id: String(row._id),
    type: row.type,
    message: row.message,
    targetType: row.targetType,
    targetId: String(row.targetId),
    link: row.link,
    isRead: row.isRead,
    createdAt: row.createdAt,
    actor: row.actor ? { id: String(row.actor._id), username: row.actor.username || 'Community member', avatarUrl: row.actor.avatarUrl || '' } : null,
  }
}

export function createNotificationController({ NotificationModel }) {
  return {
    async list(req, res, next) {
      try {
        const unknown = Object.keys(req.query).find((key) => !['page', 'limit', 'filter'].includes(key))
        if (unknown) throw httpError(400, 'Unsupported notification query parameter.')
        const { page, limit } = parsePage(req.query)
        const filter = { recipient: req.user.id }
        if (req.query.filter !== undefined) {
          if (!['all', 'unread'].includes(req.query.filter)) throw httpError(400, 'Filter must be all or unread.')
          if (req.query.filter === 'unread') filter.isRead = false
        }
        const [rows, total, unreadCount] = await Promise.all([
          NotificationModel.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit)
            .populate({ path: 'actor', select: '_id username avatarUrl' }).lean(),
          NotificationModel.countDocuments(filter),
          NotificationModel.countDocuments({ recipient: req.user.id, isRead: false }),
        ])
        return res.json({ success: true, data: rows.map(serialize), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }, unreadCount })
      } catch (error) { return next(error) }
    },

    async unreadCount(req, res, next) {
      try {
        const count = await NotificationModel.countDocuments({ recipient: req.user.id, isRead: false })
        return res.json({ success: true, data: { unreadCount: count } })
      } catch (error) { return next(error) }
    },

    async markRead(req, res, next) {
      try {
        if (!mongoose.isValidObjectId(req.params.id)) throw httpError(404, 'Notification not found.')
        const notification = await NotificationModel.findOneAndUpdate({ _id: req.params.id, recipient: req.user.id }, { $set: { isRead: true } }, { new: true })
        if (!notification) throw httpError(404, 'Notification not found.')
        return res.json({ success: true, data: { id: String(notification._id), isRead: true } })
      } catch (error) { return next(error) }
    },

    async markAllRead(req, res, next) {
      try {
        await NotificationModel.updateMany({ recipient: req.user.id, isRead: false }, { $set: { isRead: true } })
        return res.json({ success: true, data: { unreadCount: 0 } })
      } catch (error) { return next(error) }
    },

    async remove(req, res, next) {
      try {
        if (!mongoose.isValidObjectId(req.params.id)) throw httpError(404, 'Notification not found.')
        const result = await NotificationModel.deleteOne({ _id: req.params.id, recipient: req.user.id })
        if (!result.deletedCount) throw httpError(404, 'Notification not found.')
        return res.json({ success: true, message: 'Notification deleted.' })
      } catch (error) { return next(error) }
    },
  }
}
