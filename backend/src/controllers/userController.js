import mongoose from 'mongoose'
import { FAVOURITE_TYPES } from '../models/UserFavourite.js'

const COUNTRY_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i

function clientError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function publicCountry(country) {
  if (!country) return null
  return {
    name: country.name,
    slug: country.slug,
    flagEmoji: country.flagEmoji,
    flagImageUrl: country.flagImageUrl,
  }
}

function shortText(value, max = 240) {
  if (typeof value !== 'string') return ''
  const clean = value.trim().replace(/\s+/g, ' ')
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`
}

export function createUserController({ CountryModel, CulturalEntryModel, PlaceModel, UserFavouriteModel, UserModel, CommunityPostModel }) {
  const targets = {
    'cultural-entry': { Model: CulturalEntryModel, publicFilter: { reviewStatus: 'published' } },
    place: { Model: PlaceModel, publicFilter: { reviewStatus: 'published' } },
  }

  async function resolveTarget(type, id) {
    if (!FAVOURITE_TYPES.includes(type)) throw clientError(400, 'Favourite type must be country, cultural-entry, or place.')
    if (type === 'country') {
      if (typeof id !== 'string' || !COUNTRY_SLUG.test(id)) throw clientError(400, 'Country must be a valid country slug.')
      const country = await CountryModel.findOne({ slug: id.toLowerCase() }).select('_id name slug').lean()
      if (!country) throw clientError(404, 'The item could not be found or is not available to save.')
      return { targetId: country._id, record: country }
    }
    if (!mongoose.isValidObjectId(id)) throw clientError(400, 'Favourite record identifier is invalid.')
    const { Model, publicFilter } = targets[type]
    const record = await Model.findOne({ _id: id, ...publicFilter }).select('_id').lean()
    if (!record) throw clientError(404, 'The item could not be found or is not available to save.')
    return { targetId: record._id, record }
  }

  async function readCollection(userId) {
    const favourites = await UserFavouriteModel.find({ user: userId })
      .select('targetType targetId createdAt')
      .sort({ createdAt: -1 })
      .lean()
    const groups = Object.fromEntries(FAVOURITE_TYPES.map((type) => [type, favourites.filter((favourite) => favourite.targetType === type)]))
    const countryIds = groups.country.map((item) => item.targetId)
    const entryIds = groups['cultural-entry'].map((item) => item.targetId)
    const placeIds = groups.place.map((item) => item.targetId)

    const [countries, entries, places] = await Promise.all([
      countryIds.length ? CountryModel.find({ _id: { $in: countryIds } })
        .select('name officialName slug flagEmoji flagImageUrl capital continent region')
        .lean() : [],
      entryIds.length ? CulturalEntryModel.find({ _id: { $in: entryIds }, reviewStatus: 'published' })
        .select('title summary content category country')
        .populate('country', 'name slug flagEmoji flagImageUrl')
        .lean() : [],
      placeIds.length ? PlaceModel.find({ _id: { $in: placeIds }, reviewStatus: 'published' })
        .select('name description category location region country')
        .populate('country', 'name slug flagEmoji flagImageUrl')
        .lean() : [],
    ])

    const savedAtById = (type) => new Map(groups[type].map((item) => [String(item.targetId), item.createdAt]))
    const countrySavedAt = savedAtById('country')
    const entrySavedAt = savedAtById('cultural-entry')
    const placeSavedAt = savedAtById('place')

    return {
      countries: countries.map((country) => ({
        id: country.slug,
        type: 'country',
        title: country.name,
        country: publicCountry(country),
        description: shortText([
          country.capital?.length ? `Capital: ${country.capital.join(', ')}` : '',
          country.region,
          country.continent,
        ].filter(Boolean).join(' · ')),
        savedAt: countrySavedAt.get(String(country._id)),
      })),
      culturalEntries: entries.map((entry) => ({
        id: String(entry._id),
        type: 'cultural-entry',
        title: entry.title,
        category: entry.category,
        country: publicCountry(entry.country),
        description: shortText(entry.summary || entry.content),
        savedAt: entrySavedAt.get(String(entry._id)),
      })),
      places: places.map((place) => ({
        id: String(place._id),
        type: 'place',
        title: place.name,
        category: place.category,
        country: publicCountry(place.country),
        description: shortText(place.description || [place.location, place.region].filter(Boolean).join(' · ')),
        savedAt: placeSavedAt.get(String(place._id)),
      })),
    }
  }

  function pageQuery(req) {
    const rawPage = req.query.page
    const rawLimit = req.query.limit
    if ((rawPage !== undefined && (typeof rawPage !== 'string' || !/^\d+$/.test(rawPage)))
      || (rawLimit !== undefined && (typeof rawLimit !== 'string' || !/^\d+$/.test(rawLimit)))) {
      throw clientError(400, 'Page and limit must be whole numbers.')
    }
    const page = rawPage === undefined ? 1 : Number(rawPage)
    const limit = rawLimit === undefined ? 12 : Number(rawLimit)
    if (!Number.isInteger(page) || page < 1 || page > 100000 || !Number.isInteger(limit) || limit < 1 || limit > 30) {
      throw clientError(400, 'Page must be 1–100000 and limit must be 1–30.')
    }
    return { page, limit }
  }

  function serializeOwnedContent(row, type) {
    const country = row.country && typeof row.country === 'object'
      ? { name: row.country.name, slug: row.country.slug, flagEmoji: row.country.flagEmoji || '' }
      : null
    return {
      id: String(row._id),
      type,
      title: row.title || row.name,
      category: row.category,
      country,
      reviewStatus: row.reviewStatus,
      createdAt: row.createdAt,
      url: country?.slug
        ? `/countries/${encodeURIComponent(country.slug)}/${type === 'place' ? `places/${encodeURIComponent(row._id)}` : `cultural-entries/${encodeURIComponent(row._id)}`}`
        : '/countries',
    }
  }

  return {
    async getProfile(req, res, next) {
      try {
        const userId = req.user.id
        const [user, favourites, entries, places, posts] = await Promise.all([
          UserModel.findById(userId).select('_id username displayName bio email createdAt').lean(),
          UserFavouriteModel.countDocuments({ user: userId }),
          CulturalEntryModel.countDocuments({ submittedBy: userId }),
          PlaceModel.countDocuments({ submittedBy: userId }),
          CommunityPostModel.countDocuments({ author: userId, status: { $ne: 'removed' } }),
        ])
        if (!user) throw clientError(401, 'Sign in to access this account.')
        return res.json({ success: true, data: {
          user: { id: String(user._id), username: user.username || '', displayName: user.displayName || '', bio: user.bio || '', email: user.email, createdAt: user.createdAt },
          counts: { favourites, contributions: entries + places, communityPosts: posts },
        } })
      } catch (error) { return next(error) }
    },

    async updateProfile(req, res, next) {
      try {
        const body = req.body
        const allowed = new Set(['username', 'displayName', 'bio'])
        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !allowed.has(key)) || !Object.keys(body).length) {
          throw clientError(400, 'Update only username, display name, or bio.')
        }
        const update = {}
        if (body.username !== undefined) {
          if (typeof body.username !== 'string' || !/^[a-z0-9_]{3,24}$/i.test(body.username.trim())) throw clientError(400, 'Username must be 3–24 letters, numbers, or underscores.')
          const username = body.username.trim().toLowerCase()
          const duplicate = await UserModel.findOne({ username, _id: { $ne: req.user.id } }).select('_id').lean()
          if (duplicate) throw clientError(409, 'That username is already taken.')
          update.username = username
        }
        for (const [field, maximum] of [['displayName', 60], ['bio', 240]]) {
          if (body[field] === undefined) continue
          if (typeof body[field] !== 'string' || body[field].trim().length > maximum) throw clientError(400, `${field === 'bio' ? 'Bio' : 'Display name'} must be ${maximum} characters or fewer.`)
          update[field] = body[field].trim()
        }
        const user = await UserModel.findByIdAndUpdate(req.user.id, { $set: update }, { new: true, runValidators: true })
          .select('_id username displayName bio email createdAt').lean()
        if (!user) throw clientError(401, 'Sign in to access this account.')
        return res.json({ success: true, data: { id: String(user._id), username: user.username || '', displayName: user.displayName || '', bio: user.bio || '', email: user.email, createdAt: user.createdAt } })
      } catch (error) {
        if (error?.code === 11000) return res.status(409).json({ success: false, message: 'That username is already taken.' })
        return next(error)
      }
    },

    async listMyContributions(req, res, next) {
      try {
        const { page, limit } = pageQuery(req)
        const filter = { submittedBy: req.user.id }
        const scanLimit = page * limit
        const [entries, places, entryCount, placeCount] = await Promise.all([
          CulturalEntryModel.find(filter).select('_id country category title reviewStatus createdAt').populate('country', 'name slug flagEmoji').sort({ createdAt: -1 }).limit(scanLimit).lean(),
          PlaceModel.find(filter).select('_id country category name reviewStatus createdAt').populate('country', 'name slug flagEmoji').sort({ createdAt: -1 }).limit(scanLimit).lean(),
          CulturalEntryModel.countDocuments(filter),
          PlaceModel.countDocuments(filter),
        ])
        const offset = (page - 1) * limit
        const items = [...entries.map((row) => serializeOwnedContent(row, 'cultural-entry')), ...places.map((row) => serializeOwnedContent(row, 'place'))]
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(offset, offset + limit)
        return res.json({ success: true, data: items, pagination: { page, limit, total: entryCount + placeCount, totalPages: Math.ceil((entryCount + placeCount) / limit) } })
      } catch (error) { return next(error) }
    },

    async listMyCommunityPosts(req, res, next) {
      try {
        const { page, limit } = pageQuery(req)
        const filter = { author: req.user.id, status: { $ne: 'removed' } }
        const [rows, total] = await Promise.all([
          CommunityPostModel.find(filter).select('_id country caption image status createdAt updatedAt').populate('country', 'name slug flagEmoji').sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
          CommunityPostModel.countDocuments(filter),
        ])
        return res.json({ success: true, data: rows.map((row) => ({ id: String(row._id), caption: row.caption, image: { url: row.image?.url || '' }, status: row.status, createdAt: row.createdAt, country: publicCountry(row.country), url: `/community#community-post-${encodeURIComponent(row._id)}` })), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
      } catch (error) { return next(error) }
    },

    async listFavourites(req, res, next) {
      try {
        const data = await readCollection(req.user.id)
        return res.json({ success: true, data })
      } catch (error) {
        return next(error)
      }
    },

    async addFavourite(req, res, next) {
      try {
        const body = req.body
        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !['type', 'id'].includes(key))) {
          throw clientError(400, 'Provide only a favourite type and record identifier.')
        }
        if (typeof body.type !== 'string' || typeof body.id !== 'string') {
          throw clientError(400, 'Provide a favourite type and record identifier.')
        }
        const target = await resolveTarget(body.type, body.id)
        try {
          const favourite = await UserFavouriteModel.create({
            user: req.user.id,
            targetType: body.type,
            targetId: target.targetId,
          })
          return res.status(201).json({ success: true, data: { type: body.type, id: body.type === 'country' ? target.record.slug : String(target.record._id), favouriteId: String(favourite._id) } })
        } catch (error) {
          if (error?.code !== 11000) throw error
          return res.json({ success: true, data: { type: body.type, id: body.type === 'country' ? target.record.slug : String(target.record._id), alreadySaved: true } })
        }
      } catch (error) {
        return next(error)
      }
    },

    async getFavouriteStatus(req, res, next) {
      try {
        const target = await resolveTarget(req.params.type, req.params.id)
        const favourite = await UserFavouriteModel.findOne({
          user: req.user.id,
          targetType: req.params.type,
          targetId: target.targetId,
        }).select('_id').lean()
        return res.json({ success: true, data: { isSaved: Boolean(favourite) } })
      } catch (error) {
        return next(error)
      }
    },

    async removeFavourite(req, res, next) {
      try {
        if (!FAVOURITE_TYPES.includes(req.params.type)) throw clientError(400, 'Favourite type must be country, cultural-entry, or place.')
        let targetId
        if (req.params.type === 'country') {
          if (!COUNTRY_SLUG.test(req.params.id)) throw clientError(400, 'Country must be a valid country slug.')
          const country = await CountryModel.findOne({ slug: req.params.id.toLowerCase() }).select('_id').lean()
          if (!country) throw clientError(404, 'Favourite not found.')
          targetId = country._id
        } else {
          if (!mongoose.isValidObjectId(req.params.id)) throw clientError(400, 'Favourite record identifier is invalid.')
          targetId = req.params.id
        }
        const favourite = await UserFavouriteModel.findOneAndDelete({
          user: req.user.id,
          targetType: req.params.type,
          targetId,
        }).select('_id').lean()
        if (!favourite) throw clientError(404, 'Favourite not found.')
        return res.json({ success: true, message: 'Removed from your collection.' })
      } catch (error) {
        return next(error)
      }
    },
  }
}
