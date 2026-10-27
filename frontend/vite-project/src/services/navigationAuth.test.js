import test from 'node:test'
import assert from 'node:assert/strict'
import { getNavigationAuthView } from './navigationAuth.js'

const signedOutUser = { status: 'ready', user: null }
const signedOutAdmin = { status: 'ready', session: null }

test('logged-out navigation exposes regular sign-in and registration only after both checks finish', () => {
  const view = getNavigationAuthView(signedOutUser, signedOutAdmin)
  assert.equal(view.loading, false)
  assert.equal(view.showRegularSignIn, true)
  assert.equal(view.user, null)
  assert.equal(view.admin, null)

  const pending = getNavigationAuthView({ ...signedOutUser, status: 'loading' }, signedOutAdmin)
  assert.equal(pending.loading, true)
  assert.equal(pending.showRegularSignIn, false)
})

test('a regular-user session is distinct from administrator authentication', () => {
  const user = { id: 'user-1', username: 'atlas_reader', email: 'reader@example.org' }
  const view = getNavigationAuthView({ status: 'ready', user }, signedOutAdmin)
  assert.equal(view.user, user)
  assert.equal(view.admin, null)
  assert.equal(view.showRegularSignIn, false)
})

test('an administrator session shows review navigation without regular-user sign-in controls', () => {
  const session = { username: 'editor', csrfToken: 'test-only' }
  const view = getNavigationAuthView({ ...signedOutUser, status: 'error', error: 'Regular sessions are unavailable.' }, { status: 'ready', session })
  assert.equal(view.admin, session)
  assert.equal(view.user, null)
  assert.equal(view.showRegularSignIn, false)
  assert.equal(view.userError, '')
  assert.equal(view.retryUserSession, null)
})

test('a session-check error remains visible and does not convert an unknown session into signed-out controls', () => {
  const view = getNavigationAuthView(
    { status: 'error', user: null, error: 'User session check failed.', retry() {} },
    signedOutAdmin,
  )
  assert.equal(view.showRegularSignIn, false)
  assert.equal(view.userError, 'User session check failed.')
  assert.equal(typeof view.retryUserSession, 'function')
})

test('a resolved signed-out user can still use regular auth while an admin check reports its own error', () => {
  const view = getNavigationAuthView(
    signedOutUser,
    { status: 'error', session: null, error: 'Admin session check failed.' },
  )
  assert.equal(view.showRegularSignIn, true)
  assert.equal(view.adminError, 'Admin session check failed.')
})
