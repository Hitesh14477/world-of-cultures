import Country, { CONTINENTS } from '../models/Country.js';

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

export function createCountryController(CountryModel = Country) {
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
        const country = await CountryModel.findOne({ slug }).select('-_id -__v').lean();
        if (!country) {
          return res.status(404).json({ success: false, message: 'Country not found.' });
        }
        return res.json({ success: true, data: country });
      } catch (error) {
        return next(error);
      }
    },
  };
}
