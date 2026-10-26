import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

const countries = [
  { name: 'Finland', officialName: 'Republic of Finland', slug: 'finland', cca2: 'FI', continent: 'Europe', _id: 'internal-1', __v: 0 },
  { name: 'Iceland', officialName: 'Republic of Iceland', slug: 'iceland', cca2: 'IS', continent: 'Europe', _id: 'internal-2', __v: 0 },
  { name: 'Japan', officialName: 'Japan', slug: 'japan', cca2: 'JP', continent: 'Asia', _id: 'internal-3', __v: 0, culture: { history: [] } },
];

function matches(country, filter) {
  if (filter.continent && country.continent !== filter.continent) return false;
  if (filter.$or) {
    const matched = filter.$or.some((clause) => Object.entries(clause).some(([field, expression]) => expression.test(country[field])));
    if (!matched) return false;
  }
  return true;
}

function fakeCountryModel(rows = countries, { failCount = false } = {}) {
  return {
    find(filter) {
      let result = rows.filter((row) => matches(row, filter));
      const query = {
        select() { return this; },
        sort(order) {
          result = [...result].sort((a, b) => {
            const compare = a.name.localeCompare(b.name);
            return (order.name < 0 ? -compare : compare) || a.cca2.localeCompare(b.cca2);
          });
          return this;
        },
        skip(count) { result = result.slice(count); return this; },
        limit(count) { result = result.slice(0, count); return this; },
        lean() {
          return Promise.resolve(result.map(({ _id, __v, ...publicFields }) => publicFields));
        },
      };
      return query;
    },
    countDocuments(filter) {
      if (failCount) return Promise.reject(new Error('internal database detail should not reach clients'));
      return Promise.resolve(rows.filter((row) => matches(row, filter)).length);
    },
    aggregate() {
      const counts = new Map();
      for (const row of rows) counts.set(row.continent, (counts.get(row.continent) || 0) + 1);
      return Promise.resolve([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([_id, count]) => ({ _id, count })));
    },
    findOne(filter) {
      const row = rows.find((country) => country.slug === filter.slug);
      return {
        select() { return this; },
        lean() {
          if (!row) return Promise.resolve(null);
          const { _id, __v, ...publicFields } = row;
          return Promise.resolve(publicFields);
        },
      };
    },
  };
}

async function withServer(countryModel, run) {
  const server = createApp({ CountryModel: countryModel }).listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('search, continent filter, sorting, and pagination use the requested query', async () => {
  await withServer(fakeCountryModel(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/countries?search=land&continent=Europe&sort=-name&page=1&limit=1`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.deepEqual(body.data.map((country) => country.name), ['Iceland']);
    assert.deepEqual(body.pagination, { page: 1, limit: 1, total: 2, totalPages: 2 });
    assert.equal('_id' in body.data[0], false);
    assert.equal('__v' in body.data[0], false);
  });
});

test('continents endpoint returns country counts', async () => {
  await withServer(fakeCountryModel(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/countries/continents`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body.data, [
      { continent: 'Asia', count: 1 },
      { continent: 'Europe', count: 2 },
    ]);
  });
});

test('country detail route returns a country and a missing slug returns 404', async () => {
  await withServer(fakeCountryModel(), async (baseUrl) => {
    const found = await fetch(`${baseUrl}/api/countries/japan`);
    assert.equal(found.status, 200);
    assert.equal((await found.json()).data.name, 'Japan');

    const missing = await fetch(`${baseUrl}/api/countries/not-a-country`);
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).success, false);
  });
});

test('invalid pagination and continent parameters return HTTP 400', async () => {
  await withServer(fakeCountryModel(), async (baseUrl) => {
    for (const query of ['limit=101', 'page=0', 'continent=Antarctica', 'sort=population']) {
      const response = await fetch(`${baseUrl}/api/countries?${query}`);
      assert.equal(response.status, 400, query);
      assert.equal((await response.json()).status, 'error');
    }
  });
});

test('database errors return a safe JSON error without stack or internal detail', async () => {
  await withServer(fakeCountryModel(countries, { failCount: true }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/countries`);
    const text = await response.text();
    assert.equal(response.status, 500);
    assert.match(text, /unexpected server error/i);
    assert.doesNotMatch(text, /internal database detail|stack|node_modules/i);
  });
});
