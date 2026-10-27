import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import Country from '../models/Country.js';
import { connectDatabase } from '../config/database.js';
import { assertImportAllowed } from '../services/importPolicyGate.js';
import { COUNTRY_DIRECTORY_IMPORT, IMPORT_POLICY_REGISTRY, REST_COUNTRIES_SOURCE_ID } from '../services/importPolicyRegistry.js';
import {
  buildCountryImportPlan,
  normalizeSourceCountry,
  selectInScopeRecords,
} from '../services/countryImport.js';

const API_BASE_URL = 'https://api.restcountries.com/countries/v5';
const PAGE_SIZE = 100;

function sanitizeResponseExcerpt(body, apiKey) {
  let excerpt = String(body || '').replace(/\s+/g, ' ').trim();
  if (apiKey) excerpt = excerpt.replaceAll(apiKey, '[REDACTED]');
  return excerpt
    .replace(/Bearer\s+[^\s"',}]+/gi, 'Bearer [REDACTED]')
    .replace(/mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi, '[REDACTED_MONGODB_URI]')
    .replace(/(["']?(?:api[-_]?key|authorization|token|password|secret)["']?\s*[:=]\s*["']?)[^"',\s}]+/gi, '$1[REDACTED]')
    .slice(0, 240);
}

function responseDiagnostic(response, body, apiKey) {
  const contentType = response.headers.get('content-type') || '(missing)';
  const excerpt = sanitizeResponseExcerpt(body, apiKey) || '(empty response body)';
  return `HTTP ${response.status}; content-type: ${contentType}; response excerpt: "${excerpt}"`;
}

function sourceRecordsFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data?.objects)) return payload.data.objects;
  throw new Error('Country source file must contain a complete array of REST Countries records.');
}

async function readOfflineSource(filePath) {
  let payload;
  try {
    payload = JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    throw new Error('Could not read or parse COUNTRIES_SOURCE_FILE. No records were written.');
  }
  return sourceRecordsFromPayload(payload);
}

async function fetchRemoteSource(apiKey, fetchImpl = fetch) {
  if (!apiKey) {
    throw new Error('REST_COUNTRIES_API_KEY is required for the remote source. Add it locally to backend/.env, or use COUNTRIES_SOURCE_FILE for a complete saved response.');
  }

  const records = [];
  let offset = 0;
  let sourceTotal;
  let hasMore = true;
  let pages = 0;

  while (hasMore) {
    pages += 1;
    if (pages > 10) throw new Error('Country source pagination exceeded the safety limit. No records were written.');

    const url = new URL(API_BASE_URL);
    url.searchParams.set('limit', String(PAGE_SIZE));
    url.searchParams.set('offset', String(offset));

    let response;
    try {
      response = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new Error('REST Countries could not be reached. No records were written; use a complete COUNTRIES_SOURCE_FILE snapshot if available.');
    }

    const responseBody = await response.text();
    if (!response.ok) {
      throw new Error(`REST Countries request failed (${responseDiagnostic(response, responseBody, apiKey)}). Check the API key or service response. No records were written.`);
    }

    let payload;
    try {
      payload = JSON.parse(responseBody);
    } catch {
      throw new Error(`REST Countries returned invalid JSON (${responseDiagnostic(response, responseBody, apiKey)}). No records were written.`);
    }

    const pageRecords = payload?.data?.objects;
    const meta = payload?.data?.meta;
    if (!Array.isArray(pageRecords) || !Number.isInteger(meta?.total) || typeof meta.more !== 'boolean') {
      throw new Error(`REST Countries returned an unexpected JSON shape (${responseDiagnostic(response, responseBody, apiKey)}). No records were written.`);
    }

    if (sourceTotal === undefined) sourceTotal = meta.total;
    if (meta.total !== sourceTotal || pageRecords.length === 0 && meta.more) {
      throw new Error('REST Countries pagination was incomplete or inconsistent. No records were written.');
    }

    records.push(...pageRecords);
    offset += pageRecords.length;
    hasMore = meta.more;
  }

  if (records.length !== sourceTotal) {
    throw new Error('REST Countries did not return its complete advertised dataset. No records were written.');
  }
  return records;
}

function extractPartialWriteCounts(error) {
  const result = error?.result;
  return {
    imported: Number(result?.upsertedCount ?? result?.nUpserted ?? 0),
    updated: Number(result?.modifiedCount ?? result?.nModified ?? 0),
    failed: Array.isArray(error?.writeErrors) ? error.writeErrors.length : 0,
  };
}

export async function runCountryImport({
  sourcePath = process.env.COUNTRIES_SOURCE_FILE,
  apiKey = process.env.REST_COUNTRIES_API_KEY,
  CountryModel = Country,
  policyRegistry = IMPORT_POLICY_REGISTRY,
  fetchImpl = fetch,
  connectDatabaseFn = connectDatabase,
  policyNow = new Date(),
} = {}) {
  const summary = { imported: 0, updated: 0, skipped: 0, failed: 0 };
  let connected = false;

  try {
    assertImportAllowed({
      sourceIds: [REST_COUNTRIES_SOURCE_ID],
      operationId: COUNTRY_DIRECTORY_IMPORT,
      use: 'country_facts_import',
      storageMode: 'persistent_database',
      registry: policyRegistry,
      now: policyNow,
    });

    const rawRecords = sourcePath
      ? await readOfflineSource(sourcePath)
      : await fetchRemoteSource(apiKey, fetchImpl);
    const inScope = selectInScopeRecords(rawRecords);
    const normalized = [];

    for (const record of inScope) {
      try {
        normalized.push(normalizeSourceCountry(record));
      } catch {
        summary.skipped += 1;
      }
    }

    if (normalized.length !== 195) {
      summary.failed += 1;
      throw new Error(`Only ${normalized.length} of the 195 in-scope records were valid. No records were written.`);
    }

    connected = await connectDatabaseFn();
    if (!connected) throw new Error('MongoDB connection failed; no country records were written.');

    const codes = normalized.map((country) => country.cca2);
    const existing = await CountryModel.find({ cca2: { $in: codes } })
      .select('-_id -__v')
      .lean();
    const plan = buildCountryImportPlan(normalized, existing);
    summary.skipped += plan.skipped;

    if (plan.operations.length) {
      try {
        const result = await CountryModel.bulkWrite(plan.operations, { ordered: false });
        summary.imported = result.upsertedCount;
        summary.updated = result.modifiedCount;
        summary.skipped += result.matchedCount - result.modifiedCount;
      } catch (error) {
        const partial = extractPartialWriteCounts(error);
        summary.imported += partial.imported;
        summary.updated += partial.updated;
        summary.failed += partial.failed || plan.operations.length;
        throw new Error('One or more database writes failed. Any successful writes are safe to retry.');
      }
    }

    return summary;
  } catch (error) {
    if (summary.failed === 0) summary.failed = 1;
    throw Object.assign(new Error(error.message), { importSummary: summary });
  } finally {
    if (connected || mongoose.connection.readyState !== 0) {
      await mongoose.disconnect().catch(() => {});
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const summary = await runCountryImport();
    console.info('Country import complete:', summary);
  } catch (error) {
    console.error(`Country import stopped: ${error.message}`);
    console.info('Country import summary:', error.importSummary || { imported: 0, updated: 0, skipped: 0, failed: 1 });
    process.exitCode = 1;
  }
}
