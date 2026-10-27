import test from 'node:test'
import assert from 'node:assert/strict'
import { runCountryImport } from '../src/scripts/importCountries.js'
import { assertImportAllowed, ImportPolicyError } from '../src/services/importPolicyGate.js'

const now = new Date('2026-10-27T12:00:00.000Z')

function approvedPolicy(overrides = {}) {
  return {
    sourceId: 'sample-source',
    name: 'Sample source',
    policyReference: 'https://example.org/terms',
    verificationStatus: 'verified',
    reviewedAt: '2026-10-01',
    reviewDueAt: '2026-11-01',
    permittedUses: ['curated_import'],
    storageModes: ['persistent_database'],
    maxRetentionDays: null,
    attributionRequirements: ['Keep source link.'],
    licensingRequirements: 'Explicit permission recorded for test fixture only.',
    approvedOperations: ['sample-import'],
    ...overrides,
  }
}

function check(policy, storageMode = 'persistent_database') {
  return assertImportAllowed({
    sourceIds: ['sample-source'],
    operationId: 'sample-import',
    use: 'curated_import',
    storageMode,
    registry: { 'sample-source': policy },
    now,
  })
}

test('rejects an operation that has not been explicitly approved', () => {
  assert.throws(
    () => check(approvedPolicy({ approvedOperations: [] })),
    (error) => error instanceof ImportPolicyError && error.code === 'IMPORT_OPERATION_UNAPPROVED',
  )
})

test('rejects missing and unknown source storage policies', () => {
  assert.throws(
    () => assertImportAllowed({ sourceIds: ['missing'], operationId: 'sample-import', use: 'curated_import', storageMode: 'persistent_database', registry: {}, now }),
    (error) => error.code === 'SOURCE_POLICY_MISSING',
  )
  assert.throws(
    () => check(approvedPolicy({ storageModes: ['archive_forever'] })),
    (error) => error.code === 'UNKNOWN_SOURCE_STORAGE_POLICY',
  )
})

test('rejects expired and unverified source policies', () => {
  assert.throws(
    () => check(approvedPolicy({ reviewDueAt: '2026-10-26' })),
    (error) => error.code === 'SOURCE_POLICY_EXPIRED',
  )
  assert.throws(
    () => check(approvedPolicy({ reviewDueAt: undefined })),
    (error) => error.code === 'SOURCE_POLICY_EXPIRED',
  )
  assert.throws(
    () => check(approvedPolicy({ verificationStatus: 'unverified' })),
    (error) => error.code === 'SOURCE_POLICY_UNVERIFIED',
  )
})

test('allows only a verified, current, explicitly approved operation and storage mode', () => {
  assert.equal(check(approvedPolicy()), true)
  assert.throws(
    () => check(approvedPolicy({ storageModes: ['transient_cache'] }), 'persistent_database'),
    (error) => error.code === 'STORAGE_MODE_NOT_PERMITTED',
  )
  assert.throws(
    () => assertImportAllowed({ sourceIds: ['sample-source'], operationId: 'sample-import', use: 'curated_import', storageMode: 'unknown_mode', registry: { 'sample-source': approvedPolicy() }, now }),
    (error) => error.code === 'UNKNOWN_STORAGE_MODE',
  )
})

test('country import policy blocks before source reads, API calls, DB connection, or writes', async () => {
  let fetchCalls = 0
  let databaseConnections = 0
  let modelReads = 0
  let modelWrites = 0
  const existingRecords = [{ cca2: 'JP', name: 'Existing country', culture: { history: [{ title: 'Curated' }] } }]
  const before = structuredClone(existingRecords)
  const CountryModel = {
    find() { modelReads += 1; throw new Error('model read must not run') },
    bulkWrite() { modelWrites += 1; throw new Error('model write must not run') },
  }

  await assert.rejects(runCountryImport({
    sourcePath: undefined,
    apiKey: 'test-only-key',
    CountryModel,
    policyNow: now,
    fetchImpl: async () => { fetchCalls += 1; throw new Error('network must not run') },
    connectDatabaseFn: async () => { databaseConnections += 1; return true },
  }), /does not permit this use/)

  assert.equal(fetchCalls, 0)
  assert.equal(databaseConnections, 0)
  assert.equal(modelReads, 0)
  assert.equal(modelWrites, 0)
  assert.deepEqual(existingRecords, before)
})
