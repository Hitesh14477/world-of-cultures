import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const HASH_BYTES = 64

function parseHash(value) {
  if (typeof value !== 'string') return null
  const match = value.match(/^scrypt\$([A-Za-z0-9_-]{20,})\$([A-Za-z0-9_-]{80,})$/)
  if (!match) return null
  const salt = Buffer.from(match[1], 'base64url')
  const hash = Buffer.from(match[2], 'base64url')
  return salt.length >= 16 && hash.length === HASH_BYTES ? { salt, hash } : null
}

export async function hashPassword(password) {
  const salt = randomBytes(16)
  const hash = await scryptAsync(password, salt, HASH_BYTES, SCRYPT_OPTIONS)
  return `scrypt$${salt.toString('base64url')}$${Buffer.from(hash).toString('base64url')}`
}

export async function verifyPassword(password, encodedHash) {
  const parsed = parseHash(encodedHash)
  const salt = parsed?.salt || randomBytes(16)
  const expected = parsed?.hash || randomBytes(HASH_BYTES)
  const candidate = Buffer.from(await scryptAsync(password, salt, HASH_BYTES, SCRYPT_OPTIONS))
  return timingSafeEqual(candidate, expected) && Boolean(parsed)
}
