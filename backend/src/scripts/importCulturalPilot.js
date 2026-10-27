import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { connectDatabase } from '../config/database.js';
import { assertImportAllowed, ImportPolicyError, resolveSourcePolicyId } from '../services/importPolicyGate.js';
import { CULTURAL_PILOT_IMPORT, IMPORT_POLICY_REGISTRY } from '../services/importPolicyRegistry.js';
import Country from '../models/Country.js';
import CulturalEntry, { CULTURAL_ENTRY_CATEGORIES } from '../models/CulturalEntry.js';
import Place, { PLACE_CATEGORIES } from '../models/Place.js';
import { culturalPilotCandidates } from './culturalPilotCandidates.js';

const REVIEW_STATUS = 'pending_review';
export const MAX_IMPORT_BATCH_COUNTRIES = 20;

export function selectCandidateBatch(candidates, countrySlugs, sourcePolicyId, policyRegistry = IMPORT_POLICY_REGISTRY) {
  let selectedCountries = candidates;
  if (countrySlugs !== undefined) {
    if (!Array.isArray(countrySlugs) || countrySlugs.length === 0) {
      throw new Error('A batch must include at least one country slug.');
    }
    if (countrySlugs.length > MAX_IMPORT_BATCH_COUNTRIES) {
      throw new Error(`A batch may include at most ${MAX_IMPORT_BATCH_COUNTRIES} countries.`);
    }
    const uniqueSlugs = [...new Set(countrySlugs)];
    if (uniqueSlugs.some((slug) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))) {
      throw new Error('Batch country slugs must be lowercase country slugs.');
    }
    const requested = new Set(uniqueSlugs);
    const found = new Set(candidates.filter((candidate) => requested.has(candidate.countrySlug)).map((candidate) => candidate.countrySlug));
    const missing = uniqueSlugs.filter((slug) => !found.has(slug));
    if (missing.length) throw new Error(`No candidate records are present for: ${missing.join(', ')}.`);
    selectedCountries = candidates.filter((candidate) => requested.has(candidate.countrySlug));
  }
  const selected = sourcePolicyId
    ? selectedCountries.filter((candidate) => candidate.sources?.some((source) => resolveSourcePolicyId(source.url, policyRegistry) === sourcePolicyId))
    : selectedCountries;
  if (sourcePolicyId && selected.length === 0) {
    throw new Error(`No candidate records use source policy "${sourcePolicyId}" in the selected batch.`);
  }
  return selected;
}

export function assertCulturalPilotImportAllowed({
  candidates = culturalPilotCandidates,
  policyRegistry = IMPORT_POLICY_REGISTRY,
  now = new Date(),
} = {}) {
  const sourceIds = new Set();
  for (const candidate of candidates) {
    for (const source of candidate.sources || []) {
      const sourceId = resolveSourcePolicyId(source.url, policyRegistry);
      if (!sourceId) {
        throw new ImportPolicyError('Import rejected: a candidate source has no registered policy.', 'SOURCE_POLICY_MISSING');
      }
      sourceIds.add(sourceId);
    }
  }

  assertImportAllowed({
    sourceIds: [...sourceIds],
    operationId: CULTURAL_PILOT_IMPORT,
    use: 'curated_cultural_content_import',
    storageMode: 'persistent_database',
    registry: policyRegistry,
    now,
  });

  for (const candidate of candidates) {
    for (const source of candidate.sources || []) {
      const sourceId = resolveSourcePolicyId(source.url, policyRegistry);
      const policy = policyRegistry instanceof Map ? policyRegistry.get(sourceId) : policyRegistry?.[sourceId];
      const license = policy?.dataLicense;
      if (!license) continue;
      if (
        source.publisher !== policy.name
        || source.license !== license.name
        || source.licenseUrl !== license.url
        || source.attributionText !== license.attributionText
        || source.licenseScope !== license.scope
      ) {
        throw new ImportPolicyError(
          'Import rejected: candidate source license and attribution fields do not match the verified source policy.',
          'SOURCE_LICENSE_METADATA_MISSING',
        );
      }
    }
  }
  return true;
}

function isHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateCandidate(candidate) {
  const errors = [];
  const isEntry = candidate.kind === 'culturalEntry';
  const isPlace = candidate.kind === 'place';

  if (!isEntry && !isPlace) errors.push('kind must be culturalEntry or place');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidate.countrySlug || '')) errors.push('countrySlug must be a lowercase slug');
  if (!/^[a-z0-9][a-z0-9:._/-]{0,179}$/i.test(candidate.sourceKey || '')) errors.push('sourceKey must be a stable non-empty identifier');

  if (isEntry) {
    if (!CULTURAL_ENTRY_CATEGORIES.includes(candidate.category)) errors.push('category is not supported by CulturalEntry');
    if (!candidate.title?.trim()) errors.push('title is required');
    if (!candidate.content?.trim()) errors.push('content is required');
  }
  if (isPlace) {
    if (!PLACE_CATEGORIES.includes(candidate.category)) errors.push('category is not supported by Place');
    if (!candidate.name?.trim()) errors.push('name is required');
    if (!candidate.description?.trim()) errors.push('description is required');
  }

  if (!Array.isArray(candidate.sources) || candidate.sources.length === 0) {
    errors.push('at least one source is required');
  } else {
    candidate.sources.forEach((source, index) => {
      const prefix = `sources[${index}]`;
      if (!source.title?.trim()) errors.push(`${prefix}.title is required`);
      if (!source.publisher?.trim()) errors.push(`${prefix}.publisher is required for attribution`);
      if (!isHttpsUrl(source.url)) errors.push(`${prefix}.url must be a valid HTTPS URL without embedded credentials`);
      if (!isIsoDate(source.accessedAt)) errors.push(`${prefix}.accessedAt must use YYYY-MM-DD`);
      if (source.license && (!isHttpsUrl(source.licenseUrl) || !source.attributionText?.trim() || !source.licenseScope?.trim())) {
        errors.push(`${prefix} license metadata requires an HTTPS licenseUrl, attributionText, and licenseScope`);
      }
      if (source.licenseUrl && !isHttpsUrl(source.licenseUrl)) errors.push(`${prefix}.licenseUrl must be a valid HTTPS URL`);
    });
  }

  if (candidate.imageAttributions?.length) {
    errors.push('imageAttributions must remain empty for this text-only pilot');
  }

  return errors;
}

function toModelDocument(candidate, countryId) {
  const { kind, countrySlug, ...fields } = candidate;
  return { ...fields, country: countryId, reviewStatus: REVIEW_STATUS };
}

function validationMessages(error) {
  if (error?.errors) {
    return Object.values(error.errors).map(({ path, message }) => `${path}: ${message}`);
  }
  return ['record failed model validation'];
}

async function findExisting(model, document, isEntry) {
  const stableMatch = await model.findOne({ country: document.country, sourceKey: document.sourceKey }).select('_id').lean();
  if (stableMatch) return 'sourceKey already exists';

  const titleMatch = isEntry
    ? await model.findOne({ country: document.country, category: document.category, title: document.title }).select('_id').lean()
    : await model.findOne({ country: document.country, name: document.name }).select('_id').lean();
  return titleMatch ? 'matching country/category/title already exists' : null;
}

export async function preparePilotImport({
  candidates = culturalPilotCandidates,
  countrySlugs,
  sourcePolicyId,
  apply = false,
  CountryModel = Country,
  CulturalEntryModel = CulturalEntry,
  PlaceModel = Place,
  policyRegistry = IMPORT_POLICY_REGISTRY,
  now = new Date(),
} = {}) {
  candidates = selectCandidateBatch(candidates, countrySlugs, sourcePolicyId, policyRegistry);
  assertCulturalPilotImportAllowed({ candidates, policyRegistry, now });

  const report = {
    mode: apply ? 'apply' : 'dry-run',
    created: 0,
    proposedCreates: [],
    skipped: [],
    validationErrors: [],
  };
  const ready = [];
  const candidateKeys = new Set();

  for (const candidate of candidates) {
    const label = candidate.title || candidate.name || '(untitled candidate)';
    const errors = validateCandidate(candidate);
    if (errors.length) {
      report.validationErrors.push({ countrySlug: candidate.countrySlug || null, label, errors });
      continue;
    }

    const naturalKey = candidate.kind === 'culturalEntry'
      ? `${candidate.countrySlug}:entry:${candidate.category}:${candidate.title.trim().toLocaleLowerCase()}`
      : `${candidate.countrySlug}:place:${candidate.name.trim().toLocaleLowerCase()}`;
    const stableKey = `${candidate.kind}:${candidate.countrySlug}:${candidate.sourceKey}`;
    if (candidateKeys.has(stableKey) || candidateKeys.has(naturalKey)) {
      report.skipped.push({ countrySlug: candidate.countrySlug, label, reason: 'duplicate candidate in this import batch' });
      continue;
    }

    const country = await CountryModel.findOne({ slug: candidate.countrySlug }).select('_id').lean();
    if (!country) {
      report.validationErrors.push({ countrySlug: candidate.countrySlug, label, errors: ['country slug was not found'] });
      continue;
    }

    const isEntry = candidate.kind === 'culturalEntry';
    const model = isEntry ? CulturalEntryModel : PlaceModel;
    const document = toModelDocument(candidate, country._id);
    try {
      await new model(document).validate();
    } catch (error) {
      report.validationErrors.push({ countrySlug: candidate.countrySlug, label, errors: validationMessages(error) });
      continue;
    }

    const duplicateReason = await findExisting(model, document, isEntry);
    if (duplicateReason) {
      report.skipped.push({ countrySlug: candidate.countrySlug, label, reason: duplicateReason });
      continue;
    }

    candidateKeys.add(stableKey);
    candidateKeys.add(naturalKey);
    ready.push({ model, document, countrySlug: candidate.countrySlug, label });
    report.proposedCreates.push({
      type: isEntry ? 'culturalEntry' : 'place',
      countrySlug: candidate.countrySlug,
      label,
      sourceKey: candidate.sourceKey,
      reviewStatus: REVIEW_STATUS,
    });
  }

  if (apply && report.validationErrors.length === 0) {
    for (const item of ready) {
      try {
        await item.model.create(item.document);
        report.created += 1;
      } catch (error) {
        // A duplicate index race is reported without logging driver details.
        if (error?.code === 11000) {
          report.skipped.push({ countrySlug: item.countrySlug, label: item.label, reason: 'duplicate detected during insert' });
        } else {
          report.validationErrors.push({ countrySlug: item.countrySlug, label: item.label, errors: ['insert failed; database details were suppressed'] });
        }
      }
    }
    report.proposedCreates = [];
  }

  return report;
}

function parseOptions(args) {
  const modes = args.filter((arg) => arg === '--dry-run' || arg === '--apply');
  const countryArg = args.find((arg) => arg.startsWith('--countries='));
  const sourceArg = args.find((arg) => arg.startsWith('--source-id='));
  const unknown = args.filter((arg) => !['--dry-run', '--apply'].includes(arg) && arg !== countryArg && arg !== sourceArg);
  if (
    unknown.length
    || modes.length > 1
    || args.filter((arg) => arg.startsWith('--countries=')).length > 1
    || args.filter((arg) => arg.startsWith('--source-id=')).length > 1
  ) return null;
  const sourcePolicyId = sourceArg?.slice('--source-id='.length);
  if (sourcePolicyId && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(sourcePolicyId)) return null;
  let countrySlugs;
  if (countryArg) {
    countrySlugs = countryArg.slice('--countries='.length).split(',').map((slug) => slug.trim()).filter(Boolean);
    if (!countrySlugs.length) return null;
  }
  try {
    selectCandidateBatch(culturalPilotCandidates, countrySlugs, sourcePolicyId);
  } catch {
    return null;
  }
  return { mode: modes[0] === '--apply' ? 'apply' : 'dry-run', countrySlugs, sourcePolicyId };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (!options) {
    console.error(`Usage: npm run import:cultural-pilot -- [--dry-run|--apply] [--countries=slug,slug] [--source-id=policy-id] (maximum ${MAX_IMPORT_BATCH_COUNTRIES} countries)`);
    process.exitCode = 2;
    return;
  }

  dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || '.env' });
  try {
    const candidates = selectCandidateBatch(culturalPilotCandidates, options.countrySlugs, options.sourcePolicyId);
    assertCulturalPilotImportAllowed({ candidates });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  const connected = await connectDatabase();
  if (!connected) {
    console.error('Pilot import stopped; database connection is unavailable. No credentials were displayed.');
    process.exitCode = 1;
    return;
  }

  try {
    try {
      const report = await preparePilotImport({
        apply: options.mode === 'apply',
        countrySlugs: options.countrySlugs,
        sourcePolicyId: options.sourcePolicyId,
      });
      console.log(JSON.stringify(report, null, 2));
      if (report.validationErrors.length) process.exitCode = 1;
    } catch {
      console.error('Pilot import stopped because a database operation failed. Database details were suppressed.');
      process.exitCode = 1;
    }
  } finally {
    await mongoose.disconnect();
  }
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) await main();
