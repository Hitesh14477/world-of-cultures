import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCountryImportPlan,
  normalizeSourceCountry,
  selectInScopeRecords,
} from '../src/services/countryImport.js';

function sourceRecord({ code = 'JP', unMember = true, unObserver = false } = {}) {
  return {
    names: { common: 'Japan', official: 'Japan' },
    codes: { alpha_2: code, alpha_3: `${code}X` },
    classification: { un_member: unMember, un_observer: unObserver },
    region: 'Asia',
    subregion: 'Eastern Asia',
    capitals: [{ name: 'Tokyo' }],
    flag: { emoji: '🇯🇵', url_svg: 'https://example.org/jp.svg' },
    area: { kilometers: 377975 },
    coordinates: { lat: 36, lng: 138 },
    landlocked: false,
    borders: [],
    population: 123,
    languages: [{ iso_639_3: 'jpn', name: 'Japanese' }],
    currencies: { JPY: { name: 'Japanese yen', symbol: '¥' } },
    timezones: ['UTC+09:00'],
  };
}

test('scope selection includes UN members and only the two requested observer codes', () => {
  const selected = selectInScopeRecords([
    sourceRecord(),
    sourceRecord({ code: 'VA', unMember: false, unObserver: true }),
    sourceRecord({ code: 'PS', unMember: false, unObserver: true }),
    sourceRecord({ code: 'AQ', unMember: false, unObserver: false }),
    sourceRecord({ code: 'XX', unMember: false, unObserver: true }),
  ], { expectedMembers: 1, expectedObservers: 2 });

  assert.deepEqual(selected.map((record) => record.codes.alpha_2), ['JP', 'VA', 'PS']);
});

test('scope check refuses incomplete source data before any write', () => {
  assert.throws(
    () => selectInScopeRecords([sourceRecord()], { expectedMembers: 2, expectedObservers: 2 }),
    /No records were written/,
  );
});

test('maps basic API fields and leaves cultural content for later curation', () => {
  const country = normalizeSourceCountry(sourceRecord());
  assert.equal(country.name, 'Japan');
  assert.equal(country.cca2, 'JP');
  assert.equal(country.continent, 'Asia');
  assert.deepEqual(country.capital, ['Tokyo']);
  assert.equal(country.languages[0].name, 'Japanese');
  assert.equal(country.culture, undefined);
});

test('repeat import plan skips unchanged records and does not overwrite cultural content', () => {
  const country = normalizeSourceCountry(sourceRecord());
  const firstPlan = buildCountryImportPlan([country]);
  assert.equal(firstPlan.operations.length, 1);
  assert.equal(firstPlan.operations[0].updateOne.upsert, true);
  assert.ok(firstPlan.operations[0].updateOne.update.$setOnInsert.culture);

  const existing = {
    ...country,
    culture: { history: [{ title: 'Curated history entry' }] },
  };
  const repeatedPlan = buildCountryImportPlan([country], [existing]);
  assert.equal(repeatedPlan.operations.length, 0);
  assert.equal(repeatedPlan.skipped, 1);
  assert.equal(existing.culture.history[0].title, 'Curated history entry');
});

test('changed source basics update by stable ISO code without setting culture', () => {
  const country = normalizeSourceCountry(sourceRecord());
  const plan = buildCountryImportPlan([country], [{ ...country, name: 'Old name', culture: { food: [] } }]);
  assert.equal(plan.operations[0].updateOne.filter.cca2, 'JP');
  assert.equal(plan.operations[0].updateOne.update.$set.name, 'Japan');
  assert.equal('culture' in plan.operations[0].updateOne.update.$set, false);
  assert.equal(plan.operations[0].updateOne.upsert, undefined);
});
