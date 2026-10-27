import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import CulturalEntry from '../src/models/CulturalEntry.js';
import Place from '../src/models/Place.js';

const country = new mongoose.Types.ObjectId();

test('cultural entries default to pending review and require valid source URLs', async () => {
  const entry = new CulturalEntry({
    country,
    category: 'history',
    title: 'A sourced history entry',
    content: 'Research notes.',
    sources: [{ title: 'Reference', url: 'https://example.org/reference' }],
  });
  await entry.validate();
  assert.equal(entry.reviewStatus, 'pending_review');

  const invalid = new CulturalEntry({
    country,
    category: 'unlisted_category',
    title: 'Invalid entry',
    content: 'Content.',
    sources: [{ title: 'Reference', url: 'javascript:alert(1)' }],
  });
  await assert.rejects(invalid.validate(), (error) => Boolean(error.errors.category || error.errors['sources.0.url']));
});

test('places validate coordinate bounds and default to pending review', async () => {
  const place = new Place({
    country,
    name: 'Sourced place',
    category: 'heritage_site',
    coordinates: { latitude: 90, longitude: -180 },
  });
  await place.validate();
  assert.equal(place.reviewStatus, 'pending_review');

  const invalid = new Place({ country, name: 'Invalid place', coordinates: { latitude: 91, longitude: 0 } });
  await assert.rejects(invalid.validate(), (error) => Boolean(error.errors['coordinates.latitude']));
});

test('uploaded contribution images require a recorded rights confirmation and timestamp', async () => {
  const entry = new CulturalEntry({
    country,
    category: 'history',
    title: 'Image-backed entry',
    content: 'Description.',
    image: {
      url: 'https://images.example.org/entry.webp',
      publicId: 'world-of-cultures/entry',
      rightsConfirmed: true,
      rightsConfirmedAt: new Date(),
    },
  });
  await entry.validate();

  const invalid = new Place({
    country,
    name: 'Image-backed place',
    image: { url: 'https://images.example.org/place.webp', publicId: 'world-of-cultures/place' },
  });
  await assert.rejects(invalid.validate(), (error) => Boolean(error.errors['image.rightsConfirmed'] || error.errors['image.rightsConfirmedAt']));
});

test('cultural collections have country and public-review lookup indexes', () => {
  for (const schema of [CulturalEntry.schema, Place.schema]) {
    assert.ok(schema.indexes().some(([fields]) => fields.country === 1 && fields.reviewStatus === 1));
  }
  assert.ok(CulturalEntry.schema.indexes().some(([fields]) => fields.reviewStatus === 1 && fields.title === 1));
  assert.ok(Place.schema.indexes().some(([fields]) => fields.reviewStatus === 1 && fields.name === 1));
});
