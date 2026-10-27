import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAdminLoginPath, safeAdminReturnTo } from './adminNavigation.js'

test('administrator return destinations stay within protected admin pages', () => {
  assert.equal(safeAdminReturnTo('/admin/profile#Notifications'), '/admin/profile#Notifications')
  assert.equal(safeAdminReturnTo('https://evil.example/admin'), '/admin')
  assert.equal(safeAdminReturnTo('//evil.example/admin'), '/admin')
  assert.equal(safeAdminReturnTo('/admin/login'), '/admin')
  assert.equal(buildAdminLoginPath('/admin/profile'), '/admin/login?returnTo=%2Fadmin%2Fprofile')
})
