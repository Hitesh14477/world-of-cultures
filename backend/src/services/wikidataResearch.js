import { assertImportAllowed, ImportPolicyError } from './importPolicyGate.js';
import { IMPORT_POLICY_REGISTRY, WIKIDATA_FACT_COLLECTION, WIKIDATA_SOURCE_ID } from './importPolicyRegistry.js';

export { WIKIDATA_FACT_COLLECTION, WIKIDATA_SOURCE_ID };

const WIKIDATA_API_URL = 'https://www.wikidata.org/w/api.php';
const MAX_PROPERTIES = 20;
const MAX_REFERENCE_ENTITIES = 50;
const PILOT_COUNTRIES = Object.freeze({ india: 'India', japan: 'Japan' });

function policyFor(registry) {
  return registry instanceof Map ? registry.get(WIKIDATA_SOURCE_ID) : registry?.[WIKIDATA_SOURCE_ID];
}

function validateDataLicense(policy) {
  if (!Array.isArray(policy?.hosts) || !policy.hosts.includes('www.wikidata.org')) {
    throw new ImportPolicyError('Wikidata research rejected: the policy does not cover the Wikidata API host.', 'SOURCE_HOST_NOT_PERMITTED');
  }
  const license = policy?.dataLicense;
  if (!license?.name || !license?.url || !license?.attributionText || !license?.scope) {
    throw new ImportPolicyError(
      'Wikidata research rejected: the approved policy must include verified data-license and attribution metadata.',
      'SOURCE_LICENSE_METADATA_MISSING',
    );
  }
  try {
    const licenseUrl = new URL(license.url);
    if (licenseUrl.protocol !== 'https:') throw new Error('invalid');
  } catch {
    throw new ImportPolicyError('Wikidata research rejected: the policy license URL is invalid.', 'SOURCE_LICENSE_METADATA_INVALID');
  }
  return license;
}

function normalizeEntityId(value) {
  return typeof value === 'string' && /^Q\d+$/.test(value);
}

function normalizePropertyId(value) {
  return typeof value === 'string' && /^P\d+$/.test(value);
}

function statementValue(datavalue, entities) {
  if (!datavalue || typeof datavalue !== 'object') return null;
  const value = datavalue.value;
  if (datavalue.type === 'wikibase-entityid' && normalizeEntityId(value?.id)) {
    const label = entities[value.id]?.labels?.en?.value;
    return {
      value: typeof label === 'string' ? label : value.id,
      valueUrl: `https://www.wikidata.org/wiki/${value.id}`,
      valueEntityId: value.id,
    };
  }
  if (datavalue.type === 'string' && typeof value === 'string' && value.trim()) return { value: value.trim() };
  if (datavalue.type === 'monolingualtext' && typeof value?.text === 'string' && value.text.trim()) {
    return { value: value.text.trim() };
  }
  if (datavalue.type === 'time' && typeof value?.time === 'string' && value.time.trim()) return { value: value.time.trim() };
  if (datavalue.type === 'quantity' && typeof value?.amount === 'string' && value.amount.trim()) return { value: value.amount.trim() };
  return null;
}

function statementReferences(statement) {
  const urls = new Set();
  const entityIds = new Set();
  for (const reference of statement.references || []) {
    for (const snak of reference.snaks?.P854 || []) {
      const url = snak.datavalue?.value;
      try {
        const parsed = new URL(url);
        if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) urls.add(parsed.href);
      } catch {
        // Invalid or non-HTTPS references are not evidence for an imported fact.
      }
    }
    for (const snak of reference.snaks?.P248 || []) {
      const entityId = snak.datavalue?.value?.id;
      if (normalizeEntityId(entityId)) entityIds.add(entityId);
    }
  }
  return { urls: [...urls], entityIds: [...entityIds] };
}

function referenceRecord(url, accessedAt) {
  return {
    title: 'Unreviewed source URL linked from a Wikidata statement',
    url,
    accessedAt,
  };
}

function sourceEntityRecord(entityId, entity, accessedAt) {
  const label = entity?.labels?.en?.value;
  return {
    title: typeof label === 'string' && label.trim()
      ? `Wikidata source item: ${label.trim()}`
      : `Wikidata source item ${entityId} (label unavailable)`,
    publisher: 'Wikidata source entity',
    url: `https://www.wikidata.org/wiki/${entityId}`,
    accessedAt,
  };
}

async function requestWikidataPayload(url, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'WorldOfCulturesBot/1.0 (https://github.com/Hitesh14477/world-of-cultures)',
      },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error('Wikidata could not be reached; no research facts were collected.');
  }
  if (!response.ok) {
    const retryAfter = response.headers?.get('Retry-After');
    const retryNote = response.status === 429 || response.status === 503
      ? retryAfter ? ` Respect Retry-After (${retryAfter}) before resuming.` : ' Wait before resuming.'
      : '';
    throw new Error(`Wikidata returned HTTP ${response.status}; no research facts were collected.${retryNote}`);
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('Wikidata returned invalid JSON; no research facts were collected.');
  }
  if (!payload?.entities || typeof payload.entities !== 'object') {
    throw new Error('Wikidata returned an unexpected response; no research facts were collected.');
  }
  return payload;
}

function makeWikidataUrl(ids, props) {
  const url = new URL(WIKIDATA_API_URL);
  url.searchParams.set('action', 'wbgetentities');
  url.searchParams.set('ids', [...new Set(ids)].join('|'));
  url.searchParams.set('props', props);
  url.searchParams.set('languages', 'en');
  url.searchParams.set('format', 'json');
  url.searchParams.set('maxlag', '5');
  return url;
}

/**
 * Collects referenced structured facts only. Editorial summaries and category
 * assignments are deliberately left to a human curator. The policy gate runs
 * before the network request, and an unregistered default policy fails closed.
 */
export async function collectWikidataFacts({
  countrySlug,
  entityId,
  propertyIds,
  fetchImpl = fetch,
  policyRegistry = IMPORT_POLICY_REGISTRY,
  now = new Date(),
} = {}) {
  if (!Object.hasOwn(PILOT_COUNTRIES, countrySlug)) throw new TypeError('The Wikidata pilot supports India and Japan only.');
  if (!normalizeEntityId(entityId)) throw new TypeError('Provide one valid Wikidata country entity ID.');
  if (!Array.isArray(propertyIds) || propertyIds.length === 0 || propertyIds.length > MAX_PROPERTIES || propertyIds.some((id) => !normalizePropertyId(id))) {
    throw new TypeError(`Provide between 1 and ${MAX_PROPERTIES} valid Wikidata property IDs.`);
  }
  const requestedIds = [...new Set([entityId, ...propertyIds])];

  assertImportAllowed({
    sourceIds: [WIKIDATA_SOURCE_ID],
    operationId: WIKIDATA_FACT_COLLECTION,
    use: 'structured_fact_research',
    storageMode: 'persistent_database',
    registry: policyRegistry,
    now,
  });
  const policy = policyFor(policyRegistry);
  const dataLicense = validateDataLicense(policy);

  const payload = await requestWikidataPayload(makeWikidataUrl(requestedIds, 'labels|claims'), fetchImpl);

  const accessedAt = (now instanceof Date ? now : new Date(now)).toISOString();
  const allowedProperties = new Set(propertyIds);
  const results = [];
  const entity = payload.entities[entityId];
  const entityLabel = entity?.labels?.en?.value;
  if (typeof entityLabel !== 'string' || entityLabel.toLocaleLowerCase() !== PILOT_COUNTRIES[countrySlug].toLocaleLowerCase()) {
    throw new Error('Wikidata entity did not match the requested pilot country; no research facts were collected.');
  }
  const facts = [];
  const pendingReferences = [];
  const lookupEntityIds = new Set();
  for (const [propertyId, statements] of Object.entries(entity.claims || {})) {
    if (!allowedProperties.has(propertyId)) continue;
    const propertyLabel = payload.entities[propertyId]?.labels?.en?.value || propertyId;
    for (const statement of statements || []) {
      const normalized = statementValue(statement.mainsnak?.datavalue, payload.entities);
      const references = statementReferences(statement);
      if (!normalized || references.urls.length === 0 && references.entityIds.length === 0) continue;
      const fact = {
        propertyId,
        propertyLabel,
        ...normalized,
        references: references.urls.map((sourceUrl) => referenceRecord(sourceUrl, accessedAt)),
      };
      pendingReferences.push({ fact, entityIds: references.entityIds });
      references.entityIds.forEach((referenceId) => lookupEntityIds.add(referenceId));
      if (normalized.valueEntityId) lookupEntityIds.add(normalized.valueEntityId);
    }
  }
  const requestedReferenceIds = [...lookupEntityIds].sort().slice(0, MAX_REFERENCE_ENTITIES);
  let referenceEntities = {};
  if (requestedReferenceIds.length) {
    const referencePayload = await requestWikidataPayload(makeWikidataUrl(requestedReferenceIds, 'labels'), fetchImpl);
    referenceEntities = referencePayload.entities;
  }
  const unresolvedLookupIds = new Set([...lookupEntityIds].filter((id) => !requestedReferenceIds.includes(id)));
  for (const { fact, entityIds: referencesForFact } of pendingReferences) {
    if (fact.valueEntityId) {
      const valueLabel = referenceEntities[fact.valueEntityId]?.labels?.en?.value;
      if (typeof valueLabel === 'string' && valueLabel.trim()) fact.value = valueLabel.trim();
      else unresolvedLookupIds.add(fact.valueEntityId);
      delete fact.valueEntityId;
    }
    for (const referenceId of referencesForFact) {
      const record = sourceEntityRecord(referenceId, referenceEntities[referenceId], accessedAt);
      if (record) fact.references.push(record);
      if (!referenceEntities[referenceId]?.labels?.en?.value) unresolvedLookupIds.add(referenceId);
    }
    if (fact.references.length) facts.push(fact);
  }
  if (!facts.length) return [];
  const source = {
    title: `${entityLabel} (Wikidata structured data)`,
    publisher: policy.name,
    url: `https://www.wikidata.org/wiki/${entityId}`,
    accessedAt,
    license: dataLicense.name,
    licenseUrl: dataLicense.url,
    attributionText: dataLicense.attributionText,
    licenseScope: dataLicense.scope,
  };
  return [{ countrySlug, entityId, entityLabel, source, facts, unresolvedLookupCount: unresolvedLookupIds.size }];
}
