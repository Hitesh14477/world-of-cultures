import test from 'node:test';
import assert from 'node:assert/strict';
import { collectWikidataFacts, WIKIDATA_FACT_COLLECTION, WIKIDATA_SOURCE_ID } from '../src/services/wikidataResearch.js';
import { CULTURAL_PILOT_IMPORT, IMPORT_POLICY_REGISTRY } from '../src/services/importPolicyRegistry.js';
import { assertImportAllowed } from '../src/services/importPolicyGate.js';
import { assertCulturalPilotImportAllowed } from '../src/scripts/importCulturalPilot.js';
import CulturalEntry from '../src/models/CulturalEntry.js';
import mongoose from 'mongoose';

const now = new Date('2026-10-27T12:00:00.000Z');

function approvedPolicy(overrides = {}) {
  return {
    sourceId: WIKIDATA_SOURCE_ID,
    name: 'Wikidata (test fixture only)',
    policyReference: 'https://example.org/test-policy',
    verificationStatus: 'verified',
    reviewedAt: '2026-10-01',
    reviewDueAt: '2026-11-30',
    hosts: ['www.wikidata.org'],
    permittedUses: ['structured_fact_research'],
    storageModes: ['persistent_database'],
    maxRetentionDays: null,
    attributionRequirements: ['Test only.'],
    licensingRequirements: 'Test fixture; not a production permission claim.',
    approvedOperations: [WIKIDATA_FACT_COLLECTION],
    dataLicense: {
      name: 'CC0 1.0 (test fixture only)',
      url: 'https://creativecommons.org/publicdomain/zero/1.0/',
      attributionText: 'Wikidata, test fixture attribution.',
      scope: 'Test fixture only.',
    },
    ...overrides,
  };
}

function mockPayload() {
  const reference = { snaks: { P854: [{ datavalue: { value: 'https://example.org/language-reference' } }] } };
  return {
    entities: {
      Q668: {
        labels: { en: { value: 'India' } },
        claims: {
          P37: [{ mainsnak: { datavalue: { type: 'wikibase-entityid', value: { id: 'Q5146' } } }, references: [reference] }],
          P38: [{ mainsnak: { datavalue: { type: 'string', value: 'Unreferenced value' } }, references: [] }],
        },
      },
      P37: { labels: { en: { value: 'official language' } } },
      Q5146: { labels: { en: { value: 'Hindi' } } },
    },
  };
}

test('missing source approval fails closed before making a request', async () => {
  let requests = 0;
  await assert.rejects(collectWikidataFacts({
    countrySlug: 'india', entityId: 'Q668', propertyIds: ['P37'], policyRegistry: {}, now,
    fetchImpl: async () => { requests += 1; throw new Error('must not request'); },
  }), (error) => error.code === 'SOURCE_POLICY_MISSING');
  assert.equal(requests, 0);
});

test('officially documented policy explicitly permits only the registered Wikidata operations', () => {
  assert.equal(IMPORT_POLICY_REGISTRY[WIKIDATA_SOURCE_ID].verificationStatus, 'verified');
  assert.equal(assertImportAllowed({
    sourceIds: [WIKIDATA_SOURCE_ID],
    operationId: WIKIDATA_FACT_COLLECTION,
    use: 'structured_fact_research',
    storageMode: 'persistent_database',
    registry: IMPORT_POLICY_REGISTRY,
    now,
  }), true);
  const candidate = { sources: [{
    title: 'India (Wikidata structured data)',
    publisher: 'Wikidata structured data',
    url: 'https://www.wikidata.org/wiki/Q668',
    accessedAt: now.toISOString().slice(0, 10),
    license: 'CC0 1.0 Universal',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attributionText: 'Data: Wikidata (CC0 1.0); attribution retained as provenance.',
    licenseScope: 'Structured data only; excludes wiki article text, external referenced works, and Wikimedia Commons media.',
  }] };
  assert.equal(assertCulturalPilotImportAllowed({ candidates: [candidate], now }), true);
  assert.throws(() => assertCulturalPilotImportAllowed({
    candidates: [{ sources: [{ ...candidate.sources[0], license: undefined }] }], now,
  }), (error) => error.code === 'SOURCE_LICENSE_METADATA_MISSING');
});

test('license metadata is mandatory even when an injected test policy passes the gate', async () => {
  let requests = 0;
  await assert.rejects(collectWikidataFacts({
    countrySlug: 'india', entityId: 'Q668', propertyIds: ['P37'], policyRegistry: { [WIKIDATA_SOURCE_ID]: approvedPolicy({ dataLicense: undefined }) }, now,
    fetchImpl: async () => { requests += 1; throw new Error('must not request'); },
  }), (error) => error.code === 'SOURCE_LICENSE_METADATA_MISSING');
  assert.equal(requests, 0);
});

test('collects only requested, externally referenced facts and attaches source attribution and license metadata', async () => {
  let requestUrl;
  let requestHeaders;
  const facts = await collectWikidataFacts({
    countrySlug: 'india', entityId: 'Q668', propertyIds: ['P37'], policyRegistry: { [WIKIDATA_SOURCE_ID]: approvedPolicy() }, now,
    fetchImpl: async (url, options) => {
      requestUrl = new URL(url);
      requestHeaders = options.headers;
      return { ok: true, json: async () => mockPayload() };
    },
  });

  assert.equal(facts.length, 1);
  assert.equal(facts[0].countrySlug, 'india');
  assert.equal(facts[0].entityLabel, 'India');
  assert.equal(facts[0].facts.length, 1);
  assert.deepEqual(facts[0].facts[0], {
    propertyId: 'P37',
    propertyLabel: 'official language',
    value: 'Hindi',
    valueUrl: 'https://www.wikidata.org/wiki/Q5146',
    references: [{
      title: 'Unreviewed source URL linked from a Wikidata statement',
      url: 'https://example.org/language-reference',
      accessedAt: now.toISOString(),
    }],
  });
  assert.equal(facts[0].source.publisher, 'Wikidata (test fixture only)');
  assert.equal(facts[0].source.license, 'CC0 1.0 (test fixture only)');
  assert.equal(facts[0].source.attributionText, 'Wikidata, test fixture attribution.');
  assert.equal(facts[0].source.licenseScope, 'Test fixture only.');
  assert.equal(requestUrl.hostname, 'www.wikidata.org');
  assert.equal(requestUrl.searchParams.get('action'), 'wbgetentities');
  assert.equal(requestUrl.searchParams.get('maxlag'), '5');
  assert.match(requestHeaders['User-Agent'], /^WorldOfCulturesBot\/.*https:\/\/github\.com\//);

  const candidate = new CulturalEntry({
    country: new mongoose.Types.ObjectId(),
    category: 'languages_and_dialects',
    title: 'Human-authored language note',
    summary: 'Human-authored editorial summary.',
    content: 'Human-authored explanatory text; structured facts are stored separately.',
    sources: [facts[0].source],
    facts: facts[0].facts,
    reviewStatus: 'pending_review',
  });
  await candidate.validate();
  assert.equal(candidate.reviewStatus, 'pending_review');
  assert.equal(candidate.facts[0].value, 'Hindi');
  assert.notEqual(candidate.content, candidate.facts[0].value);
});

test('resolves P248 source items in a bounded sequential request and labels them as review leads', async () => {
  let requestCount = 0;
  const result = await collectWikidataFacts({
    countrySlug: 'japan', entityId: 'Q17', propertyIds: ['P37'], policyRegistry: { [WIKIDATA_SOURCE_ID]: approvedPolicy() }, now,
    fetchImpl: async (url) => {
      requestCount += 1;
      const ids = new URL(url).searchParams.get('ids');
      if (ids === 'Q17|P37') {
        return {
          ok: true,
          json: async () => ({
            entities: {
              Q17: { labels: { en: { value: 'Japan' } }, claims: { P37: [{
                mainsnak: { datavalue: { type: 'wikibase-entityid', value: { id: 'Q123' } } },
                references: [{ snaks: { P248: [{ datavalue: { value: { id: 'Q456' } } }] } }],
              }] } },
              P37: { labels: { en: { value: 'official language' } } },
            },
          }),
        };
      }
      return { ok: true, json: async () => ({ entities: { Q456: { labels: { en: { value: 'Japan Statistical Yearbook' } } } } }) };
    },
  });
  assert.equal(requestCount, 2);
  assert.equal(result[0].countrySlug, 'japan');
  assert.equal(result[0].facts[0].value, 'Q123');
  assert.deepEqual(result[0].facts[0].references, [{
    title: 'Wikidata source item: Japan Statistical Yearbook',
    publisher: 'Wikidata source entity',
    url: 'https://www.wikidata.org/wiki/Q456',
    accessedAt: now.toISOString(),
  }]);
});

test('unavailable sources and malformed payloads fail without returning partial facts', async () => {
  const options = { countrySlug: 'india', entityId: 'Q668', propertyIds: ['P37'], policyRegistry: { [WIKIDATA_SOURCE_ID]: approvedPolicy() }, now };
  await assert.rejects(collectWikidataFacts({ ...options, fetchImpl: async () => { throw new Error('network detail'); } }), /could not be reached/);
  await assert.rejects(collectWikidataFacts({ ...options, fetchImpl: async () => ({ ok: false, status: 503 }) }), /HTTP 503/);
  await assert.rejects(collectWikidataFacts({ ...options, fetchImpl: async () => ({ ok: false, status: 429, headers: new Headers({ 'Retry-After': '30' }) }) }), /Retry-After \(30\)/);
  await assert.rejects(collectWikidataFacts({ ...options, fetchImpl: async () => ({ ok: true, json: async () => ({ error: 'bad payload' }) }) }), /unexpected response/);
  await assert.rejects(collectWikidataFacts({ ...options, fetchImpl: async () => ({ ok: true, json: async () => { throw new Error('parse detail'); } }) }), /invalid JSON/);
});

test('invalid identifiers are rejected before policy evaluation or network access', async () => {
  await assert.rejects(collectWikidataFacts({ countrySlug: 'india', entityId: 'not-qid', propertyIds: ['P37'] }), /valid Wikidata country entity ID/);
  await assert.rejects(collectWikidataFacts({ countrySlug: 'india', entityId: 'Q668', propertyIds: ['not-property'] }), /valid Wikidata property IDs/);
  await assert.rejects(collectWikidataFacts({ countrySlug: 'italy', entityId: 'Q38', propertyIds: ['P37'] }), /India and Japan only/);
  await assert.rejects(collectWikidataFacts({ countrySlug: 'india', entityId: 'Q668', propertyIds: [] }), /valid Wikidata property IDs/);
});
