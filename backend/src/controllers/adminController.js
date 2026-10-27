import mongoose from 'mongoose'

const MAX_PENDING_RECORDS = 200
const MAX_REJECTION_REASON = 1000
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

export function createAdminController({ CountryModel, CulturalEntryModel, PlaceModel }) {
  const models = { CulturalEntry: CulturalEntryModel, Place: PlaceModel }

  return {
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
        return res.json({ success: true, message: 'Submission rejected.', data: { type: req.params.type, record } })
      } catch (error) {
        return next(error)
      }
    },
  }
}
