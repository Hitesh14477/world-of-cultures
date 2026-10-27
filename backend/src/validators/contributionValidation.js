import { CULTURAL_ENTRY_CATEGORIES } from '../models/CulturalEntry.js'
import { PLACE_CATEGORIES } from '../models/Place.js'

const COMMON_SOURCE_FIELDS = new Set([
  'title', 'url', 'publisher', 'publishedAt', 'accessedAt',
  'license', 'licenseUrl', 'attributionText', 'licenseScope',
])
const MAX_SOURCES = 10

export class ContributionValidationError extends Error {
  constructor(errors) {
    super('Please correct the highlighted submission fields.')
    this.name = 'ContributionValidationError'
    this.statusCode = 400
    this.fieldErrors = errors
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isValidHttpUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return false
  try {
    const parsed = new URL(value)
    return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password
  } catch {
    return false
  }
}

function isValidDate(value) {
  if (value instanceof Date) return !Number.isNaN(value.valueOf())
  if (typeof value !== 'string' || !value.trim()) return false
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const dateOnly = new Date(`${value}T00:00:00.000Z`)
    return !Number.isNaN(dateOnly.valueOf()) && dateOnly.toISOString().slice(0, 10) === value
  }
  const parsed = new Date(value)
  return !Number.isNaN(parsed.valueOf())
}

function addTextError(errors, object, field, { required = false, maxLength }) {
  const value = object[field]
  if (value === undefined || value === null || value === '') {
    if (required) errors.push({ field, message: 'This field is required.' })
    return
  }
  if (typeof value !== 'string') {
    errors.push({ field, message: 'Enter text for this field.' })
    return
  }
  const trimmed = value.trim()
  if (required && !trimmed) errors.push({ field, message: 'This field is required.' })
  else if (trimmed.length > maxLength) errors.push({ field, message: `Use ${maxLength} characters or fewer.` })
}

function validateSources(sources, errors) {
  if (!Array.isArray(sources) || sources.length === 0) {
    errors.push({ field: 'sources', message: 'Add at least one reliable source.' })
    return []
  }
  if (sources.length > MAX_SOURCES) errors.push({ field: 'sources', message: `Add no more than ${MAX_SOURCES} sources.` })

  return sources.slice(0, MAX_SOURCES).map((source, index) => {
    const prefix = `sources.${index}`
    if (!isRecord(source)) {
      errors.push({ field: prefix, message: 'Each source must be an object.' })
      return null
    }
    for (const key of Object.keys(source)) {
      if (!COMMON_SOURCE_FIELDS.has(key)) errors.push({ field: `${prefix}.${key}`, message: 'This source field is not supported.' })
    }

    const clean = {}
    for (const [field, limit, required] of [['title', 200, true], ['publisher', 160, true]]) {
      addTextError(errors, source, field, { required, maxLength: limit })
      if (typeof source[field] === 'string' && source[field].trim()) clean[field] = source[field].trim()
    }

    if (!isValidHttpUrl(source.url)) {
      errors.push({ field: `${prefix}.url`, message: 'Enter a valid HTTP or HTTPS source URL.' })
    } else {
      clean.url = source.url.trim()
    }

    for (const [field, limit] of [['license', 120], ['attributionText', 500], ['licenseScope', 240]]) {
      if (source[field] !== undefined && source[field] !== '') {
        addTextError(errors, source, field, { maxLength: limit })
        if (typeof source[field] === 'string' && source[field].trim()) clean[field] = source[field].trim()
      }
    }

    const hasLicenseMetadata = ['license', 'licenseUrl', 'attributionText', 'licenseScope']
      .some((field) => source[field] !== undefined && source[field] !== '')
    if (hasLicenseMetadata) {
      if (typeof source.licenseUrl !== 'string' || !isValidHttpUrl(source.licenseUrl)) {
        errors.push({ field: `${prefix}.licenseUrl`, message: 'Enter a valid license URL when providing license details.' })
      } else {
        clean.licenseUrl = source.licenseUrl.trim()
      }
      for (const field of ['license', 'attributionText', 'licenseScope']) {
        if (typeof source[field] !== 'string' || !source[field].trim()) {
          errors.push({ field: `${prefix}.${field}`, message: 'Complete all license and attribution fields, or leave them blank.' })
        }
      }
    }

    for (const field of ['publishedAt', 'accessedAt']) {
      if (source[field] === undefined || source[field] === '') continue
      if (!isValidDate(source[field])) errors.push({ field: `${prefix}.${field}`, message: 'Enter a valid date.' })
      else clean[field] = new Date(source[field])
    }
    return clean
  }).filter(Boolean)
}

function checkAllowedFields(payload, allowedFields, errors) {
  for (const field of Object.keys(payload)) {
    // Accept but deliberately discard a client review status; server code sets it explicitly.
    if (field !== 'reviewStatus' && !allowedFields.has(field)) {
      errors.push({ field, message: 'This field is not supported.' })
    }
  }
}

function validateImageFields(payload, errors, hasImage) {
  if (payload.imageCaption !== undefined && payload.imageCaption !== '') {
    addTextError(errors, payload, 'imageCaption', { maxLength: 240 })
  }
  if (hasImage) {
    if (typeof payload.imageRightsConfirmed !== 'string' || payload.imageRightsConfirmed !== 'true') {
      errors.push({ field: 'imageRightsConfirmed', message: 'Confirm that you own this image or have permission to share it.' })
    }
  } else if ((payload.imageCaption !== undefined && payload.imageCaption !== '') || payload.imageRightsConfirmed !== undefined) {
    errors.push({ field: 'image', message: 'Select an image before adding image details.' })
  }
}

export function validateCulturalEntrySubmission(payload, { hasImage = false } = {}) {
  const errors = []
  const allowedFields = new Set(['title', 'category', 'summary', 'content', 'region', 'sources', 'reviewStatus', 'imageCaption', 'imageRightsConfirmed'])
  if (!isRecord(payload)) throw new ContributionValidationError([{ field: 'form', message: 'Submit a valid form.' }])
  checkAllowedFields(payload, allowedFields, errors)

  addTextError(errors, payload, 'title', { required: true, maxLength: 180 })
  if (!CULTURAL_ENTRY_CATEGORIES.includes(payload.category)) {
    errors.push({ field: 'category', message: 'Choose a supported cultural category.' })
  }
  addTextError(errors, payload, 'summary', { maxLength: 600 })
  addTextError(errors, payload, 'content', { required: true, maxLength: 20000 })
  addTextError(errors, payload, 'region', { maxLength: 160 })
  validateImageFields(payload, errors, hasImage)

  const clean = {
    title: typeof payload.title === 'string' ? payload.title.trim() : payload.title,
    category: payload.category,
    content: typeof payload.content === 'string' ? payload.content.trim() : payload.content,
    sources: validateSources(payload.sources, errors),
  }
  for (const field of ['summary', 'region']) {
    if (typeof payload[field] === 'string' && payload[field].trim()) clean[field] = payload[field].trim()
  }
  if (errors.length) throw new ContributionValidationError(errors)
  return clean
}

export function validatePlaceSubmission(payload, { hasImage = false } = {}) {
  const errors = []
  const allowedFields = new Set(['name', 'description', 'location', 'region', 'category', 'sources', 'reviewStatus', 'imageCaption', 'imageRightsConfirmed'])
  if (!isRecord(payload)) throw new ContributionValidationError([{ field: 'form', message: 'Submit a valid form.' }])
  checkAllowedFields(payload, allowedFields, errors)

  addTextError(errors, payload, 'name', { required: true, maxLength: 180 })
  addTextError(errors, payload, 'description', { required: true, maxLength: 5000 })
  addTextError(errors, payload, 'location', { maxLength: 200 })
  addTextError(errors, payload, 'region', { maxLength: 160 })
  if (!PLACE_CATEGORIES.includes(payload.category)) {
    errors.push({ field: 'category', message: 'Choose a supported place type.' })
  }
  validateImageFields(payload, errors, hasImage)

  const clean = {
    name: typeof payload.name === 'string' ? payload.name.trim() : payload.name,
    description: typeof payload.description === 'string' ? payload.description.trim() : payload.description,
    category: payload.category,
    sources: validateSources(payload.sources, errors),
  }
  for (const field of ['location', 'region']) {
    if (typeof payload[field] === 'string' && payload[field].trim()) clean[field] = payload[field].trim()
  }
  if (errors.length) throw new ContributionValidationError(errors)
  return clean
}
