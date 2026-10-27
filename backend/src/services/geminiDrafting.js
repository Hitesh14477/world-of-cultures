import { createHash } from 'node:crypto'
import { GoogleGenAI } from '@google/genai'
import CulturalEntry, { CULTURAL_ENTRY_CATEGORIES } from '../models/CulturalEntry.js'
import { assertImportAllowed, resolveSourcePolicyId } from './importPolicyGate.js'
import {
  CULTURAL_PILOT_IMPORT,
  IMPORT_POLICY_REGISTRY,
  WIKIDATA_FACT_COLLECTION,
  WIKIDATA_SOURCE_ID,
} from './importPolicyRegistry.js'
import { collectWikidataFacts } from './wikidataResearch.js'

export const GEMINI_DRAFT_MODEL = 'gemini-3.8-flash'
export const GEMINI_DRAFT_PROMPT_VERSION = 'evidence-only-cultural-entry-v1'
export const MIN_REFERENCED_FACTS = 2

const PILOT_COUNTRY_ENTITIES = Object.freeze({
  india: { entityId: 'Q668', entityLabel: 'India' },
  japan: { entityId: 'Q17', entityLabel: 'Japan' },
})

const RESPONSE_SCHEMA = Object.freeze({
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    summary: { type: 'STRING' },
    content: { type: 'STRING' },
    factIds: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['title', 'summary', 'content', 'factIds'],
  propertyOrdering: ['title', 'summary', 'content', 'factIds'],
})

export class GeminiConfigurationError extends Error {
  constructor(message = 'Gemini drafting is not configured. Set GEMINI_API_KEY in backend/.env.') {
    super(message)
    this.name = 'GeminiConfigurationError'
    this.code = 'GEMINI_CONFIGURATION_MISSING'
  }
}

export class GeminiDraftError extends Error {
  constructor(message, code = 'GEMINI_DRAFT_INVALID') {
    super(message)
    this.name = 'GeminiDraftError'
    this.code = code
  }
}

function validHttpsUrl(value) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password
  } catch {
    return false
  }
}

function accessedDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) throw new GeminiDraftError('Approved evidence has an invalid access date.', 'EVIDENCE_INVALID')
  return date.toISOString().slice(0, 10)
}

function policyLicenseMetadata(policy) {
  const license = policy?.dataLicense
  if (!license?.name || !validHttpsUrl(license.url) || !license.attributionText || !license.scope) {
    throw new GeminiDraftError('The approved source policy lacks usable license metadata.', 'SOURCE_LICENSE_METADATA_MISSING')
  }
  return {
    publisher: policy.name,
    license: license.name,
    licenseUrl: license.url,
    attributionText: license.attributionText,
    licenseScope: license.scope,
  }
}

function makeSourceReference(reference, policyRegistry, licenseMetadata) {
  const sourceId = resolveSourcePolicyId(reference?.url, policyRegistry)
  if (sourceId !== WIKIDATA_SOURCE_ID || !validHttpsUrl(reference?.url)) return null
  if (typeof reference.title !== 'string' || !reference.title.trim()) return null
  return {
    title: reference.title.trim().slice(0, 200),
    url: reference.url,
    accessedAt: accessedDate(reference.accessedAt),
    ...licenseMetadata,
  }
}

function normalizeResearch(research, category, policyRegistry, now) {
  if (!research || !Object.hasOwn(PILOT_COUNTRY_ENTITIES, research.countrySlug)) {
    throw new GeminiDraftError('Evidence must identify a country from the approved research collector.', 'EVIDENCE_INVALID')
  }
  const expectedCountry = PILOT_COUNTRY_ENTITIES[research.countrySlug]
  if (research.entityId !== expectedCountry.entityId || research.entityLabel !== expectedCountry.entityLabel) {
    throw new GeminiDraftError('Evidence country identity does not match the existing research collector.', 'EVIDENCE_INVALID')
  }
  if (!CULTURAL_ENTRY_CATEGORIES.includes(category)) {
    throw new GeminiDraftError('The requested category is not supported by CulturalEntry.', 'CATEGORY_INVALID')
  }

  const sourceId = resolveSourcePolicyId(research.source?.url, policyRegistry)
  if (!sourceId) throw new GeminiDraftError('Evidence source has no registered source policy.', 'SOURCE_POLICY_MISSING')
  assertImportAllowed({
    sourceIds: [sourceId],
    operationId: WIKIDATA_FACT_COLLECTION,
    use: 'structured_fact_research',
    storageMode: 'persistent_database',
    registry: policyRegistry,
    now,
  })
  assertImportAllowed({
    sourceIds: [sourceId],
    operationId: CULTURAL_PILOT_IMPORT,
    use: 'curated_cultural_content_import',
    storageMode: 'persistent_database',
    registry: policyRegistry,
    now,
  })
  if (sourceId !== WIKIDATA_SOURCE_ID) {
    throw new GeminiDraftError('Gemini drafting currently accepts only Wikidata structured evidence.', 'SOURCE_NOT_SUPPORTED')
  }

  const policy = policyRegistry instanceof Map ? policyRegistry.get(sourceId) : policyRegistry?.[sourceId]
  const licenseMetadata = policyLicenseMetadata(policy)
  if (
    !policy.hosts?.includes(new URL(research.source.url).hostname)
    || research.source.publisher !== policy.name
    || research.source.license !== policy.dataLicense.name
    || research.source.licenseUrl !== policy.dataLicense.url
    || research.source.attributionText !== policy.dataLicense.attributionText
    || research.source.licenseScope !== policy.dataLicense.scope
  ) {
    throw new GeminiDraftError('Evidence source metadata does not match the approved Wikidata policy.', 'SOURCE_LICENSE_METADATA_MISMATCH')
  }
  const expectedEntityUrl = `https://www.wikidata.org/wiki/${research.entityId || ''}`
  if (!/^Q\d+$/.test(research.entityId || '') || research.source.url !== expectedEntityUrl) {
    throw new GeminiDraftError('Evidence entity and source URL do not match.', 'EVIDENCE_INVALID')
  }

  const primarySource = makeSourceReference(research.source, policyRegistry, licenseMetadata)
  if (!primarySource) throw new GeminiDraftError('The Wikidata source reference is invalid.', 'EVIDENCE_INVALID')

  const facts = []
  const sourceReferences = new Map([[primarySource.url, primarySource]])
  for (const [index, fact] of (Array.isArray(research.facts) ? research.facts : []).entries()) {
    if (!/^P\d+$/.test(fact?.propertyId || '') || typeof fact.propertyLabel !== 'string' || !fact.propertyLabel.trim()) continue
    if (typeof fact.value !== 'string' || !fact.value.trim() || fact.value.length > 1000) continue
    const references = (Array.isArray(fact.references) ? fact.references : [])
      .map((reference) => makeSourceReference(reference, policyRegistry, licenseMetadata))
      .filter(Boolean)
    if (!references.length) continue
    const normalizedFact = {
      propertyId: fact.propertyId,
      propertyLabel: fact.propertyLabel.trim().slice(0, 160),
      value: fact.value.trim(),
      ...(validHttpsUrl(fact.valueUrl) && resolveSourcePolicyId(fact.valueUrl, policyRegistry) === WIKIDATA_SOURCE_ID
        ? { valueUrl: fact.valueUrl }
        : {}),
      references,
    }
    const factId = `fact-${facts.length + 1}`
    facts.push({ factId, record: normalizedFact })
    references.forEach((reference) => sourceReferences.set(reference.url, reference))
  }

  return {
    countrySlug: research.countrySlug,
    countryName: research.entityLabel,
    entityId: research.entityId,
    category,
    facts,
    sources: [...sourceReferences.values()],
  }
}

function buildPrompt(evidence) {
  const facts = evidence.facts.map(({ factId, record }) => ({
    factId,
    property: record.propertyLabel,
    value: record.value,
    sourceReferences: record.references.map(({ title, url }) => ({ title, url })),
  }))
  return [
    'Write a short, original cultural encyclopedia draft using only the supplied Wikidata structured facts.',
    'The facts are evidence, not an invitation to add background knowledge. Do not add any factual claim, dates, regional interpretation, stereotype, quotation, or citation that is not directly supported by these facts.',
    'Do not use tools, browse, search, or request additional sources. Do not invent or return source metadata.',
    'If the facts do not support a useful explanation for this category, return empty title, summary, and content strings and an empty factIds array.',
    'For every fact used, include its supplied factId. Return JSON only, using exactly title, summary, content, and factIds.',
    `Country: ${evidence.countryName}`,
    `Category: ${evidence.category}`,
    `Evidence: ${JSON.stringify(facts)}`,
  ].join('\n\n')
}

function validateModelDraft(text, facts) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new GeminiDraftError('Gemini returned no structured draft.', 'GEMINI_RESPONSE_INVALID')
  }
  let draft
  try {
    draft = JSON.parse(text)
  } catch {
    throw new GeminiDraftError('Gemini returned malformed JSON; no draft was created.', 'GEMINI_RESPONSE_INVALID')
  }
  const allowedKeys = ['title', 'summary', 'content', 'factIds']
  if (
    !draft || typeof draft !== 'object' || Array.isArray(draft)
    || Object.keys(draft).some((key) => !allowedKeys.includes(key))
    || allowedKeys.some((key) => !Object.hasOwn(draft, key))
  ) {
    throw new GeminiDraftError('Gemini response does not match the required draft structure.', 'GEMINI_RESPONSE_INVALID')
  }
  if (
    draft.title === '' && draft.summary === '' && draft.content === ''
    && Array.isArray(draft.factIds) && draft.factIds.length === 0
  ) return { status: 'insufficient_evidence' }
  const title = typeof draft.title === 'string' ? draft.title.trim() : ''
  const summary = typeof draft.summary === 'string' ? draft.summary.trim() : ''
  const content = typeof draft.content === 'string' ? draft.content.trim() : ''
  if (
    !title || title.length > 180
    || !summary || summary.length > 600
    || !content || content.length > 20000
    || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(`${title}${summary}${content}`)
    || !Array.isArray(draft.factIds)
    || draft.factIds.length < MIN_REFERENCED_FACTS
    || draft.factIds.length > facts.length
    || draft.factIds.some((id) => typeof id !== 'string')
    || new Set(draft.factIds).size !== draft.factIds.length
  ) {
    throw new GeminiDraftError('Gemini draft fields are empty, too long, or invalid.', 'GEMINI_RESPONSE_INVALID')
  }
  const factsById = new Map(facts.map(({ factId, record }) => [factId, record]))
  if (draft.factIds.some((factId) => !factsById.has(factId))) {
    throw new GeminiDraftError('Gemini cited a fact ID that was not in the approved evidence.', 'UNKNOWN_FACT_ID')
  }
  return { title, summary, content, facts: draft.factIds.map((factId) => factsById.get(factId)) }
}

function stableSourceKey(evidence, facts) {
  const factFingerprint = facts
    .map((fact) => `${fact.propertyId}:${fact.valueUrl || fact.value}`)
    .sort()
    .join('|')
  const digest = createHash('sha256').update(factFingerprint).digest('hex').slice(0, 20)
  return `wikidata:${evidence.entityId}:${evidence.category}:${digest}`
}

export function createGeminiDraftingService({
  apiKey = process.env.GEMINI_API_KEY,
  client,
  evidenceCollector = collectWikidataFacts,
  model = GEMINI_DRAFT_MODEL,
  now = () => new Date(),
  policyRegistry = IMPORT_POLICY_REGISTRY,
} = {}) {
  return {
    async draftCulturalEntry({ countrySlug, entityId, propertyIds, category } = {}) {
      if (typeof apiKey !== 'string' || !apiKey.trim()) throw new GeminiConfigurationError()
      if (!CULTURAL_ENTRY_CATEGORIES.includes(category)) {
        throw new GeminiDraftError('The requested category is not supported by CulturalEntry.', 'CATEGORY_INVALID')
      }
      const researchRows = await evidenceCollector({
        countrySlug,
        entityId,
        propertyIds,
        policyRegistry,
        now: now(),
      })
      if (!Array.isArray(researchRows)) {
        throw new GeminiDraftError('The approved collector returned an invalid evidence result.', 'EVIDENCE_INVALID')
      }
      if (researchRows.length === 0) {
        return {
          status: 'insufficient_evidence',
          message: `The approved collector found no referenced facts for ${category}; Gemini was not called.`,
          candidate: null,
        }
      }
      if (researchRows.length !== 1) {
        throw new GeminiDraftError('The approved collector returned an unexpected number of country results.', 'EVIDENCE_INVALID')
      }
      const research = researchRows[0]
      if (research.countrySlug !== countrySlug || research.entityId !== entityId) {
        throw new GeminiDraftError('Collector result does not match the requested country.', 'EVIDENCE_INVALID')
      }
      const evidence = normalizeResearch(research, category, policyRegistry, now())
      if (evidence.facts.length < MIN_REFERENCED_FACTS) {
        return {
          status: 'insufficient_evidence',
          message: `At least ${MIN_REFERENCED_FACTS} referenced facts from approved sources are required; none were sent to Gemini.`,
          candidate: null,
        }
      }

      const geminiClient = client || new GoogleGenAI({ apiKey })
      let response
      try {
        response = await geminiClient.models.generateContent({
          model,
          contents: buildPrompt(evidence),
          config: {
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
          },
        })
      } catch {
        throw new GeminiDraftError('Gemini drafting request failed; no draft was created.', 'GEMINI_REQUEST_FAILED')
      }

      const generated = validateModelDraft(response?.text, evidence.facts)
      if (generated.status === 'insufficient_evidence') {
        return {
          status: 'insufficient_evidence',
          message: 'Gemini could not draft a useful explanation from the approved evidence; no candidate was created.',
          candidate: null,
        }
      }
      const generatedAt = now()
      const modelUsed = typeof response?.modelVersion === 'string' && response.modelVersion.trim()
        ? response.modelVersion.trim()
        : model
      const candidate = {
        kind: 'culturalEntry',
        countrySlug: evidence.countrySlug,
        sourceKey: stableSourceKey(evidence, generated.facts),
        category: evidence.category,
        title: generated.title,
        summary: generated.summary,
        content: generated.content,
        sources: evidence.sources,
        facts: generated.facts,
        imageAttributions: [],
        generationMetadata: {
          provider: 'google-gemini',
          model: modelUsed,
          promptVersion: GEMINI_DRAFT_PROMPT_VERSION,
          generatedAt,
        },
        reviewStatus: 'pending_review',
      }
      try {
        const { kind, countrySlug, ...document } = candidate
        await new CulturalEntry({ ...document, country: '000000000000000000000001' }).validate()
      } catch {
        throw new GeminiDraftError('Generated draft failed CulturalEntry schema validation.', 'GEMINI_DRAFT_SCHEMA_INVALID')
      }
      return { status: 'drafted', candidate }
    },
  }
}
