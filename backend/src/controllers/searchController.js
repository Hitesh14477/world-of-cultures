import Country, { CONTINENTS } from '../models/Country.js'
import CulturalEntry, { CULTURAL_ENTRY_CATEGORIES } from '../models/CulturalEntry.js'
import Place from '../models/Place.js'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50
const MAX_PAGE = 1000
const MAX_TEXT_LENGTH = 100
const TYPES = ['country', 'cultural-entry', 'place']
const ALLOWED_QUERY_KEYS = new Set(['q', 'type', 'country', 'continent', 'region', 'category', 'page', 'limit'])

function badRequest(message) {
  const error = new Error(message)
  error.statusCode = 400
  return error
}

function queryValue(value, name) {
  if (Array.isArray(value) || (value && typeof value === 'object')) {
    throw badRequest(`Query parameter "${name}" must be provided once.`)
  }
  return typeof value === 'string' ? value.trim() : ''
}

function integerValue(value, fallback, name, max) {
  if (value === undefined) return fallback
  const raw = queryValue(value, name)
  if (!/^\d+$/.test(raw)) throw badRequest(`Query parameter "${name}" must be a whole number.`)
  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) {
    throw badRequest(`Query parameter "${name}" must be between 1 and ${max}.`)
  }
  return parsed
}

export function parseSearchQuery(query) {
  const unknown = Object.keys(query).find((key) => !ALLOWED_QUERY_KEYS.has(key))
  if (unknown) throw badRequest(`Unsupported query parameter: ${unknown}.`)

  const q = query.q === undefined ? '' : queryValue(query.q, 'q')
  if (q.length > MAX_TEXT_LENGTH) throw badRequest(`Search text must be ${MAX_TEXT_LENGTH} characters or fewer.`)
  const type = query.type === undefined ? '' : queryValue(query.type, 'type')
  if (type && !TYPES.includes(type)) throw badRequest('Type must be country, cultural-entry, or place.')
  const country = query.country === undefined ? '' : queryValue(query.country, 'country')
  if (country && (country.length > 120 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(country))) {
    throw badRequest('Country must be a valid country slug.')
  }
  const continent = query.continent === undefined ? '' : queryValue(query.continent, 'continent')
  if (continent && !CONTINENTS.includes(continent)) throw badRequest(`Continent must be one of: ${CONTINENTS.join(', ')}.`)
  const region = query.region === undefined ? '' : queryValue(query.region, 'region')
  if (region.length > MAX_TEXT_LENGTH) throw badRequest(`Region must be ${MAX_TEXT_LENGTH} characters or fewer.`)
  const category = query.category === undefined ? '' : queryValue(query.category, 'category')
  if (category && !CULTURAL_ENTRY_CATEGORIES.includes(category)) {
    throw badRequest(`Category must be one of: ${CULTURAL_ENTRY_CATEGORIES.join(', ')}.`)
  }
  if (category && type && type !== 'cultural-entry') {
    throw badRequest('Category can only be used with cultural-entry results.')
  }

  return {
    q,
    type,
    country,
    continent,
    region,
    category,
    page: integerValue(query.page, 1, 'page', MAX_PAGE),
    limit: integerValue(query.limit, DEFAULT_LIMIT, 'limit', MAX_LIMIT),
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function combineFilters(...filters) {
  const clauses = filters.filter((filter) => filter && Object.keys(filter).length)
  if (clauses.length === 0) return {}
  if (clauses.length === 1) return clauses[0]
  return { $and: clauses }
}

function geographicCountryFilter({ country, continent, region }) {
  const filters = []
  if (country) filters.push({ slug: country.toLowerCase() })
  if (continent) filters.push({ continent })
  if (region) {
    const expression = new RegExp(escapeRegex(region), 'i')
    filters.push({ $or: [{ region: expression }, { subregion: expression }] })
  }
  return combineFilters(...filters)
}

function searchRegex(q) {
  return q ? new RegExp(escapeRegex(q), 'i') : null
}

function descriptionText(value, max = 240) {
  const text = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  if (text.length <= max) return text
  return `${text.slice(0, max - 1).trimEnd()}…`
}

function countrySummary(country) {
  const details = []
  if (Array.isArray(country.capital) && country.capital.length) details.push(`Capital: ${country.capital.join(', ')}`)
  const regions = [country.region, country.subregion].filter(Boolean).join(' · ')
  if (regions) details.push(regions)
  if (country.continent) details.push(country.continent)
  return details.join(' · ')
}

function countryPresentation(country) {
  if (!country || typeof country !== 'object') return null
  return {
    name: country.name,
    slug: country.slug,
    flagEmoji: country.flagEmoji,
    flagImageUrl: country.flagImageUrl,
  }
}

function imagePresentation(image) {
  if (!image?.url) return null
  return { url: image.url, caption: image.caption || '' }
}

function sortByTitle(left, right) {
  return left.title.localeCompare(right.title, undefined, { sensitivity: 'base' }) || left.id.localeCompare(right.id)
}

function pageWindow(startIndex, count, page, limit) {
  const pageStart = (page - 1) * limit
  const pageEnd = pageStart + limit
  const start = Math.max(pageStart, startIndex)
  const end = Math.min(pageEnd, startIndex + count)
  return end <= start ? null : { skip: start - startIndex, limit: end - start }
}

function resultQuery(Model, filter, projection, sort, window, populate = false) {
  let query = Model.find(filter).select(projection)
  if (populate) query = query.populate('country', 'name slug flagEmoji flagImageUrl')
  return query.sort(sort).skip(window.skip).limit(window.limit).lean()
}

export function createSearchController({ CountryModel = Country, CulturalEntryModel = CulturalEntry, PlaceModel = Place } = {}) {
  return async function search(req, res, next) {
    try {
      const params = parseSearchQuery(req.query)
      const hasFilters = Boolean(params.type || params.country || params.continent || params.region || params.category)
      if (!params.q && !hasFilters) {
        return res.json({ success: true, data: [], pagination: { page: params.page, limit: params.limit, total: 0, totalPages: 0 } })
      }

      const countryFilter = geographicCountryFilter(params)
      const hasGeographicFilter = Boolean(params.country || params.continent || params.region)
      const scopedCountries = hasGeographicFilter
        ? await CountryModel.find(countryFilter)
          .select('_id name officialName slug cca2 flagEmoji flagImageUrl continent region subregion capital')
          .lean()
        : []
      const countryIds = scopedCountries.map((country) => country._id)
      const contentScope = hasGeographicFilter
        ? (countryIds.length ? { country: { $in: countryIds } } : { country: { $in: [] } })
        : {}
      const regex = searchRegex(params.q)
      const countrySearch = regex ? { $or: [
        { name: regex }, { officialName: regex }, { capital: regex }, { region: regex }, { subregion: regex },
        { 'languages.name': regex }, { 'currencies.name': regex },
      ] } : {}
      const entrySearch = regex ? { $or: [{ title: regex }, { summary: regex }, { content: regex }] } : {}
      const placeSearch = regex ? { $or: [{ name: regex }, { description: regex }, { location: regex }, { region: regex }] } : {}
      const countryQuery = combineFilters(countryFilter, countrySearch)
      const entryQuery = combineFilters({ reviewStatus: 'published' }, contentScope, params.category ? { category: params.category } : {}, entrySearch)
      const placeQuery = combineFilters({ reviewStatus: 'published' }, contentScope, placeSearch)

      const resultTypes = params.category ? ['cultural-entry'] : params.type ? [params.type] : TYPES
      const countsByType = {}
      if (resultTypes.includes('country')) countsByType.country = await CountryModel.countDocuments(countryQuery)
      if (resultTypes.includes('cultural-entry')) countsByType['cultural-entry'] = await CulturalEntryModel.countDocuments(entryQuery)
      if (resultTypes.includes('place')) countsByType.place = await PlaceModel.countDocuments(placeQuery)

      const total = Object.values(countsByType).reduce((sum, count) => sum + count, 0)
      const windows = {}
      let resultOffset = 0
      for (const type of resultTypes) {
        const count = countsByType[type] || 0
        windows[type] = pageWindow(resultOffset, count, params.page, params.limit)
        resultOffset += count
      }

      const queries = []
      if (windows.country) queries.push(resultQuery(
        CountryModel, countryQuery,
        'name officialName slug flagEmoji flagImageUrl continent region subregion capital population',
        { name: 1, slug: 1 }, windows.country,
      ).then((records) => records.map((record) => ({
        id: record.slug,
        type: 'country',
        title: record.name,
        country: {
          ...countryPresentation(record),
          officialName: record.officialName,
          continent: record.continent,
          region: record.region,
          subregion: record.subregion,
          capital: record.capital,
          population: record.population,
        },
        description: descriptionText(countrySummary(record)),
      }))))
      if (windows['cultural-entry']) queries.push(resultQuery(
        CulturalEntryModel, entryQuery,
        'country category title summary content region image',
        { title: 1, _id: 1 }, windows['cultural-entry'], true,
      ).then((records) => records.map((record) => ({
        id: String(record._id),
        type: 'cultural-entry',
        title: record.title,
        country: countryPresentation(record.country),
        category: record.category,
        image: imagePresentation(record.image),
        description: descriptionText(record.summary || record.content),
      }))))
      if (windows.place) queries.push(resultQuery(
        PlaceModel, placeQuery,
        'country name description location region category image',
        { name: 1, _id: 1 }, windows.place, true,
      ).then((records) => records.map((record) => ({
        id: String(record._id),
        type: 'place',
        title: record.name,
        country: countryPresentation(record.country),
        category: record.category,
        image: imagePresentation(record.image),
        description: descriptionText(record.description || [record.location, record.region].filter(Boolean).join(' · ')),
      }))))

      const data = (await Promise.all(queries)).flat()
      return res.json({
        success: true,
        data,
        pagination: {
          page: params.page,
          limit: params.limit,
          total,
          totalPages: Math.ceil(total / params.limit),
        },
      })
    } catch (error) {
      return next(error)
    }
  }
}
