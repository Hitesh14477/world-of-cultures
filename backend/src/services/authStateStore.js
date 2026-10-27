import AuthState from '../models/AuthState.js'

export function createMongoAuthStateStore(Model = AuthState) {
  return {
    async getSession(namespace, sid) {
      const row = await Model.findOne({ key: `session:${namespace}:${sid}`, kind: 'session', expiresAt: { $gt: new Date() } }).lean()
      return row?.value || null
    },
    async setSession(namespace, sid, value) {
      await Model.updateOne(
        { key: `session:${namespace}:${sid}` },
        { $set: { kind: 'session', value, expiresAt: new Date(value.exp) } },
        { upsert: true },
      )
    },
    async deleteSession(namespace, sid) {
      await Model.deleteOne({ key: `session:${namespace}:${sid}` })
    },
    async consumeLoginFailure(namespace, address, windowMs) {
      const now = new Date()
      const key = `rate:${namespace}:${address}`
      const resetAt = new Date(now.getTime() + windowMs)
      const update = [{ $set: {
          kind: 'rate-limit',
          count: { $cond: [{ $gt: ['$expiresAt', now] }, { $add: [{ $ifNull: ['$count', 0] }, 1] }, 1] },
          windowStartedAt: { $cond: [{ $gt: ['$expiresAt', now] }, '$windowStartedAt', now] },
          expiresAt: { $cond: [{ $gt: ['$expiresAt', now] }, '$expiresAt', resetAt] },
        } }]
      let row
      try {
        row = await Model.findOneAndUpdate({ key }, update, { upsert: true, returnDocument: 'after', lean: true, updatePipeline: true })
      } catch (error) {
        if (error?.code !== 11000) throw error
        row = await Model.findOneAndUpdate({ key }, update, { upsert: false, returnDocument: 'after', lean: true, updatePipeline: true })
      }
      return { count: row.count, startedAt: new Date(row.windowStartedAt).getTime() }
    },
    async getLoginFailures(namespace, address) {
      const row = await Model.findOne({ key: `rate:${namespace}:${address}`, kind: 'rate-limit', expiresAt: { $gt: new Date() } }).lean()
      return row ? { count: row.count, startedAt: new Date(row.windowStartedAt).getTime() } : null
    },
    async clearLoginFailures(namespace, address) {
      await Model.deleteOne({ key: `rate:${namespace}:${address}` })
    },
  }
}

export function createMemoryAuthStateStore() {
  const sessions = new Map()
  const limits = new Map()
  return {
    async getSession(namespace, sid) { return sessions.get(`${namespace}:${sid}`) || null },
    async setSession(namespace, sid, value) { sessions.set(`${namespace}:${sid}`, value) },
    async deleteSession(namespace, sid) { sessions.delete(`${namespace}:${sid}`) },
    async getLoginFailures(namespace, address) {
      const entry = limits.get(`${namespace}:${address}`)
      if (entry?.expiresAt <= Date.now()) limits.delete(`${namespace}:${address}`)
      return entry && entry.expiresAt > Date.now() ? { ...entry } : null
    },
    async consumeLoginFailure(namespace, address, windowMs) {
      const key = `${namespace}:${address}`
      const now = Date.now()
      let entry = limits.get(key)
      if (!entry || entry.expiresAt <= now) entry = { count: 0, startedAt: now, expiresAt: now + windowMs }
      entry.count += 1
      limits.set(key, entry)
      return { count: entry.count, startedAt: entry.startedAt }
    },
    async clearLoginFailures(namespace, address) { limits.delete(`${namespace}:${address}`) },
  }
}
