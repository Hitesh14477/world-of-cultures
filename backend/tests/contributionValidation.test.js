import test from 'node:test'
import assert from 'node:assert/strict'
import { CULTURAL_ENTRY_CATEGORIES } from '../src/models/CulturalEntry.js'
import { validateCulturalEntrySubmission, validatePlaceSubmission, ContributionValidationError } from '../src/validators/contributionValidation.js'

const source = [{ title: 'Source', publisher: 'Publisher', url: 'https://example.org/reference' }]

test('every cultural category, including places to visit, requires an uploaded image', () => {
  for (const category of CULTURAL_ENTRY_CATEGORIES) {
    assert.throws(() => validateCulturalEntrySubmission({ title: 'Entry', category, content: 'Text', sources: source }), (error) => {
      assert.ok(error instanceof ContributionValidationError)
      assert.ok(error.fieldErrors.some(({ field }) => field === 'image'))
      return true
    }, category)
  }
  assert.throws(() => validatePlaceSubmission({ name: 'Place', category: 'cultural_destination', description: 'Text', sources: source }), (error) => {
    assert.ok(error.fieldErrors.some(({ field }) => field === 'image'))
    return true
  })
})

test('a supported image marker allows cultural entry and place validation to proceed', () => {
  const entry = validateCulturalEntrySubmission({ title: 'Entry', category: 'history', content: 'Text', sources: source, imageRightsConfirmed: 'true' }, { hasImage: true })
  const place = validatePlaceSubmission({ name: 'Place', category: 'cultural_destination', description: 'Text', sources: source, imageRightsConfirmed: 'true' }, { hasImage: true })
  assert.equal(entry.category, 'history')
  assert.equal(place.category, 'cultural_destination')
})
