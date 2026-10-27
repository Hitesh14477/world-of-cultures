import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import CulturalEntry from '../src/models/CulturalEntry.js';
import Place from '../src/models/Place.js';
import { culturalPilotCandidates } from '../src/scripts/culturalPilotCandidates.js';
import { assertCulturalPilotImportAllowed, preparePilotImport, selectCandidateBatch, validateCandidate, MAX_IMPORT_BATCH_COUNTRIES } from '../src/scripts/importCulturalPilot.js';
import { CULTURAL_PILOT_IMPORT, WIKIDATA_SOURCE_ID } from '../src/services/importPolicyRegistry.js';
import { resolveSourcePolicyId } from '../src/services/importPolicyGate.js';

test('all ten research candidates pass structural validation without database access', () => {
  assert.equal(culturalPilotCandidates.length, 10);
  for (const candidate of culturalPilotCandidates) {
    assert.deepEqual(validateCandidate(candidate), [], candidate.title || candidate.name);
  }
});

test('Wikidata-only selection excludes blocked UNESCO candidates and the India candidate passes the real gate', async () => {
  const candidates = selectCandidateBatch(culturalPilotCandidates, ['india', 'japan'], WIKIDATA_SOURCE_ID);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].countrySlug, 'india');
  assert.equal(candidates[0].category, 'languages_and_dialects');
  assert.equal(candidates[0].facts.length, 2);
  assert.equal(assertCulturalPilotImportAllowed({ candidates }), true);

  const countryId = new mongoose.Types.ObjectId();
  const report = await preparePilotImport({
    candidates,
    apply: false,
    CountryModel: {
      findOne({ slug }) {
        return { select() { return { lean: async () => slug === 'india' ? { _id: countryId } : null }; } };
      },
    },
    CulturalEntryModel: memoryModel([], CulturalEntry),
    PlaceModel: memoryModel([], Place),
    now: new Date('2026-10-27T12:00:00.000Z'),
  });
  assert.equal(report.mode, 'dry-run');
  assert.equal(report.created, 0);
  assert.equal(report.validationErrors.length, 0);
  assert.deepEqual(report.proposedCreates.map(({ countrySlug, reviewStatus }) => ({ countrySlug, reviewStatus })), [
    { countrySlug: 'india', reviewStatus: 'pending_review' },
  ]);
});

test('cultural pilot imports fail closed for unverified UNESCO source policies before database access', async () => {
  assert.throws(() => assertCulturalPilotImportAllowed(), /unverified/);
  await assert.rejects(preparePilotImport({ apply: true }), /unverified/);
});

test('rejects unsupported categories, unsafe source URLs, missing publisher, and incomplete license attribution', () => {
  const invalid = {
    ...culturalPilotCandidates[0],
    category: 'invented_category',
    sources: [{
      ...culturalPilotCandidates[0].sources[0],
      url: 'javascript:alert(1)',
      publisher: '',
      license: 'CC BY-SA',
      licenseUrl: '',
    }],
  };
  const errors = validateCandidate(invalid);
  assert.ok(errors.some((error) => error.includes('category')));
  assert.ok(errors.some((error) => error.includes('HTTPS URL')));
  assert.ok(errors.some((error) => error.includes('publisher')));
  assert.ok(errors.some((error) => error.includes('license metadata')));
});

test('pilot documents validate against existing models and remain pending review', async () => {
  const country = new mongoose.Types.ObjectId();
  for (const candidate of culturalPilotCandidates) {
    const { kind, countrySlug, ...fields } = candidate;
    const model = kind === 'culturalEntry' ? CulturalEntry : Place;
    const document = new model({ ...fields, country, reviewStatus: 'pending_review' });
    await document.validate();
    assert.equal(document.reviewStatus, 'pending_review');
    assert.equal(document.sourceKey, candidate.sourceKey);
  }
});

test('stable source key indexes apply only to records that have a source key', () => {
  for (const schema of [CulturalEntry.schema, Place.schema]) {
    const index = schema.indexes().find(([, options]) => options.unique && options.partialFilterExpression?.sourceKey);
    assert.ok(index);
    assert.deepEqual(index[0], { country: 1, sourceKey: 1 });
    assert.deepEqual(index[1].partialFilterExpression, { sourceKey: { $type: 'string' } });
  }
});

test('source license fields are optional and persist on citations when explicitly known', async () => {
  const place = new Place({
    country: new mongoose.Types.ObjectId(),
    name: 'Licensed description source',
    category: 'heritage_site',
    sources: [{
      title: 'Source title',
      publisher: 'UNESCO World Heritage Centre',
      url: 'https://whc.unesco.org/en/list/252/',
      accessedAt: '2026-10-26',
      license: 'CC BY-SA 3.0 IGO',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/igo/',
      attributionText: 'UNESCO World Heritage Centre, source title, CC BY-SA 3.0 IGO.',
      licenseScope: 'Page description only; not media.',
    }],
  });
  await place.validate();
  assert.equal(place.sources[0].license, 'CC BY-SA 3.0 IGO');
  assert.equal(place.sources[0].licenseScope, 'Page description only; not media.');
});

test('country batches are bounded, deterministic, and reject malformed or missing slugs', () => {
  const india = selectCandidateBatch(culturalPilotCandidates, ['india']);
  assert.ok(india.length > 0);
  assert.ok(india.every((candidate) => candidate.countrySlug === 'india'));
  assert.throws(() => selectCandidateBatch(culturalPilotCandidates, ['not-a-candidate-country']), /No candidate records/);
  assert.throws(() => selectCandidateBatch(culturalPilotCandidates, ['India']), /lowercase/);
  assert.throws(() => selectCandidateBatch(culturalPilotCandidates, Array.from({ length: MAX_IMPORT_BATCH_COUNTRIES + 1 }, (_, index) => `country-${index}`)), /at most/);
});

function approvedTestPolicies(candidates) {
  const registry = {};
  for (const candidate of candidates) {
    for (const source of candidate.sources) {
      const sourceId = resolveSourcePolicyId(source.url);
      registry[sourceId] = {
        sourceId,
        name: 'Test-only policy approval',
        hosts: [new URL(source.url).hostname],
        policyReference: 'https://example.org/test-policy',
        verificationStatus: 'verified',
        reviewedAt: '2026-10-01',
        reviewDueAt: '2026-11-30',
        permittedUses: ['curated_cultural_content_import'],
        storageModes: ['persistent_database'],
        maxRetentionDays: null,
        attributionRequirements: ['Test fixture only.'],
        licensingRequirements: 'Test fixture only; not a production permission claim.',
        approvedOperations: [CULTURAL_PILOT_IMPORT],
      };
    }
  }
  return registry;
}

function memoryModel(records, RealModel) {
  return class MemoryModel {
    constructor(document) {
      this.document = document;
      this.validatedDocument = new RealModel(document);
    }

    async validate() {
      return this.validatedDocument.validate();
    }

    static findOne(filter) {
      const match = records.find((record) => Object.entries(filter).every(([key, value]) => String(record[key]) === String(value)));
      return { select() { return { lean: async () => match ? { _id: match._id || 'existing' } : null }; } };
    }

    static async create(document) {
      records.push({ ...document, _id: `memory-${records.length + 1}` });
      return records.at(-1);
    }
  };
}

test('batch import resumes safely and preserves existing published records', async () => {
  const candidates = selectCandidateBatch(culturalPilotCandidates, ['india']);
  const countryIds = new Map([['india', new mongoose.Types.ObjectId()]]);
  const existingIndiaYoga = candidates.find((candidate) => candidate.title === 'Yoga');
  const entryRecords = [{
    _id: 'curated-yoga',
    country: countryIds.get('india'),
    sourceKey: existingIndiaYoga.sourceKey,
    category: existingIndiaYoga.category,
    title: 'Curated Yoga title',
    reviewStatus: 'published',
  }];
  const placeRecords = [];
  const CountryModel = {
    findOne({ slug }) {
      return { select() { return { lean: async () => countryIds.has(slug) ? { _id: countryIds.get(slug) } : null }; } };
    },
  };
  const policyRegistry = approvedTestPolicies(candidates);
  const options = {
    candidates,
    countrySlugs: ['india'],
    apply: true,
    policyRegistry,
    now: new Date('2026-10-27T12:00:00.000Z'),
    CountryModel,
    CulturalEntryModel: memoryModel(entryRecords, CulturalEntry),
    PlaceModel: memoryModel(placeRecords, Place),
  };

  const first = await preparePilotImport(options);
  assert.equal(first.created, 3);
  assert.equal(entryRecords[0].title, 'Curated Yoga title');
  assert.equal(entryRecords[0].reviewStatus, 'published');
  assert.ok(entryRecords.slice(1).every((record) => record.country === countryIds.get('india') && record.reviewStatus === 'pending_review'));
  assert.ok(placeRecords.every((record) => record.country === countryIds.get('india') && record.reviewStatus === 'pending_review'));

  const resumed = await preparePilotImport(options);
  assert.equal(resumed.created, 0);
  assert.equal(entryRecords.length, 3);
  assert.equal(placeRecords.length, 1);
  assert.equal(entryRecords[0].title, 'Curated Yoga title');
});
