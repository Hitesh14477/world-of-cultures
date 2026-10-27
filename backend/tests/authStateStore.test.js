import test from 'node:test'
import assert from 'node:assert/strict'
import AuthState from '../src/models/AuthState.js'
import { createMongoAuthStateStore } from '../src/services/authStateStore.js'

function sharedFakeModel() {
  const rows = new Map()
  return {
    rows,
    pipelineOptions: [],
    findOne(filter) {
      const row = rows.get(filter.key)
      const matches = row && Object.entries(filter).every(([key, value]) => {
        if (value && typeof value === 'object' && '$gt' in value) return row[key] > value.$gt
        return row[key] === value
      })
      return { lean: async () => matches ? structuredClone(row) : null }
    },
    async updateOne(filter, update) {
      rows.set(filter.key, { ...rows.get(filter.key), key: filter.key, ...update.$set })
    },
    async deleteOne(filter) { rows.delete(filter.key) },
    async findOneAndUpdate(filter, pipeline, options) {
      this.pipelineOptions.push(options)
      const nowSet = pipeline[0].$set
      const prior = rows.get(filter.key)
      const now = nowSet.windowStartedAt.$cond[0].$gt[1]
      const active = prior?.expiresAt > now
      const count = active ? prior.count + 1 : 1
      const startedAt = active ? prior.windowStartedAt : now
      const expiresAt = active ? prior.expiresAt : nowSet.expiresAt.$cond[2]
      const row = { key: filter.key, kind: 'rate-limit', count, windowStartedAt: startedAt, expiresAt }
      rows.set(filter.key, row)
      return row
    },
  }
}

test('Mongo auth state adapters share sessions and rate limits across instances', async () => {
  const Model = sharedFakeModel()
  const firstInstance = createMongoAuthStateStore(Model)
  const secondInstance = createMongoAuthStateStore(Model)
  const session = { userId: 'member-1', exp: Date.now() + 60_000 }

  await firstInstance.setSession('user', 'session-1', session)
  assert.deepEqual(await secondInstance.getSession('user', 'session-1'), session)
  await secondInstance.deleteSession('user', 'session-1')
  assert.equal(await firstInstance.getSession('user', 'session-1'), null)

  assert.equal((await firstInstance.consumeLoginFailure('admin', 'address-hash', 60_000)).count, 1)
  assert.equal((await secondInstance.consumeLoginFailure('admin', 'address-hash', 60_000)).count, 2)
  assert.equal((await secondInstance.consumeLoginFailure('user', 'address-hash', 60_000)).count, 1)
  await firstInstance.clearLoginFailures('admin', 'address-hash')
  assert.equal(await secondInstance.getLoginFailures('admin', 'address-hash'), null)
  assert.ok(Model.pipelineOptions.every((options) => options.updatePipeline === true))
})

test('auth state schema configures automatic expiry cleanup', () => {
  const expiryIndex = AuthState.schema.indexes().find(([fields, options]) => fields.expiresAt === 1 && options.expireAfterSeconds === 0)
  assert.ok(expiryIndex)
})
