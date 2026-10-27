import mongoose from 'mongoose'
import { createNotificationSafely } from '../services/notifications.js'

const MAX_PENDING_RECORDS = 200
const MAX_REJECTION_REASON = 1000
const MAX_USER_PAGE_SIZE = 50
const MODELS = {
  'cultural-entries': 'CulturalEntry',
  places: 'Place',
}

function clientError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function modelFor(type, models) {
  const key = MODELS[type]
  if (!key) throw clientError(400, 'Submission type must be cultural-entries or places.')
  return models[key]
}

function queryWithCountry(query) {
  return query.select('-__v').populate('country', 'name slug flagEmoji')
}

function hasUsableStoredImage(image) {
  return Boolean(image?.url && /^https:\/\//i.test(image.url) && image?.publicId && image.rightsConfirmed === true && image.rightsConfirmedAt)
}

function parseUserListQuery(query) {
  const unknown = Object.keys(query).find((key) => !['search', 'page', 'limit'].includes(key))
  if (unknown) throw clientError(400, `Unsupported query parameter: ${unknown}.`)
  const parsePositive = (value, fallback, field, maximum = Number.MAX_SAFE_INTEGER) => {
    if (value === undefined) return fallback
    if (typeof value !== 'string' || !/^\d+$/.test(value)) throw clientError(400, `${field} must be a whole number.`)
    const number = Number(value)
    if (!Number.isSafeInteger(number) || number < 1 || number > maximum) throw clientError(400, `${field} is outside the allowed range.`)
    return number
  }
  const page = parsePositive(query.page, 1, 'Page')
  const limit = parsePositive(query.limit, 20, 'Limit', MAX_USER_PAGE_SIZE)
  const rawSearch = query.search === undefined ? '' : query.search
  if (typeof rawSearch !== 'string' || rawSearch.length > 24) throw clientError(400, 'Username search must be 24 characters or fewer.')
  return { page, limit, search: rawSearch.trim() }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function createAdminController({ CountryModel, CulturalEntryModel, PlaceModel, UserModel, NotificationModel }) {
  const models = { CulturalEntry: CulturalEntryModel, Place: PlaceModel }

  return {
    async getOverview(_req, res, next) {
      try {
        const [totalUsers, totalCountries, publishedEntries, pendingCulturalEntries, pendingPlaces] = await Promise.all([
          UserModel.countDocuments({}),
          CountryModel.countDocuments({}),
          CulturalEntryModel.countDocuments({ reviewStatus: 'published' }),
          CulturalEntryModel.countDocuments({ reviewStatus: 'pending_review' }),
          PlaceModel.countDocuments({ reviewStatus: 'pending_review' }),
        ])
        return res.json({
          success: true,
          data: { statistics: { totalUsers, totalCountries, publishedEntries, pendingCulturalEntries, pendingPlaces } },
        })
      } catch (error) {
        return next(error)
      }
    },

    async listUsers(req, res, next) {
      try {
        const { page, limit, search } = parseUserListQuery(req.query)
        const filter = search ? { username: new RegExp(escapeRegex(search.toLowerCase()), 'i') } : {}
        const [users, total] = await Promise.all([
          UserModel.find(filter).select('username displayName email createdAt').sort({ username: 1, _id: 1 })
            .skip((page - 1) * limit).limit(limit).lean(),
          UserModel.countDocuments(filter),
        ])
        return res.json({
          success: true,
          data: users.map((user) => ({ id: String(user._id), username: user.username || '', displayName: user.displayName || '', email: user.email, createdAt: user.createdAt || null })),
          pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        })
      } catch (error) {
        return next(error)
      }
    },

    async listPending(req, res, next) {
      try {
        const [entries, places] = await Promise.all([
          queryWithCountry(CulturalEntryModel.find({ reviewStatus: 'pending_review' }))
            .sort({ createdAt: 1 }).limit(MAX_PENDING_RECORDS).lean(),
          queryWithCountry(PlaceModel.find({ reviewStatus: 'pending_review' }))
            .sort({ createdAt: 1 }).limit(MAX_PENDING_RECORDS).lean(),
        ])
        return res.json({
          success: true,
          data: {
            culturalEntries: entries.map((record) => ({ type: 'cultural-entries', record })),
            places: places.map((record) => ({ type: 'places', record })),
          },
        })
      } catch (error) {
        return next(error)
      }
    },

    async getSubmission(req, res, next) {
      try {
        const Model = modelFor(req.params.type, models)
        if (!mongoose.isValidObjectId(req.params.id)) throw clientError(400, 'Submission identifier is invalid.')
        const record = await queryWithCountry(Model.findOne({ _id: req.params.id, reviewStatus: 'pending_review' })).lean()
        if (!record) throw clientError(404, 'Pending submission not found.')
        return res.json({ success: true, data: { type: req.params.type, record } })
      } catch (error) {
        return next(error)
      }
    },

    async approveSubmission(req, res, next) {
      try {
        const Model = modelFor(req.params.type, models)
        if (!mongoose.isValidObjectId(req.params.id)) throw clientError(400, 'Submission identifier is invalid.')
        if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length) {
          throw clientError(400, 'Approval requests cannot include content changes.')
        }
        const pending = await Model.findOne({ _id: req.params.id, reviewStatus: 'pending_review' }).select('image').lean()
        if (!pending) throw clientError(404, 'Pending submission not found.')
        if (!hasUsableStoredImage(pending.image)) {
          throw clientError(409, 'This submission needs a valid image before it can be published. Please request remediation.')
        }
        const record = await queryWithCountry(Model.findOneAndUpdate(
          {
            _id: req.params.id,
            reviewStatus: 'pending_review',
            'image.url': { $type: 'string' },
            'image.publicId': { $type: 'string' },
            'image.rightsConfirmed': true,
            'image.rightsConfirmedAt': { $exists: true },
          },
          { $set: { reviewStatus: 'published' } },
          { new: true, runValidators: true },
        )).lean()
        if (!record) throw clientError(409, 'This submission changed during review. Reload it before deciding.')
        if (record.submittedBy) {
          const category = String(record.category || 'cultural').replaceAll('_', ' ')
          const countryName = record.country?.name || 'your country'
          const link = record.country?.slug
            ? `/countries/${encodeURIComponent(record.country.slug)}#culture-${encodeURIComponent(record.category || '')}`
            : '/profile'
          await createNotificationSafely(NotificationModel, {
            recipient: record.submittedBy,
            type: 'contribution_approved',
            message: `Your contribution to ${countryName}’s ${category} section was approved.`,
            targetType: req.params.type === 'places' ? 'place' : 'cultural-entry',
            targetId: record._id,
            link,
          }, 'contribution_approved')
        }
        return res.json({ success: true, message: 'Submission approved and published.', data: { type: req.params.type, record } })
      } catch (error) {
        return next(error)
      }
    },

    async rejectSubmission(req, res, next) {
      try {
        const Model = modelFor(req.params.type, models)
        if (!mongoose.isValidObjectId(req.params.id)) throw clientError(400, 'Submission identifier is invalid.')
        const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : null
        if (!body || Object.keys(body).some((key) => key !== 'reason')) {
          throw clientError(400, 'Only an optional rejection reason may be submitted.')
        }
        if (body.reason !== undefined && (typeof body.reason !== 'string' || body.reason.trim().length > MAX_REJECTION_REASON)) {
          throw clientError(400, `Rejection reason must be text with at most ${MAX_REJECTION_REASON} characters.`)
        }
        const update = { $set: { reviewStatus: 'rejected' } }
        if (typeof body.reason === 'string' && body.reason.trim()) update.$set.rejectionReason = body.reason.trim()
        const record = await queryWithCountry(Model.findOneAndUpdate(
          { _id: req.params.id, reviewStatus: 'pending_review' },
          update,
          { new: true, runValidators: true },
        )).lean()
        if (!record) throw clientError(404, 'Pending submission not found.')
        if (record.submittedBy) {
          const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
          const message = reason
            ? `Your contribution was not approved. Review note: ${reason.slice(0, 350)}`
            : 'Your contribution was not approved. You can review it in My Contributions.'
          await createNotificationSafely(NotificationModel, {
            recipient: record.submittedBy,
            type: 'contribution_rejected',
            message,
            targetType: req.params.type === 'places' ? 'place' : 'cultural-entry',
            targetId: record._id,
            link: '/profile#My%20Contributions',
          }, 'contribution_rejected')
        }
        return res.json({ success: true, message: 'Submission rejected.', data: { type: req.params.type, record } })
      } catch (error) {
        return next(error)
      }
    },
  }
}
