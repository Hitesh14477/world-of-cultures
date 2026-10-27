import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const COOKIE_NAME = 'woc_admin_session'
const SESSION_SECONDS = 8 * 60 * 60
const FAILURE_WINDOW_MS = 15 * 60 * 1000
const MAX_FAILURES = 5
const PASSWORD_SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const scryptAsync = promisify(scrypt)

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left))
  const rightBuffer = Buffer.from(String(right))
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function getCookie(req) {
  const cookies = (req.headers.cookie || '').split(';')
  const item = cookies.map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`))
  return item ? item.slice(COOKIE_NAME.length + 1) : ''
}

function sign(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

function createSessionToken(session, secret) {
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url')
  return `${payload}.${sign(payload, secret)}`
}

function readSession(token, secret) {
  if (!token) return null
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra !== undefined || !safeEqual(signature, sign(payload, secret))) return null
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (typeof session.username !== 'string' || typeof session.csrf !== 'string' || typeof session.sid !== 'string' || session.exp <= Date.now()) return null
    return session
  } catch {
    return null
  }
}

function parsePasswordHash(value) {
  if (typeof value !== 'string') return null
  const match = value.match(/^scrypt\$([A-Za-z0-9_-]{20,})\$([A-Za-z0-9_-]{80,})$/)
  if (!match) return null
  return { salt: Buffer.from(match[1], 'base64url'), hash: Buffer.from(match[2], 'base64url') }
}

function cookieOptions(env, maxAge = SESSION_SECONDS) {
  const options = [
    `${COOKIE_NAME}=`,
    'Path=/api',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAge}`,
  ]
  if (env.NODE_ENV === 'production') options.push('Secure')
  return options.join('; ')
}

function matchingOrigin(req, env) {
  const expected = env.FRONTEND_ORIGIN || 'http://localhost:5173'
  return req.get('origin') === expected
}

export function createAdminAuth(env = process.env) {
  const sessionSecret = typeof env.ADMIN_SESSION_SECRET === 'string' ? env.ADMIN_SESSION_SECRET : ''
  const adminUsername = typeof env.ADMIN_USERNAME === 'string' ? env.ADMIN_USERNAME.trim() : ''
  const passwordConfig = parsePasswordHash(env.ADMIN_PASSWORD_HASH)
  const attemptsByAddress = new Map()
  const activeSessions = new Map()

  function configurationReady() {
    return sessionSecret.length >= 32 && adminUsername.length > 0 && passwordConfig?.salt.length >= 16 && passwordConfig?.hash.length === 64
  }

  function respondUnavailable(res) {
    return res.status(503).json({ success: false, message: 'Administrator authentication is not configured.' })
  }

  function issueCookie(res, session) {
    const cookie = cookieOptions(env).replace(`${COOKIE_NAME}=`, `${COOKIE_NAME}=${createSessionToken(session, sessionSecret)}`)
    const legacyCookie = `${COOKIE_NAME}=; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=0${env.NODE_ENV === 'production' ? '; Secure' : ''}`
    res.setHeader('Set-Cookie', [cookie, legacyCookie])
  }

  function requireAdmin(req, res, next) {
    if (!configurationReady()) return respondUnavailable(res)
    const session = readSession(getCookie(req), sessionSecret)
    if (!session || activeSessions.get(session.sid) !== session.exp) {
      return res.status(401).json({ success: false, message: 'Administrator authentication is required.' })
    }
    req.adminSession = session
    return next()
  }

  function requireCsrf(req, res, next) {
    if (!matchingOrigin(req, env)) {
      return res.status(403).json({ success: false, message: 'The request origin could not be verified.' })
    }
    if (!safeEqual(req.get('x-csrf-token') || '', req.adminSession.csrf)) {
      return res.status(403).json({ success: false, message: 'The request could not be verified.' })
    }
    return next()
  }

  async function login(req, res) {
    if (!configurationReady()) return respondUnavailable(res)
    if (!matchingOrigin(req, env)) {
      return res.status(403).json({ success: false, message: 'The request origin could not be verified.' })
    }

    const now = Date.now()
    const address = req.ip || req.socket.remoteAddress || 'unknown'
    let attempts = attemptsByAddress.get(address)
    if (attempts && now - attempts.startedAt >= FAILURE_WINDOW_MS) {
      attemptsByAddress.delete(address)
      attempts = null
    }
    if (attempts?.count >= MAX_FAILURES) {
      return res.status(429).json({ success: false, message: 'Too many login attempts. Try again later.' })
    }

    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {}
    const username = typeof body.username === 'string' ? body.username.trim() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    let candidateHash = Buffer.alloc(64)
    if (password.length <= 1024) {
      try {
        candidateHash = Buffer.from(await scryptAsync(password, passwordConfig.salt, 64, PASSWORD_SCRYPT))
      } catch {
        return res.status(503).json({ success: false, message: 'Administrator authentication is temporarily unavailable.' })
      }
    }
    const valid = safeEqual(username, adminUsername) && timingSafeEqual(candidateHash, passwordConfig.hash)
    if (!valid) {
      attemptsByAddress.set(address, { startedAt: attempts?.startedAt || now, count: (attempts?.count || 0) + 1 })
      return res.status(401).json({ success: false, message: 'The username or password is incorrect.' })
    }

    attemptsByAddress.delete(address)
    const session = {
      username: adminUsername,
      csrf: randomBytes(32).toString('base64url'),
      sid: randomBytes(32).toString('base64url'),
      exp: now + SESSION_SECONDS * 1000,
    }
    for (const [sessionId, expiresAt] of activeSessions) {
      if (expiresAt <= now) activeSessions.delete(sessionId)
    }
    activeSessions.set(session.sid, session.exp)
    issueCookie(res, session)
    return res.json({ success: true, data: { username: adminUsername, csrfToken: session.csrf } })
  }

  function currentSession(req, res) {
    return res.json({ success: true, data: { username: req.adminSession.username, role: 'administrator', csrfToken: req.adminSession.csrf } })
  }

  function logout(req, res) {
    activeSessions.delete(req.adminSession.sid)
    const expiredCookie = cookieOptions(env, 0)
    const expiredLegacyCookie = `${COOKIE_NAME}=; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=0${env.NODE_ENV === 'production' ? '; Secure' : ''}`
    res.setHeader('Set-Cookie', [expiredCookie, expiredLegacyCookie])
    return res.json({ success: true, message: 'You have been signed out.' })
  }

  return { login, currentSession, logout, requireAdmin, requireCsrf }
}
