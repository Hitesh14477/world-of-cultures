import { createHash, randomBytes } from 'node:crypto'
import { hashPassword } from '../services/passwords.js'

function hasAdminCookie(req) {
  return (req.headers.cookie || '').split(';').some((part) => part.trim().startsWith('woc_admin_session='))
}

function adminMemberFields(member) {
  return {
    id: String(member._id),
    username: member.username,
    displayName: member.displayName || '',
    ...(member.avatarUrl ? { avatarUrl: member.avatarUrl } : {}),
  }
}

async function findOrCreateAdminMember(UserModel, adminUsername) {
  const identity = createHash('sha256').update(adminUsername.trim().toLowerCase()).digest('hex')
  const existing = await UserModel.findOne({ adminIdentity: identity }).select('+adminIdentity _id username displayName avatarUrl email').lean()
  if (existing) return existing

  const normalizedUsername = adminUsername.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 24)
  const preferredUsername = /^[a-z0-9_]{3,24}$/.test(normalizedUsername) ? normalizedUsername : ''
  const passwordHash = await hashPassword(randomBytes(48).toString('base64url'))

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const username = attempt === 0 && preferredUsername
      ? preferredUsername
      : `a_${randomBytes(10).toString('hex')}`
    const usernameOwner = await UserModel.findOne({ username }).select('_id').lean()
    if (usernameOwner) continue

    try {
      const created = await UserModel.create({
        adminIdentity: identity,
        username,
        displayName: adminUsername.trim(),
        email: `admin-${randomBytes(20).toString('hex')}@accounts.worldofcultures.invalid`,
        passwordHash,
      })
      return {
        _id: created._id,
        username: created.username,
        displayName: created.displayName,
        avatarUrl: created.avatarUrl || '',
        email: created.email,
      }
    } catch (error) {
      if (error?.code !== 11000) throw error
      const raced = await UserModel.findOne({ adminIdentity: identity }).select('+adminIdentity _id username displayName avatarUrl email').lean()
      if (raced) return raced
    }
  }

  throw new Error('The administrator member profile could not be initialized.')
}

export function createMemberAuth({ userAuth, adminAuth, UserModel }) {
  async function requireMember(req, res, next) {
    if (typeof userAuth.optionalUser !== 'function') return userAuth.requireUser(req, res, next)
    return userAuth.optionalUser(req, res, (error) => {
      if (error) return next(error)
      if (req.memberAuthType === 'user') return next()
      if (!hasAdminCookie(req)) return userAuth.requireUser(req, res, next)

      return adminAuth.requireAdmin(req, res, async (adminError) => {
        if (adminError) return next(adminError)
        try {
          const member = await findOrCreateAdminMember(UserModel, req.adminSession.username)
          req.user = { id: String(member._id), username: member.username, displayName: member.displayName, avatarUrl: member.avatarUrl || '' }
          req.adminMember = member
          req.memberAuthType = 'admin'
          return next()
        } catch (errorDuringProvisioning) {
          return next(errorDuringProvisioning)
        }
      })
    })
  }

  function requireCsrf(req, res, next) {
    return req.memberAuthType === 'admin'
      ? adminAuth.requireCsrf(req, res, next)
      : userAuth.requireCsrf(req, res, next)
  }

  return { requireMember, requireCsrf }
}

export { adminMemberFields, findOrCreateAdminMember }
