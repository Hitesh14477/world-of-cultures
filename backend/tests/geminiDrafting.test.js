import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import CulturalEntry from '../src/models/CulturalEntry.js'
import Place from '../src/models/Place.js'
import { createGeminiDraftingService, GeminiConfigurationError } from '../src/services/geminiDrafting.js'
import { preparePilotImport } from '../src/scripts/importCulturalPilot.js'

const now = new Date('2026-10-27T06:00:00.000Z')
const policyLicense = {
  publisher: 'Wikidata structured data',
  license: 'CC0 1.0 Universal',
  licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  attributionText: 'Data: Wikidata (CC0 1.0); attribution retained as provenance.',
  licenseScope: 'Structured data only; excludes wiki article text, external referenced works, and Wikimedia Commons media.',
}
const references = [
  {
    title: 'Wikidata source item: Part XVII of the Constitution of India',
    publisher: 'Wikidata source entity',
    url: 'https://www.wikidata.org/wiki/Q7140127',
    accessedAt: now.toISOString(),
  },
  {
    title: 'Wikidata source item: Official Languages Act, 1963',
    publisher: 'Wikidata source entity',
    url: 'https://www.wikidata.org/wiki/Q19082712',
    accessedAt: now.toISOString(),
  },
]
const research = {
  countrySlug: 'india',
  entityId: 'Q668',
  entityLabel: 'India',
  source: {
    title: 'India (Wikidata structured data)',
    url: 'https://www.wikidata.org/wiki/Q668',
    accessedAt: now.toISOString(),
    ...policyLicense,
  },
  facts: [
    { propertyId: 'P37', propertyLabel: 'official language', value: 'Hindi', valueUrl: 'https://www.wikidata.org/wiki/Q1568', references },
    { propertyId: 'P37', propertyLabel: 'official language', value: 'English', valueUrl: 'https://www.wikidata.org/wiki/Q1860', references },
  ],
}

function mockClient(responseText, modelVersion = 'gemini-3.8-flash-test') {
  const calls = []
  return {
    calls,
    models: {
      async generateContent(request) {
        calls.push(request)
        return { text: responseText, modelVersion }
      },
    },
  }
}

function makeService(client, researchResult = [research], options = {}) {
  return createGeminiDraftingService({
    apiKey: 'test-only-key',
    client,
    evidenceCollector: async () => researchResult,
    now: () => now,
    ...options,
  })
}

function draft(service, category = 'languages_and_dialects') {
  return service.draftCulturalEntry({
    countrySlug: 'india',
    entityId: 'Q668',
    propertyIds: ['P37'],
    category,
  })
}

function validJson(overrides = {}) {
  return JSON.stringify({
    title: 'Official-language claims recorded in Wikidata',
    summary: 'Wikidata records two official-language claims for India.',
    content: 'The India item in Wikidata lists Hindi and English under its official-language property, with links to two identified reference items. This note reports those structured claims only and does not describe the full range of languages used in India.',
    factIds: ['fact-1', 'fact-2'],
    ...overrides,
  })
}

test('creates a structured draft with trusted sources, facts, license metadata, and audit metadata', async () => {
  const client = mockClient(validJson())
  const service = makeService(client)
  const result = await draft(service)

  assert.equal(result.status, 'drafted')
  assert.equal(result.candidate.countrySlug, 'india')
  assert.equal(result.candidate.category, 'languages_and_dialects')
  assert.equal(result.candidate.facts.length, 2)
  assert.equal(result.candidate.sources.length, 3)
  assert.ok(result.candidate.sources.every((source) => source.publisher === policyLicense.publisher
    && source.license === policyLicense.license
    && source.licenseUrl === policyLicense.licenseUrl
    && source.attributionText === policyLicense.attributionText
    && source.licenseScope === policyLicense.licenseScope))
  assert.ok(result.candidate.facts.every((fact) => fact.references.length > 0
    && fact.references.every((reference) => reference.license === policyLicense.license)))
  assert.deepEqual(result.candidate.generationMetadata, {
    provider: 'google-gemini',
    model: 'gemini-3.8-flash-test',
    promptVersion: 'evidence-only-cultural-entry-v1',
    generatedAt: now,
  })
  assert.equal(result.candidate.reviewStatus, 'pending_review')
  assert.equal(client.calls.length, 1)
  assert.equal(client.calls[0].config.responseMimeType, 'application/json')
  assert.equal(client.calls[0].config.tools, undefined)
  assert.match(client.calls[0].contents, /only the supplied Wikidata structured facts/)
  assert.doesNotMatch(client.calls[0].contents, /Wikipedia article prose|Commons media/)
  const { kind, countrySlug, ...document } = result.candidate
  await new CulturalEntry({ ...document, country: new mongoose.Types.ObjectId() }).validate()
});

test('rejects malformed JSON and invalid draft structures', async () => {
  for (const output of ['not json', validJson({ summary: 17 }), validJson({ sources: references })]) {
    const service = makeService(mockClient(output))
    await assert.rejects(draft(service), /Gemini/)
  }
});

test('rejects fact IDs the model was not given', async () => {
  const service = makeService(mockClient(validJson({ factIds: ['untrusted-1', 'untrusted-2'] })))
  await assert.rejects(
    draft(service),
    (error) => error.code === 'UNKNOWN_FACT_ID',
  )
});

test('reports missing API key without invoking the Gemini client', async () => {
  const client = mockClient(validJson())
  const service = makeService(client, [research], { apiKey: '' })
  await assert.rejects(draft(service), GeminiConfigurationError)
  assert.equal(client.calls.length, 0)
});

test('returns insufficient evidence without calling Gemini when too few approved referenced facts exist', async () => {
  const client = mockClient(validJson())
  const service = makeService(client, [{ ...research, facts: [research.facts[0]] }])
  const result = await draft(service, 'history')
  assert.equal(result.status, 'insufficient_evidence')
  assert.equal(result.candidate, null)
  assert.equal(client.calls.length, 0)
});

test('returns insufficient evidence when Gemini declines to draft from the supplied facts', async () => {
  const client = mockClient(JSON.stringify({ title: '', summary: '', content: '', factIds: [] }))
  const service = makeService(client)
  const result = await draft(service, 'history')
  assert.equal(result.status, 'insufficient_evidence')
  assert.equal(result.candidate, null)
});

test('rejects evidence sources outside the current source-policy approval', async () => {
  const client = mockClient(validJson())
  const unapprovedResearch = { ...research, source: { ...research.source, url: 'https://unapproved.example/item' } }
  const service = makeService(client, [unapprovedResearch])
  await assert.rejects(draft(service), /registered source policy/)
  assert.equal(client.calls.length, 0)
});

test('rejects an unsupported category before contacting Gemini', async () => {
  const client = mockClient(validJson())
  const service = makeService(client)
  await assert.rejects(draft(service, 'invented_category'), /not supported/)
  assert.equal(client.calls.length, 0)
});

test('the existing importer forces generated records to pending review', async () => {
  const client = mockClient(validJson())
  const service = makeService(client)
  const { candidate } = await draft(service)
  candidate.reviewStatus = 'published'
  const records = []
  class MemoryModel {
    constructor(document) {
      this.document = document
      this.validation = new CulturalEntry(document)
    }

    async validate() {
      return this.validation.validate()
    }

    static findOne(filter) {
      const match = records.find((record) => Object.entries(filter).every(([key, value]) => String(record[key]) === String(value)))
      return { select() { return { lean: async () => (match ? { _id: match._id } : null) } } }
    }

    static async create(document) {
      records.push({ ...document, _id: `memory-${records.length + 1}` })
      return records.at(-1)
    }
  }
  const countryId = new mongoose.Types.ObjectId()
  const report = await preparePilotImport({
    candidates: [candidate],
    apply: true,
    CountryModel: { findOne() { return { select() { return { lean: async () => ({ _id: countryId }) } } } } },
    CulturalEntryModel: MemoryModel,
    PlaceModel: Place,
    now,
  })
  assert.equal(report.created, 1)
  assert.equal(records[0].reviewStatus, 'pending_review')
  assert.deepEqual(records[0].generationMetadata, candidate.generationMetadata)
});

test('generation metadata schema is optional but validates all declared fields', async () => {
  const base = {
    country: new mongoose.Types.ObjectId(),
    category: 'history',
    title: 'Historical note',
    content: 'An original note.',
  }
  await new CulturalEntry(base).validate()
  const validMetadata = { provider: 'google-gemini', model: 'gemini-3.8-flash', promptVersion: 'prompt-v1', generatedAt: now }
  await new CulturalEntry({ ...base, generationMetadata: validMetadata }).validate()
  await new Place({ country: base.country, name: 'Place', generationMetadata: validMetadata }).validate()
  await assert.rejects(new CulturalEntry({ ...base, generationMetadata: { ...validMetadata, provider: 'unknown-provider' } }).validate())
  await assert.rejects(new CulturalEntry({ ...base, generationMetadata: { ...validMetadata, generatedAt: null } }).validate())
});
