import { slugifyCountryName, CONTINENTS } from '../models/Country.js';

export const INCLUDED_OBSERVER_CODES = new Set(['VA', 'PS']);
export const COUNTRY_DATA_SOURCE = 'REST Countries API v5';

export function continentFromRegion(region, subregion = '') {
  if (region === 'Africa' || region === 'Asia' || region === 'Europe' || region === 'Oceania') {
    return region;
  }

  if (region === 'Americas') {
    return subregion === 'South America' ? 'South America' : 'North America';
  }

  return null;
}

function alpha2Of(record) {
  return record?.codes?.alpha_2?.trim().toUpperCase();
}

export function selectInScopeRecords(records, {
  expectedMembers = 193,
  expectedObservers = 2,
} = {}) {
  if (!Array.isArray(records)) {
    throw new Error('Country source must contain an array of records.');
  }

  const members = records.filter((record) => record?.classification?.un_member === true);
  const observerRecords = records.filter((record) => (
    record?.classification?.un_observer === true
    && INCLUDED_OBSERVER_CODES.has(alpha2Of(record))
  ));
  const observerCodes = new Set(observerRecords.map(alpha2Of));
  const missingObservers = [...INCLUDED_OBSERVER_CODES].filter((code) => !observerCodes.has(code));

  if (members.length !== expectedMembers || observerRecords.length !== expectedObservers || missingObservers.length) {
    throw new Error(
      `Country source scope check failed (members: ${members.length}, observers: ${observerRecords.length}, missing observer codes: ${missingObservers.length}). No records were written.`,
    );
  }

  const included = [...members, ...observerRecords];
  const cca2Codes = included.map(alpha2Of);
  const cca3Codes = included.map((record) => record?.codes?.alpha_3?.trim().toUpperCase());
  if (new Set(cca2Codes).size !== included.length || new Set(cca3Codes).size !== included.length) {
    throw new Error('Country source contains duplicate ISO codes. No records were written.');
  }

  return included;
}

function normalizeLanguages(languages) {
  if (Array.isArray(languages)) {
    return languages
      .filter((language) => language && typeof language.name === 'string' && language.name.trim())
      .map((language) => ({
        code: language.iso_639_3 || language.iso_639_1 || undefined,
        name: language.name.trim(),
      }));
  }

  if (languages && typeof languages === 'object') {
    return Object.entries(languages)
      .filter(([, name]) => typeof name === 'string' && name.trim())
      .map(([code, name]) => ({ code, name: name.trim() }));
  }

  return undefined;
}

function normalizeCurrencies(currencies) {
  if (!currencies || typeof currencies !== 'object' || Array.isArray(currencies)) return undefined;
  return Object.entries(currencies)
    .filter(([, currency]) => currency && typeof currency.name === 'string' && currency.name.trim())
    .map(([code, currency]) => ({ code, name: currency.name.trim(), symbol: currency.symbol || undefined }));
}

function normalizeNumber(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function normalizeSourceCountry(record) {
  const name = record?.names?.common?.trim();
  const officialName = record?.names?.official?.trim();
  const cca2 = alpha2Of(record);
  const cca3 = record?.codes?.alpha_3?.trim().toUpperCase();
  const region = record?.region?.trim();
  const subregion = record?.subregion?.trim();
  const continent = continentFromRegion(region, subregion);

  if (!name || !officialName || !/^[A-Z]{2}$/.test(cca2 || '') || !/^[A-Z]{3}$/.test(cca3 || '')) {
    throw new Error('Country source record is missing a name or valid ISO alpha-2/alpha-3 code.');
  }
  if (!CONTINENTS.includes(continent)) {
    throw new Error(`Country source record for ${cca2} has an unsupported region.`);
  }

  const country = {
    name,
    officialName,
    slug: slugifyCountryName(name),
    cca2,
    cca3,
    continent,
    dataSource: COUNTRY_DATA_SOURCE,
  };

  if (region) country.region = region;
  if (subregion) country.subregion = subregion;

  if (Array.isArray(record.capitals)) {
    country.capital = record.capitals
      .map((capital) => typeof capital === 'string' ? capital : capital?.name)
      .filter((capital) => typeof capital === 'string' && capital.trim())
      .map((capital) => capital.trim());
  }

  if (typeof record.flag?.emoji === 'string' && record.flag.emoji.trim()) country.flagEmoji = record.flag.emoji;
  const flagUrl = record.flag?.url_svg || record.flag?.url_png;
  if (typeof flagUrl === 'string' && /^https?:\/\//i.test(flagUrl)) country.flagImageUrl = flagUrl;

  const area = normalizeNumber(record.area?.kilometers);
  const population = normalizeNumber(record.population);
  const latitude = normalizeNumber(record.coordinates?.lat);
  const longitude = normalizeNumber(record.coordinates?.lng);
  if (area !== undefined && area >= 0) country.area = area;
  if (population !== undefined && population >= 0) country.population = population;
  if (latitude !== undefined && latitude >= -90 && latitude <= 90) country.latitude = latitude;
  if (longitude !== undefined && longitude >= -180 && longitude <= 180) country.longitude = longitude;
  if (typeof record.landlocked === 'boolean') country.landlocked = record.landlocked;

  if (Array.isArray(record.borders)) {
    country.borders = record.borders
      .filter((code) => typeof code === 'string' && /^[A-Z]{3}$/i.test(code))
      .map((code) => code.toUpperCase());
  }
  const languages = normalizeLanguages(record.languages);
  const currencies = normalizeCurrencies(record.currencies);
  if (languages) country.languages = languages;
  if (currencies) country.currencies = currencies;
  if (Array.isArray(record.timezones)) country.timeZones = record.timezones.filter((zone) => typeof zone === 'string');

  return country;
}

const CULTURAL_FIELDS = [
  'history', 'traditions', 'food', 'traditionalClothing', 'festivals',
  'languagesAndDialects', 'mythologyAndFolklore', 'musicAndDance', 'landmarks', 'everydayLife',
];

function areEqual(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export function buildCountryImportPlan(countries, existingCountries = []) {
  const existingByCode = new Map(existingCountries.map((country) => [country.cca2, country]));
  const operations = [];
  let skipped = 0;

  for (const country of countries) {
    const existing = existingByCode.get(country.cca2);
    if (existing) {
      const changedFields = Object.fromEntries(
        Object.entries(country).filter(([field, value]) => (
          field !== 'slug' && !CULTURAL_FIELDS.includes(field) && !areEqual(existing[field], value)
        )),
      );

      if (Object.keys(changedFields).length === 0) {
        skipped += 1;
        continue;
      }

      operations.push({
        updateOne: {
          filter: { cca2: country.cca2 },
          update: { $set: changedFields },
        },
      });
      continue;
    }

    const { slug, ...basicFields } = country;
    const emptyCulture = Object.fromEntries(CULTURAL_FIELDS.map((field) => [field, []]));
    operations.push({
      updateOne: {
        filter: { cca2: country.cca2 },
        update: {
          $set: basicFields,
          $setOnInsert: { slug, culture: emptyCulture },
        },
        upsert: true,
      },
    });
  }

  return { operations, skipped };
}
