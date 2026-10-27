import test from 'node:test'
import assert from 'node:assert/strict'
import { createUserAuthPayload, passwordConfirmationMatches } from './userAuthForm.js'

test('registration validation accepts matching passwords and rejects mismatches', () => {
  assert.equal(passwordConfirmationMatches('matching-secret', 'matching-secret'), true)
  assert.equal(passwordConfirmationMatches('first-secret', 'different-secret'), false)
})

test('user auth payload never includes the confirmation field', () => {
  assert.deepEqual(createUserAuthPayload({
    registering: true,
    username: 'culture_user',
    email: 'user@example.test',
    password: 'matching-secret',
    confirmPassword: 'matching-secret',
  }), {
    username: 'culture_user',
    email: 'user@example.test',
    password: 'matching-secret',
  })
})
