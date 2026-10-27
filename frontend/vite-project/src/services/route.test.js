import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveAppRoute } from './route.js'

test('resolves existing home, directory, and country routes', () => {
  assert.deepEqual(resolveAppRoute('/'), { type: 'home' })
  assert.deepEqual(resolveAppRoute('/countries/'), { type: 'directory' })
  assert.deepEqual(resolveAppRoute('/contribute'), { type: 'contribute' })
  assert.deepEqual(resolveAppRoute('/admin/login'), { type: 'adminLogin' })
  assert.deepEqual(resolveAppRoute('/admin/profile'), { type: 'adminProfile' })
  assert.deepEqual(resolveAppRoute('/admin'), { type: 'adminDashboard' })
  assert.deepEqual(resolveAppRoute('/search'), { type: 'search' })
  assert.deepEqual(resolveAppRoute('/register'), { type: 'register' })
  assert.deepEqual(resolveAppRoute('/login'), { type: 'login' })
  assert.deepEqual(resolveAppRoute('/my-collection'), { type: 'myCollection' })
  assert.deepEqual(resolveAppRoute('/notifications'), { type: 'notifications' })
  assert.deepEqual(resolveAppRoute('/community'), { type: 'community' })
  assert.deepEqual(resolveAppRoute('/countries/india'), { type: 'country', slug: 'india' })
})

test('resolves private profile and individual community post routes', () => {
  assert.deepEqual(resolveAppRoute('/profile'), { type: 'profile' })
  assert.deepEqual(resolveAppRoute('/community/posts/abc123'), { type: 'communityPost', postId: 'abc123' })
  assert.deepEqual(resolveAppRoute('/members/culture_reader'), { type: 'memberProfile', username: 'culture_reader' })
})

test('resolves country-scoped published item routes', () => {
  assert.deepEqual(resolveAppRoute('/countries/japan/cultural-entries/abc123'), {
    type: 'culturalEntry', slug: 'japan', entryId: 'abc123',
  })
  assert.deepEqual(resolveAppRoute('/countries/italy/places/65fabc1234567890abcdef12'), {
    type: 'place', slug: 'italy', placeId: '65fabc1234567890abcdef12',
  })
})

test('rejects malformed route encodings and preserves the home fallback for unknown paths', () => {
  assert.deepEqual(resolveAppRoute('/countries/%E0%A4%A'), { type: 'notFound' })
  assert.deepEqual(resolveAppRoute('/countries/italy/places/65f%2Fabc'), { type: 'notFound' })
  assert.deepEqual(resolveAppRoute('/unrecognized'), { type: 'home' })
})
