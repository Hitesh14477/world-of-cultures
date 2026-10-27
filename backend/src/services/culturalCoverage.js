import { CULTURAL_ENTRY_CATEGORIES } from '../models/CulturalEntry.js';

export const CULTURAL_COVERAGE_TOPICS = Object.freeze([
  ...CULTURAL_ENTRY_CATEGORIES,
  'places',
]);

function increment(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

/** Build a metadata-only report; never returns article text, sources, or moderation notes. */
export function buildCulturalCoverageReport({ countries = [], culturalEntries = [], places = [] }) {
  const countryById = new Map(countries.map((country) => [String(country._id), country]));
  const publishedByCountry = new Map(countries.map((country) => [String(country._id), new Set()]));
  const publishedCounts = new Map(CULTURAL_COVERAGE_TOPICS.map((topic) => [topic, 0]));
  const topicCountries = new Map(CULTURAL_COVERAGE_TOPICS.map((topic) => [topic, new Set()]));
  const entryStatusCounts = new Map();
  const placeStatusCounts = new Map();

  for (const entry of culturalEntries) {
    increment(entryStatusCounts, entry.reviewStatus || 'missing_status');
    if (entry.reviewStatus !== 'published' || !publishedCounts.has(entry.category)) continue;
    const countryId = String(entry.country?._id || entry.country);
    if (!countryById.has(countryId)) continue;
    increment(publishedCounts, entry.category);
    publishedByCountry.get(countryId).add(entry.category);
    topicCountries.get(entry.category).add(countryId);
  }

  for (const place of places) {
    increment(placeStatusCounts, place.reviewStatus || 'missing_status');
    if (place.reviewStatus !== 'published') continue;
    const countryId = String(place.country?._id || place.country);
    if (!countryById.has(countryId)) continue;
    increment(publishedCounts, 'places');
    publishedByCountry.get(countryId).add('places');
    topicCountries.get('places').add(countryId);
  }

  const countryCoverage = countries.map((country) => {
    const publishedTopics = [...(publishedByCountry.get(String(country._id)) || [])].sort();
    return {
      slug: country.slug,
      name: country.name,
      publishedTopics,
      missingTopics: CULTURAL_COVERAGE_TOPICS.filter((topic) => !publishedTopics.includes(topic)),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  return {
    countryCount: countries.length,
    topicCount: CULTURAL_COVERAGE_TOPICS.length,
    fullyCoveredCountries: countryCoverage.filter((country) => country.missingTopics.length === 0).length,
    countriesWithAnyPublishedContent: countryCoverage.filter((country) => country.publishedTopics.length > 0).length,
    publishedCoverageByTopic: Object.fromEntries(CULTURAL_COVERAGE_TOPICS.map((topic) => [topic, {
      publishedRecords: publishedCounts.get(topic),
      countriesWithContent: topicCountries.get(topic).size,
    }])),
    recordsByReviewStatus: {
      culturalEntries: Object.fromEntries(entryStatusCounts),
      places: Object.fromEntries(placeStatusCounts),
    },
    countries: countryCoverage,
  };
}
