import mongoose from 'mongoose'
import { fileTypeFromBuffer } from 'file-type'
import { communityImageStorage } from '../services/communityImageStorage.js'

const DEFAULT_LIMIT = 12
const MAX_LIMIT = 30
const MAX_PAGE = 100000
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const ALLOWED_FORM_FIELDS = new Set(['caption', 'countrySlug'])

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode })
}

function boundedInteger(value, fallback, name, maximum) {
  if (value === undefined) return fallback
  if (Array.isArray(value) || typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw httpError(400, `Query parameter "${name}" must be a whole number.`)
  }
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) {
    throw httpError(400, `Query parameter "${name}" must be between 1 and ${maximum}.`)
  }
  return number
}

function validateFormFields(body, { requireImage = false, requireCaption = false, requireCountry = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw httpError(400, 'Provide a valid post form.')
  const unknown = Object.keys(body).find((field) => !ALLOWED_FORM_FIELDS.has(field))
  if (unknown) throw httpError(400, 'The post contains an unsupported field.')

  const fields = {}
  if (requireCaption || body.caption !== undefined) {
    if (typeof body.caption !== 'string') throw httpError(400, 'Caption is required.')
    const caption = body.caption.trim()
    if (!caption) throw httpError(400, 'Caption is required.')
    if (caption.length > 1000) throw httpError(400, 'Caption must be 1,000 characters or fewer.')
    fields.caption = caption
  }
  if (requireCountry || body.countrySlug !== undefined) {
    if (typeof body.countrySlug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(body.countrySlug.trim())) {
      throw httpError(400, 'Choose a valid country.')
    }
    fields.countrySlug = body.countrySlug.trim().toLowerCase()
  }
  if (requireImage) fields.requireImage = true
  return fields
}

async function validatedImage(file) {
  if (!file) throw httpError(400, 'Choose a JPEG, PNG, or WebP image.')
  if (!Buffer.isBuffer(file.buffer) || file.buffer.length === 0 || file.buffer.length > MAX_IMAGE_BYTES) {
    throw httpError(413, 'Images must be 5 MB or smaller.')
  }
  const detected = await fileTypeFromBuffer(file.buffer)
  if (!detected || !ALLOWED_IMAGE_TYPES.has(detected.mime)) {
    throw httpError(415, 'Use a valid JPEG, PNG, or WebP image.')
  }
  return file.buffer
}

function serializePost(post) {
  const author = post.author && typeof post.author === 'object'
    ? { id: String(post.author._id || post.author.id), username: post.author.username || 'Community member' }
    : { id: String(post.author), username: 'Community member' }
  const country = post.country && typeof post.country === 'object'
    ? {
      id: String(post.country._id || post.country.id),
      name: post.country.name,
      slug: post.country.slug,
      flagEmoji: post.country.flagEmoji || '',
    }
    : null
  return {
    id: String(post._id || post.id),
    author,
    country,
    image: { url: post.image?.url || '' },
    caption: post.caption,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  }
}

function populatePublicFields(query) {
  return query
    .populate({ path: 'author', select: '_id username' })
    .populate({ path: 'country', select: '_id name slug flagEmoji' })
}

export function createCommunityController({
  CommunityPostModel,
  CountryModel,
  imageStorage = communityImageStorage,
  now = () => Date.now(),
  createLimit = 5,
  createWindowMs = 10 * 60 * 1000,
} = {}) {
  const createAttempts = new Map()

  function rateLimitCreation(req, res, next) {
    const userId = String(req.user.id)
    const timestamp = now()
    for (const [key, record] of createAttempts) {
      if (timestamp - record.startedAt >= createWindowMs) createAttempts.delete(key)
    }
    const current = createAttempts.get(userId)
    if (!current || timestamp - current.startedAt >= createWindowMs) {
      createAttempts.set(userId, { startedAt: timestamp, count: 1 })
      return next()
    }
    if (current.count >= createLimit) return res.status(429).json({ success: false, message: 'You have created several posts recently. Please try again later.' })
    current.count += 1
    return next()
  }

  async function findCountry(countrySlug) {
    const country = await CountryModel.findOne({ slug: countrySlug }).select('_id').lean()
    if (!country) throw httpError(400, 'The selected country could not be found.')
    return country
  }

  async function upload(file) {
    const buffer = await validatedImage(file)
    return imageStorage.upload(buffer)
  }

  return {
    rateLimitCreation,

    async list(req, res, next) {
      try {
        const unknownQuery = Object.keys(req.query).find((key) => !['country', 'page', 'limit'].includes(key))
        if (unknownQuery) throw httpError(400, `Unsupported query parameter: ${unknownQuery}.`)
        const page = boundedInteger(req.query.page, 1, 'page', MAX_PAGE)
        const limit = boundedInteger(req.query.limit, DEFAULT_LIMIT, 'limit', MAX_LIMIT)
        const filter = { status: 'published' }
        if (req.query.country !== undefined) {
          if (typeof req.query.country !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(req.query.country)) throw httpError(400, 'Country filter is invalid.')
          const country = await findCountry(req.query.country.toLowerCase())
          filter.country = country._id
        }

        const [rows, total] = await Promise.all([
          populatePublicFields(CommunityPostModel.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean()),
          CommunityPostModel.countDocuments(filter),
        ])
        return res.json({
          success: true,
          data: rows.map(serializePost),
          pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        })
      } catch (error) { return next(error) }
    },

    async getById(req, res, next) {
      try {
        if (!mongoose.isValidObjectId(req.params.id)) throw httpError(404, 'Community post not found.')
        const post = await populatePublicFields(CommunityPostModel.findOne({ _id: req.params.id, status: 'published' }).lean())
        if (!post) return res.status(404).json({ success: false, message: 'Community post not found.' })
        return res.json({ success: true, data: serializePost(post) })
      } catch (error) { return next(error) }
    },

    async create(req, res, next) {
      let uploadedImage
      let persisted = false
      try {
        const fields = validateFormFields(req.body, { requireCaption: true, requireCountry: true, requireImage: true })
        const country = await findCountry(fields.countrySlug)
        uploadedImage = await upload(req.file)
        const post = await CommunityPostModel.create({
          author: req.user.id,
          country: country._id,
          image: uploadedImage,
          caption: fields.caption,
          status: 'published',
        })
        persisted = true
        const populated = await populatePublicFields(CommunityPostModel.findById(post._id).lean())
        return res.status(201).json({ success: true, data: serializePost(populated) })
      } catch (error) {
        if (uploadedImage?.publicId && !persisted) {
          try { await imageStorage.remove(uploadedImage.publicId) } catch { /* preserve the original failure; cleanup can be retried operationally */ }
        }
        return next(error)
      }
    },

    async update(req, res, next) {
      let replacementImage
      try {
        if (!mongoose.isValidObjectId(req.params.id)) throw httpError(404, 'Community post not found.')
        const fields = validateFormFields(req.body)
        if (!fields.caption && !fields.countrySlug && !req.file) throw httpError(400, 'Provide a caption, country, or replacement image to update.')

        const existing = await CommunityPostModel.findOne({ _id: req.params.id, author: req.user.id, status: 'published' }).lean()
        if (!existing) return res.status(404).json({ success: false, message: 'Your post could not be found.' })
        const update = {}
        if (fields.caption) update.caption = fields.caption
        if (fields.countrySlug) update.country = (await findCountry(fields.countrySlug))._id
        if (req.file) {
          replacementImage = await upload(req.file)
          update.image = replacementImage
        }

        let updated
        const updateOperation = { $set: update }
        if (replacementImage && existing.image?.publicId) {
          updateOperation.$addToSet = { pendingImageCleanupIds: existing.image.publicId }
        }
        try {
          updated = await CommunityPostModel.findOneAndUpdate(
            { _id: req.params.id, author: req.user.id, status: 'published' },
            updateOperation,
            { new: true, runValidators: true },
          )
        } catch (error) {
          if (replacementImage?.publicId) {
            try { await imageStorage.remove(replacementImage.publicId) } catch { /* do not obscure database failure */ }
          }
          throw error
        }
        if (!updated) {
          if (replacementImage?.publicId) {
            try { await imageStorage.remove(replacementImage.publicId) } catch { /* do not obscure ownership result */ }
          }
          return res.status(404).json({ success: false, message: 'Your post could not be found.' })
        }

        let cleanupPending = false
        if (replacementImage && existing.image?.publicId) {
          try {
            await imageStorage.remove(existing.image.publicId)
            const cleanupRecord = await CommunityPostModel.updateOne(
              { _id: updated._id, author: req.user.id },
              { $pull: { pendingImageCleanupIds: existing.image.publicId } },
            )
            if (!cleanupRecord?.modifiedCount) cleanupPending = true
          } catch { cleanupPending = true }
        }
        const populated = await populatePublicFields(CommunityPostModel.findById(updated._id).lean())
        return res.json({ success: true, data: serializePost(populated), cleanupPending })
      } catch (error) { return next(error) }
    },

    async remove(req, res, next) {
      try {
        if (!mongoose.isValidObjectId(req.params.id)) throw httpError(404, 'Community post not found.')
        const post = await CommunityPostModel.findOne({ _id: req.params.id, author: req.user.id, status: 'published' }).lean()
        if (!post) return res.status(404).json({ success: false, message: 'Your post could not be found.' })
        const result = await CommunityPostModel.updateOne({ _id: post._id, author: req.user.id, status: 'published' }, { $set: { status: 'removed' } })
        if (!result?.modifiedCount) return res.status(404).json({ success: false, message: 'Your post could not be found.' })
        try {
          await imageStorage.remove(post.image.publicId)
          return res.json({ success: true, message: 'Your post was removed.' })
        } catch {
          return res.json({ success: true, message: 'Your post is hidden, but its image could not be removed. Please contact support.' })
        }
      } catch (error) { return next(error) }
    },
  }
}

export { MAX_IMAGE_BYTES, validateFormFields }
