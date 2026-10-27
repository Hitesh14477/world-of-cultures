import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { hashPassword, verifyPassword } from '../services/passwords.js'

const COOKIE_NAME = 'woc_user_session'
const SESSION_SECONDS = 60 * 60 * 24 * 7
const FAILURE_WINDOW_MS = 15 * 60 * 1000
const MAX_FAILURES = 5
const PASSWORD_MIN_LENGTH = 12
const PASSWORD_MAX_LENGTH = 128
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left))
  const rightBuffer = Buffer.from(String(right))
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function cookieToken(req) {
  const cookies = (req.headers.cookie || '').split(';')
  const item = cookies.map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`))
  return item ? item.slice(COOKIE_NAME.length + 1) : ''
}

function signedToken(session, secret) {
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url')
  const signature = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

function decodeToken(value, secret) {
  if (!value) return null
  const [payload, signature, extra] = value.split('.')
  if (!payload || !signature || extra !== undefined) return null
  const expected = createHmac('sha256', secret).update(payload).digest('base64url')
  if (!safeEqual(signature, expected)) return null
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (typeof session.userId !== 'string' || typeof session.csrf !== 'string' || typeof session.sid !== 'string' || session.exp <= Date.now()) return null
    return session
  } catch {
    return null
  }
}

function matchingOrigin(req, env) {
  return req.get('origin') === (env.FRONTEND_ORIGIN || 'http://localhost:5173')
}

function cookieSameSite(env) {
  if (env.COOKIE_SAMESITE) return env.COOKIE_SAMESITE
  if (env.FRONTEND_ORIGIN && env.FRONTEND_ORIGIN.startsWith('https://') && !env.FRONTEND_ORIGIN.includes('localhost') && !env.FRONTEND_ORIGIN.includes('.invalid') && !env.FRONTEND_ORIGIN.includes('.example') && !env.FRONTEND_ORIGIN.includes('@example')) {
    return 'None'
  }
  return 'Strict'
}

function setCookie(res, session, env, maxAge = SESSION_SECONDS) {
  const token = session ? signedToken(session, env.USER_SESSION_SECRET) : ''
  const sameSite = cookieSameSite(env)
  const secure = env.NODE_ENV === 'production' || sameSite.toLowerCase() === 'none' || (env.FRONTEND_ORIGIN && env.FRONTEND_ORIGIN.startsWith('https://'))
  const fields = [
    `${COOKIE_NAME}=${token}`,
    // The same regular-user session is used by /api/users and /api/community.
    'Path=/api',
    'HttpOnly',
    `SameSite=${sameSite}`,
    `Max-Age=${maxAge}`,
  ]
  if (secure) fields.push('Secure')
  if (sameSite.toLowerCase() === 'none') fields.push('Partitioned')
  const serialized = fields.join('; ')
  // Expire the prior narrower-path cookie while migrating sessions to /api.
  const legacyCookie = `${COOKIE_NAME}=; Path=/api/users; HttpOnly; SameSite=${sameSite}; Max-Age=0${secure ? '; Secure' : ''}${sameSite.toLowerCase() === 'none' ? '; Partitioned' : ''}`
  res.setHeader('Set-Cookie', [serialized, legacyCookie])
}

function publicUser(user) {
  return {
    id: String(user._id),
    ...(typeof user.username === 'string' ? { username: user.username } : {}),
    ...(typeof user.displayName === 'string' ? { displayName: user.displayName } : {}),
    ...(typeof user.avatarUrl === 'string' && user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
    email: user.email,
  }
}

function validateCredentials(body, { registration = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { message: 'Provide an email address and password.' }
  const allowed = registration ? new Set(['username', 'email', 'password']) : new Set(['email', 'password'])
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    return { message: registration ? 'Only username, email, and password may be submitted.' : 'Only email and password may be submitted.' }
  }
  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (registration && !/^[a-z0-9_]{3,24}$/.test(username)) {
    return { message: 'Username must be 3–24 characters using letters, numbers, or underscores.' }
  }
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return { message: 'Enter a valid email address.' }
  if (registration && (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH)) {
    return { message: `Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.` }
  }
  if (password.length > PASSWORD_MAX_LENGTH) return { message: `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer.` }
  if (password.length === 0) return { message: 'The email or password is incorrect.' }
  return { username, email, password }
}

export function createUserAuth({ UserModel, env = process.env, authStateStore }) {
  const secret = typeof env.USER_SESSION_SECRET === 'string' ? env.USER_SESSION_SECRET : ''
  const stateStore = authStateStore

  function configured(res) {
    if (secret.length >= 32 && !/replace-with|change-me|example-secret/i.test(secret)) return true
    res.status(503).json({ success: false, message: 'User authentication is not configured.' })
    return false
  }

  function authUnavailable(res) {
    return res.status(503).json({ success: false, message: 'Authentication is temporarily unavailable.' })
  }

  async function issueSession(res, user) {
    const now = Date.now()
    const session = {
      userId: String(user._id),
      csrf: randomBytes(32).toString('base64url'),
      sid: randomBytes(32).toString('base64url'),
      exp: now + SESSION_SECONDS * 1000,
    }
    try { await stateStore.setSession('user', session.sid, { userId: session.userId, exp: session.exp }) }
    catch { return null }
    setCookie(res, session, env)
    return { user: publicUser(user), csrfToken: session.csrf }
  }

  async function requireUser(req, res, next) {
    if (!configured(res)) return undefined
    const session = decodeToken(cookieToken(req), secret)
    let activeSession
    try { activeSession = session ? await stateStore.getSession('user', session.sid) : null }
    catch { return authUnavailable(res) }
    if (!session || !activeSession || activeSession.exp !== session.exp || activeSession.userId !== session.userId) {
      return res.status(401).json({ success: false, message: 'Sign in to access this account.' })
    }
    req.userSession = session
    req.user = { id: session.userId }
    return next()
  }

  async function optionalUser(req, res, next) {
    const session = decodeToken(cookieToken(req), secret)
    let activeSession
    try { activeSession = session ? await stateStore.getSession('user', session.sid) : null }
    catch { return authUnavailable(res) }
    if (session && activeSession && activeSession.exp === session.exp && activeSession.userId === session.userId) {
      req.userSession = session
      req.user = { id: session.userId }
      req.memberAuthType = 'user'
    }
    return next()
  }

  function requireCsrf(req, res, next) {
    if (!matchingOrigin(req, env)) return res.status(403).json({ success: false, message: 'The request origin could not be verified.' })
    if (!safeEqual(req.get('x-csrf-token') || '', req.userSession.csrf)) {
      return res.status(403).json({ success: false, message: 'The request could not be verified.' })
    }
    return next()
  }

  async function register(req, res, next) {
    if (!configured(res)) return undefined
    if (!matchingOrigin(req, env)) return res.status(403).json({ success: false, message: 'The request origin could not be verified.' })
    const credentials = validateCredentials(req.body, { registration: true })
    if (credentials.message) return res.status(400).json({ success: false, message: credentials.message })
    try {
      const passwordHash = await hashPassword(credentials.password)
      const user = await UserModel.create({ username: credentials.username, email: credentials.email, passwordHash })
      const data = await issueSession(res, user)
      if (!data) return authUnavailable(res)
      return res.status(201).json({ success: true, data })
    } catch (error) {
      if (error?.code === 11000 || error?.name === 'ValidationError') {
        const duplicateUsername = error?.code === 11000 && (error.keyPattern?.username || error.keyValue?.username)
        return res.status(error.code === 11000 ? 409 : 400).json({
          success: false,
          message: error.code === 11000
            ? duplicateUsername ? 'That username is already taken.' : 'An account with this email already exists.'
            : 'The account details are invalid.',
        })
      }
      return next(error)
    }
  }

  async function login(req, res, next) {
    if (!configured(res)) return undefined
    if (!matchingOrigin(req, env)) return res.status(403).json({ success: false, message: 'The request origin could not be verified.' })
    const credentials = validateCredentials(req.body)
    if (credentials.message && credentials.message !== 'The email or password is incorrect.') {
      return res.status(400).json({ success: false, message: credentials.message })
    }
    const address = createHash('sha256').update(req.ip || req.socket.remoteAddress || 'unknown').digest('hex')
    let failures
    try { failures = await stateStore.consumeLoginFailure('user', address, FAILURE_WINDOW_MS) }
    catch { return res.status(503).json({ success: false, message: 'Authentication is temporarily unavailable.' }) }
    if (failures?.count > MAX_FAILURES) return res.status(429).json({ success: false, message: 'Too many sign-in attempts. Try again later.' })

    try {
      const user = await UserModel.findOne({ email: credentials.email }).select('+passwordHash').lean()
      const valid = await verifyPassword(credentials.password, user?.passwordHash)
      if (!user || !valid) {
        return res.status(401).json({ success: false, message: 'The email or password is incorrect.' })
      }
      await stateStore.clearLoginFailures('user', address)
      const data = await issueSession(res, user)
      if (!data) return authUnavailable(res)
      return res.json({ success: true, data })
    } catch (error) {
      return next(error)
    }
  }

  async function currentSession(req, res, next) {
    try {
      const user = await UserModel.findById(req.user.id).select('_id username displayName avatarUrl email createdAt').lean()
      if (!user) {
        try { await stateStore.deleteSession('user', req.userSession.sid) }
        catch { return authUnavailable(res) }
        setCookie(res, null, env, 0)
        return res.status(401).json({ success: false, message: 'Sign in to access this account.' })
      }
      setCookie(res, req.userSession, env)
      return res.json({ success: true, data: { user: publicUser(user), csrfToken: req.userSession.csrf } })
    } catch (error) {
      return next(error)
    }
  }

  async function logout(req, res) {
    try { await stateStore.deleteSession('user', req.userSession.sid) }
    catch { return authUnavailable(res) }
    setCookie(res, null, env, 0)
    return res.json({ success: true, message: 'You have been signed out.' })
  }

  return { register, login, currentSession, logout, requireUser, optionalUser, requireCsrf }
}
