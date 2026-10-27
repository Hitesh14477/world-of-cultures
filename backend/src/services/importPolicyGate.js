import { IMPORT_POLICY_REGISTRY } from './importPolicyRegistry.js'

export const IMPORT_STORAGE_MODES = Object.freeze([
  'no_storage',
  'transient_cache',
  'persistent_database',
])

export class ImportPolicyError extends Error {
  constructor(message, code = 'IMPORT_POLICY_REJECTED') {
    super(message)
    this.name = 'ImportPolicyError'
    this.code = code
  }
}

function policyFrom(registry, sourceId) {
  if (registry instanceof Map) return registry.get(sourceId)
  return registry?.[sourceId]
}

function dateValue(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value ? null : parsed
}

export function resolveSourcePolicyId(sourceUrl, registry = IMPORT_POLICY_REGISTRY) {
  let hostname
  try {
    const parsed = new URL(sourceUrl)
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) return null
    hostname = parsed.hostname.toLowerCase()
  } catch {
    return null
  }

  const policies = registry instanceof Map ? [...registry.values()] : Object.values(registry || {})
  return policies.find((policy) => policy.hosts?.includes(hostname))?.sourceId || null
}

export function assertImportAllowed({
  sourceIds,
  operationId,
  use,
  storageMode,
  retentionDays,
  registry = IMPORT_POLICY_REGISTRY,
  now = new Date(),
}) {
  if (!IMPORT_STORAGE_MODES.includes(storageMode)) {
    throw new ImportPolicyError('Import rejected: requested storage mode is unknown.', 'UNKNOWN_STORAGE_MODE')
  }
  if (!Array.isArray(sourceIds) || sourceIds.length === 0) {
    throw new ImportPolicyError('Import rejected: no source policy was identified.', 'SOURCE_POLICY_MISSING')
  }
  const currentDate = now instanceof Date ? now : new Date(now)
  if (Number.isNaN(currentDate.valueOf())) {
    throw new ImportPolicyError('Import rejected: policy evaluation date is invalid.', 'INVALID_POLICY_DATE')
  }

  for (const sourceId of new Set(sourceIds)) {
    const policy = policyFrom(registry, sourceId)
    if (!policy) {
      throw new ImportPolicyError(`Import rejected: source policy is missing for "${sourceId}".`, 'SOURCE_POLICY_MISSING')
    }
    if (
      policy.sourceId !== sourceId
      || !policy.name
      || !policy.policyReference
      || !Array.isArray(policy.attributionRequirements)
      || typeof policy.licensingRequirements !== 'string'
    ) {
      throw new ImportPolicyError(`Import rejected: source policy is incomplete for "${sourceId}".`, 'SOURCE_POLICY_INCOMPLETE')
    }
    if (policy.verificationStatus !== 'verified') {
      throw new ImportPolicyError(`Import rejected: source policy for "${sourceId}" is unverified.`, 'SOURCE_POLICY_UNVERIFIED')
    }
    const reviewedAt = dateValue(policy.reviewedAt)
    if (!reviewedAt || reviewedAt > currentDate) {
      throw new ImportPolicyError(`Import rejected: source policy for "${sourceId}" has not been validly reviewed.`, 'SOURCE_POLICY_UNVERIFIED')
    }
    const reviewDueAt = dateValue(policy.reviewDueAt)
    if (!reviewDueAt || reviewDueAt < currentDate) {
      throw new ImportPolicyError(`Import rejected: source policy for "${sourceId}" has expired or lacks a review deadline.`, 'SOURCE_POLICY_EXPIRED')
    }
    if (!Array.isArray(policy.storageModes) || policy.storageModes.some((mode) => !IMPORT_STORAGE_MODES.includes(mode))) {
      throw new ImportPolicyError(`Import rejected: storage policy for "${sourceId}" is unknown.`, 'UNKNOWN_SOURCE_STORAGE_POLICY')
    }
    if (!Array.isArray(policy.permittedUses) || !policy.permittedUses.includes(use)) {
      throw new ImportPolicyError(`Import rejected: source policy for "${sourceId}" does not permit this use.`, 'SOURCE_USE_NOT_PERMITTED')
    }
    if (!policy.storageModes.includes(storageMode)) {
      throw new ImportPolicyError(`Import rejected: source policy for "${sourceId}" does not permit "${storageMode}" storage.`, 'STORAGE_MODE_NOT_PERMITTED')
    }
    if (Number.isFinite(policy.maxRetentionDays)) {
      if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > policy.maxRetentionDays) {
        throw new ImportPolicyError(`Import rejected: retention exceeds the source policy for "${sourceId}".`, 'RETENTION_NOT_PERMITTED')
      }
    }
    if (!Array.isArray(policy.approvedOperations) || !policy.approvedOperations.includes(operationId)) {
      throw new ImportPolicyError(`Import rejected: operation "${operationId}" is not explicitly approved for "${sourceId}".`, 'IMPORT_OPERATION_UNAPPROVED')
    }
  }

  return true
}
