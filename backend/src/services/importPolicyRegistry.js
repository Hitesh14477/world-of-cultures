// This registry records reviewed terms; an accessible endpoint is not evidence
// that its data may be stored or redistributed. Approval is operation-specific.
export const REST_COUNTRIES_SOURCE_ID = 'rest-countries-api-v5'
export const UNESCO_WHC_SOURCE_ID = 'unesco-world-heritage-centre'
export const UNESCO_ICH_SOURCE_ID = 'unesco-intangible-cultural-heritage'
export const WIKIDATA_SOURCE_ID = 'wikidata-structured-data'

export const COUNTRY_DIRECTORY_IMPORT = 'country-directory-import'
export const CULTURAL_PILOT_IMPORT = 'cultural-pilot-import'
export const WIKIDATA_FACT_COLLECTION = 'wikidata-cultural-fact-research'

export const IMPORT_POLICY_REGISTRY = Object.freeze({
  [REST_COUNTRIES_SOURCE_ID]: Object.freeze({
    sourceId: REST_COUNTRIES_SOURCE_ID,
    name: 'REST Countries API v5',
    policyReference: 'https://restcountries.com/legal/terms-of-service',
    verificationStatus: 'verified',
    reviewedAt: '2026-10-26',
    // Internal re-review deadline, not a source-provided expiry date.
    reviewDueAt: '2026-11-25',
    hosts: Object.freeze(['restcountries.com', 'api.restcountries.com']),
    permittedUses: Object.freeze(['in_product_api_request', 'attributed_display']),
    storageModes: Object.freeze(['transient_cache']),
    maxRetentionDays: 3,
    attributionRequirements: Object.freeze([
      'Public display requires reasonable attribution to REST Countries with a link.',
    ]),
    licensingRequirements: 'Provider terms govern API responses; no persistent dataset license is recorded.',
    approvedOperations: Object.freeze([]),
  }),
  [UNESCO_WHC_SOURCE_ID]: Object.freeze({
    sourceId: UNESCO_WHC_SOURCE_ID,
    name: 'UNESCO World Heritage Centre',
    policyReference: 'https://whc.unesco.org/en/disclaimer/',
    verificationStatus: 'unverified',
    reviewedAt: '2026-10-26',
    reviewDueAt: '2026-11-25',
    hosts: Object.freeze(['whc.unesco.org']),
    permittedUses: Object.freeze(['link_and_reference']),
    storageModes: Object.freeze([]),
    maxRetentionDays: null,
    attributionRequirements: Object.freeze(['Link to the source; check any asset-specific credit.']),
    licensingRequirements: 'No blanket permission to reproduce site content or media is recorded.',
    approvedOperations: Object.freeze([]),
  }),
  [UNESCO_ICH_SOURCE_ID]: Object.freeze({
    sourceId: UNESCO_ICH_SOURCE_ID,
    name: 'UNESCO Intangible Cultural Heritage',
    policyReference: 'https://ich.unesco.org/en/guidance-note-on-inventorying-00966',
    verificationStatus: 'unverified',
    reviewedAt: '2026-10-26',
    reviewDueAt: '2026-11-25',
    hosts: Object.freeze(['ich.unesco.org']),
    permittedUses: Object.freeze(['link_and_reference']),
    storageModes: Object.freeze([]),
    maxRetentionDays: null,
    attributionRequirements: Object.freeze(['Link to the source; assess community and media rights separately.']),
    licensingRequirements: 'No blanket permission to reproduce record text or media is recorded.',
    approvedOperations: Object.freeze([]),
  }),
  [WIKIDATA_SOURCE_ID]: Object.freeze({
    sourceId: WIKIDATA_SOURCE_ID,
    name: 'Wikidata structured data',
    policyReference: 'https://www.wikidata.org/wiki/Wikidata:Licensing',
    policyReferences: Object.freeze([
      'https://www.wikidata.org/wiki/Wikidata:Licensing',
      'https://www.mediawiki.org/wiki/Wikimedia_APIs/Access_policy',
      'https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_API_Usage_Guidelines',
      'https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits',
      'https://foundation.wikimedia.org/wiki/Terms_of_Use',
    ]),
    verificationStatus: 'verified',
    reviewedAt: '2026-10-26',
    // Internal re-review deadline, not a source-provided expiry date.
    reviewDueAt: '2027-01-25',
    hosts: Object.freeze(['www.wikidata.org', 'wikidata.org']),
    permittedUses: Object.freeze([
      'structured_fact_research',
      'curated_cultural_content_import',
      'attributed_display',
    ]),
    storageModes: Object.freeze(['persistent_database']),
    maxRetentionDays: null,
    attributionRequirements: Object.freeze([
      'CC0 does not require attribution; retain the Wikidata entity URL, item label, access date, and linked statement references for provenance and editorial review.',
      'This policy covers Wikidata structured data only; do not use it to import Wikipedia article prose or Wikimedia Commons media.',
      'Follow current Wikimedia API identification, rate-limit, and retry guidance.',
    ]),
    licensingRequirements: 'Wikidata states its structured data is CC0 1.0. Text in other namespaces is CC BY-SA 4.0; Commons media is governed by each file page license. This policy covers only structured data returned by the Wikidata API.',
    dataLicense: Object.freeze({
      name: 'CC0 1.0 Universal',
      url: 'https://creativecommons.org/publicdomain/zero/1.0/',
      attributionText: 'Data: Wikidata (CC0 1.0); attribution retained as provenance.',
      scope: 'Structured data only; excludes wiki article text, external referenced works, and Wikimedia Commons media.',
    }),
    approvedOperations: Object.freeze([WIKIDATA_FACT_COLLECTION, CULTURAL_PILOT_IMPORT]),
  }),
})
