import test from 'node:test';
import assert from 'node:assert/strict';
import Country, { slugifyCountryName } from '../src/models/Country.js';

test('normalizes ISO codes and creates a stable slug with empty cultural sections', async () => {
  const country = new Country({
    name: 'São Tomé and Príncipe',
    officialName: 'Democratic Republic of São Tomé and Príncipe',
    cca2: 'st',
    cca3: 'stp',
    continent: 'Africa',
  });

  await country.validate();
  assert.equal(country.cca2, 'ST');
  assert.equal(country.cca3, 'STP');
  assert.equal(country.slug, 'sao-tome-and-principe');
  assert.deepEqual(country.culture.history, []);
  assert.deepEqual(country.culture.everydayLife, []);
});

test('requires valid stable identifiers and a supported continent', async () => {
  const country = new Country({
    name: 'Example',
    officialName: 'Example State',
    cca2: 'X1',
    cca3: 'TOOLONG',
    continent: 'Antarctica',
  });

  await assert.rejects(country.validate(), (error) => {
    assert.ok(error.errors.cca2);
    assert.ok(error.errors.cca3);
    assert.ok(error.errors.continent);
    return true;
  });
});

test('declares unique indexes for slug and ISO codes', () => {
  const indexes = Country.schema.indexes();
  for (const field of ['slug', 'cca2', 'cca3']) {
    assert.ok(indexes.some(([keys, options]) => keys[field] === 1 && options.unique));
  }
});

test('slug normalization is consistent for names and explicit values', () => {
  assert.equal(slugifyCountryName('  Côte d’Ivoire  '), 'cote-d-ivoire');
});
