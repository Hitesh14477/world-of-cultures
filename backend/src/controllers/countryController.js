import Country, { CONTINENTS } from '../models/Country.js';
import CulturalEntry from '../models/CulturalEntry.js';
import Place from '../models/Place.js';
import { communityImageStorage } from '../services/communityImageStorage.js';
import {
  ContributionValidationError,
  validateCulturalEntrySubmission,
  validatePlaceSubmission,
} from '../validators/contributionValidation.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const ALLOWED_QUERY_KEYS = new Set(['page', 'limit', 'search', 'continent', 'sort']);

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function singleQueryValue(value, name) {
  if (Array.isArray(value) || typeof value === 'object') {
    throw badRequest(`Query parameter "${name}" must be provided once.`);
  }
  return value;
}

function positiveInteger(value, fallback, name, maximum = Number.MAX_SAFE_INTEGER) {
  if (value === undefined) return fallback;
  const stringValue = singleQueryValue(value, name);
  if (!/^\d+$/.test(stringValue)) throw badRequest(`Query parameter "${name}" must be a whole number.`);
  const number = Number(stringValue);
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) {
    throw badRequest(`Query parameter "${name}" must be between 1 and ${maximum}.`);
  }
  return number;
}

export function parseCountryListQuery(query) {
  const unknownKeys = Object.keys(query).filter((key) => !ALLOWED_QUERY_KEYS.has(key));
  if (unknownKeys.length) throw badRequest(`Unsupported query parameter: ${unknownKeys[0]}.`);

  const page = positiveInteger(query.page, 1, 'page');
  const limit = positiveInteger(query.limit, DEFAULT_LIMIT, 'limit', MAX_LIMIT);
  const rawSearch = query.search === undefined ? '' : singleQueryValue(query.search, 'search');
  const search = typeof rawSearch === 'string' ? rawSearch.trim() : '';
  if (search.length > 100) throw badRequest('Search text must be 100 characters or fewer.');

  const rawContinent = query.continent === undefined ? '' : singleQueryValue(query.continent, 'continent');
  const continent = typeof rawContinent === 'string' ? rawContinent.trim() : '';
  if (continent && !CONTINENTS.includes(continent)) {
    throw badRequest(`Continent must be one of: ${CONTINENTS.join(', ')}.`);
  }

  const rawSort = query.sort === undefined ? 'name' : singleQueryValue(query.sort, 'sort');
  const sort = rawSort || 'name';
  if (!['name', '-name'].includes(sort)) {
    throw badRequest('Sort must be "name" or "-name".');
  }

  return { page, limit, search, continent, sort };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function createCountryController(CountryModel = Country, CulturalEntryModel = CulturalEntry, PlaceModel = Place, { imageStorage = communityImageStorage } = {}) {
  async function submitContribution(req, res, next, { Model, validate }) {
    let uploadedImage;
    try {
      const country = await CountryModel.findOne({ slug: req.params.slug.toLowerCase() }).select('_id').lean();
      if (!country) return res.status(404).json({ success: false, message: 'Country not found.' });

      let fields;
      try {
        fields = validate(req.body, { hasImage: Boolean(req.file) });
      } catch (error) {
        if (!(error instanceof ContributionValidationError)) throw error;
        return res.status(400).json({
          success: false,
          message: error.message,
          errors: error.fieldErrors,
        });
      }

      if (req.file) {
        const result = await imageStorage.upload(req.file.buffer, 'world-of-cultures/cultural-submissions');
        if (!result?.url || !result?.publicId) {
          if (result?.publicId) {
            try { await imageStorage.remove(result.publicId) } catch { /* storage cleanup is retried operationally */ }
          }
          return res.status(502).json({ success: false, message: 'The image could not be stored. Please try again.' });
        }
        uploadedImage = result;
      }
      let record;
      try {
        record = await Model.create({
          ...fields,
          ...(uploadedImage ? {
            image: {
              ...uploadedImage,
              caption: req.body.imageCaption?.trim() || undefined,
              rightsConfirmed: true,
              rightsConfirmedAt: new Date(),
            },
          } : {}),
          country: country._id,
          submittedBy: req.user.id,
          reviewStatus: 'pending_review',
        });
      } catch (error) {
        if (uploadedImage?.publicId) {
          try { await imageStorage.remove(uploadedImage.publicId); } catch { /* retain the database error; image cleanup can be retried operationally */ }
        }
        throw error;
      }
      return res.status(201).json({
        success: true,
        message: 'Thank you. Your contribution has been submitted for review.',
        data: { id: String(record._id), reviewStatus: 'pending_review' },
      });
    } catch (error) {
      if (error?.name === 'ValidationError') {
        return res.status(400).json({
          success: false,
          message: 'Please correct the submission fields and try again.',
          errors: Object.keys(error.errors || {}).map((field) => ({ field, message: 'This field is invalid.' })),
        });
      }
      return next(error);
    }
  }

  return {
    async listCountries(req, res, next) {
      try {
        const { page, limit, search, continent, sort } = parseCountryListQuery(req.query);
        const filter = {};
        if (continent) filter.continent = continent;
        if (search) {
          const expression = new RegExp(escapeRegex(search), 'i');
          filter.$or = [{ name: expression }, { officialName: expression }];
        }

        const sortDirection = sort === '-name' ? -1 : 1;
        const [countries, total] = await Promise.all([
          CountryModel.find(filter)
            .select('name officialName slug cca2 cca3 capital flagEmoji flagImageUrl continent region subregion population area -_id')
            .sort({ name: sortDirection, cca2: 1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
          CountryModel.countDocuments(filter),
        ]);

        return res.json({
          success: true,
          data: countries,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        });
      } catch (error) {
        return next(error);
      }
    },

    async listContinents(req, res, next) {
      try {
        const counts = await CountryModel.aggregate([
          { $group: { _id: '$continent', count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ]);

        return res.json({
          success: true,
          data: counts.map(({ _id, count }) => ({ continent: _id, count })),
        });
      } catch (error) {
        return next(error);
      }
    },

    async getCountryBySlug(req, res, next) {
      try {
        const slug = req.params.slug.toLowerCase();
        // Legacy embedded culture has no review status, so it must not bypass
        // the published-only CulturalEntry and Place APIs.
        const country = await CountryModel.findOne({ slug }).select('-_id -__v -culture').lean();
        if (!country) {
          return res.status(404).json({ success: false, message: 'Country not found.' });
        }
        return res.json({ success: true, data: country });
      } catch (error) {
        return next(error);
      }
    },

    async listCulturalEntries(req, res, next) {
      try {
        const country = await CountryModel.findOne({ slug: req.params.slug.toLowerCase() }).select('_id').lean();
        if (!country) return res.status(404).json({ success: false, message: 'Country not found.' });

        const entries = await CulturalEntryModel.find({ country: country._id, reviewStatus: 'published' })
          .select('country category title summary content region sources facts imageAttributions image reviewStatus createdAt updatedAt')
          .sort({ category: 1, title: 1 })
          .lean();
        return res.json({ success: true, data: entries });
      } catch (error) {
        return next(error);
      }
    },

    async listPlaces(req, res, next) {
      try {
        const country = await CountryModel.findOne({ slug: req.params.slug.toLowerCase() }).select('_id').lean();
        if (!country) return res.status(404).json({ success: false, message: 'Country not found.' });

        const places = await PlaceModel.find({ country: country._id, reviewStatus: 'published' })
          .select('country name description location region coordinates category sources facts imageAttributions image reviewStatus createdAt updatedAt')
          .sort({ name: 1 })
          .lean();
        return res.json({ success: true, data: places });
      } catch (error) {
        return next(error);
      }
    },

    submitCulturalEntry(req, res, next) {
      return submitContribution(req, res, next, {
        Model: CulturalEntryModel,
        validate: validateCulturalEntrySubmission,
      });
    },

    submitPlace(req, res, next) {
      return submitContribution(req, res, next, {
        Model: PlaceModel,
        validate: validatePlaceSubmission,
      });
    },
  };
}
