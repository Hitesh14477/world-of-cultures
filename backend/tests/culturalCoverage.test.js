import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { CULTURAL_COVERAGE_TOPICS, buildCulturalCoverageReport } from '../src/services/culturalCoverage.js';

const countries = [
  { _id: 'country-in', name: 'India', slug: 'india' },
  { _id: 'country-jp', name: 'Japan', slug: 'japan' },
];

test('coverage is calculated per country and topic from published content only', () => {
  const report = buildCulturalCoverageReport({
    countries,
    culturalEntries: [
      { country: 'country-in', category: 'history', reviewStatus: 'published' },
      { country: 'country-in', category: 'traditional_food', reviewStatus: 'pending_review' },
      { country: 'country-jp', category: 'mythology_and_folklore', reviewStatus: 'rejected' },
    ],
    places: [{ country: 'country-jp', reviewStatus: 'published' }],
  });
  assert.equal(report.countryCount, 2);
  assert.equal(report.topicCount, 10);
  assert.equal(report.publishedCoverageByTopic.history.countriesWithContent, 1);
  assert.equal(report.publishedCoverageByTopic.places.publishedRecords, 1);
  assert.deepEqual(report.countries.find(({ slug }) => slug === 'india').missingTopics.includes('history'), false);
  assert.equal(report.countries.find(({ slug }) => slug === 'india').missingTopics.includes('traditional_food'), true);
  assert.deepEqual(report.recordsByReviewStatus.culturalEntries, { published: 1, pending_review: 1, rejected: 1 });
  assert.equal(report.fullyCoveredCountries, 0);
});

test('coverage report never includes article text, citations, or moderation details', () => {
  const report = buildCulturalCoverageReport({
    countries,
    culturalEntries: [{ country: 'country-in', category: 'history', reviewStatus: 'published', content: 'private test prose', rejectionReason: 'private note', sources: [{ url: 'https://example.org' }] }],
  });
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes('private test prose'), false);
  assert.equal(serialized.includes('private note'), false);
  assert.equal(serialized.includes('https://example.org'), false);
});

test('all ten existing cultural topics are represented by the report', () => {
  assert.deepEqual(CULTURAL_COVERAGE_TOPICS, [
    'history', 'traditional_food', 'festivals', 'traditional_clothing', 'customs_and_traditions',
    'languages_and_dialects', 'mythology_and_folklore', 'music_and_dance', 'everyday_life', 'places',
  ]);
});

test('coverage recognizes populated country references as ObjectIds', () => {
  const id = new mongoose.Types.ObjectId();
  const report = buildCulturalCoverageReport({
    countries: [{ _id: id, name: 'Japan', slug: 'japan' }],
    culturalEntries: [{ country: id, category: 'history', reviewStatus: 'published' }],
  });
  assert.equal(report.countriesWithAnyPublishedContent, 1);
});
