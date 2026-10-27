import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAuthPath, getAuthPrompt, getAuthReturnTo, safeInternalPath } from './authNavigation.js'

test('safe return targets preserve internal paths, query, and fragments', () => {
  const destination = '/countries/india?section=food#regional'
  assert.equal(safeInternalPath(destination), destination)
  assert.equal(getAuthReturnTo(`?returnTo=${encodeURIComponent(destination)}`), destination)
  assert.equal(buildAuthPath('register', destination), `/register?returnTo=${encodeURIComponent(destination)}`)
})

test('external, protocol-relative, malformed, and authentication-loop destinations fall back safely', () => {
  for (const destination of ['https://evil.example', '//evil.example', '/\\evil.example', '/login', '/register', '/admin/login']) {
    assert.equal(safeInternalPath(destination), '/my-collection')
  }
  assert.equal(getAuthReturnTo('?returnTo=https%3A%2F%2Fevil.example'), '/my-collection')
  assert.equal(getAuthReturnTo(''), '/my-collection')
})

test('auth prompts explain the intended protected destination', () => {
  assert.match(getAuthPrompt('/community?compose=1'), /create a Community post/i)
  assert.equal(getAuthPrompt('/my-collection'), 'Sign in to save and manage your personal collection.')
})
