import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

const countries = [
  { name: 'Finland', officialName: 'Republic of Finland', slug: 'finland', cca2: 'FI', continent: 'Europe', _id: 'internal-1', __v: 0 },
  { name: 'Iceland', officialName: 'Republic of Iceland', slug: 'iceland', cca2: 'IS', continent: 'Europe', _id: 'internal-2', __v: 0 },
  { name: 'Japan', officialName: 'Japan', slug: 'japan', cca2: 'JP', continent: 'Asia', _id: 'internal-3', __v: 0, culture: { history: [{ title: 'Unreviewed legacy history', content: 'Not approved for public display.' }] } },
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
        projection: '',
        select(fields) { this.projection = fields; return this; },
        lean() {
          if (!row) return Promise.resolve(null);
          if (this.projection === '_id') return Promise.resolve({ _id: row._id });
          const { _id, __v, ...publicFields } = row;
          if (this.projection?.split(/\s+/).includes('-culture')) delete publicFields.culture;
          return Promise.resolve(publicFields);
        },
      };
    },
  };
}

async function withServer(countryModel, run, extraModels = {}) {
  const server = createApp({ CountryModel: countryModel, ...extraModels }).listen(0, '127.0.0.1');
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

function fakePublicItems(rows) {
  return {
    find(filter) {
      let result = rows.filter((row) => row.country === filter.country && row.reviewStatus === filter.reviewStatus);
      let projection = '';
      return {
        select(fields) { projection = fields; return this; },
        sort() { return this; },
        lean() {
          const fields = projection.split(/\s+/).filter(Boolean);
          return Promise.resolve(result.map((row) => Object.fromEntries(fields.filter((field) => field in row).map((field) => [field, row[field]]))));
        },
      };
    },
  };
}

test('credentialed CORS reflects only the configured frontend origin', async () => {
  await withServer(fakeCountryModel(), async (baseUrl) => {
    const allowed = await fetch(`${baseUrl}/api/health`, { headers: { Origin: 'http://localhost:5173' } })
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5173')
    assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true')

    const denied = await fetch(`${baseUrl}/api/health`, { headers: { Origin: 'https://untrusted.example' } })
    assert.equal(denied.headers.get('access-control-allow-origin'), null)
  })
})

test('production startup requires an exact public HTTPS frontend origin', () => {
  const oldNodeEnv = process.env.NODE_ENV
  const oldFrontendOrigin = process.env.FRONTEND_ORIGIN
  try {
    process.env.NODE_ENV = 'production'
    delete process.env.FRONTEND_ORIGIN
    assert.throws(() => createApp(), /FRONTEND_ORIGIN must be configured in production/)
    process.env.FRONTEND_ORIGIN = 'http://localhost:5173'
    assert.throws(() => createApp(), /public HTTPS origin in production/)
    process.env.FRONTEND_ORIGIN = 'https://cultures.example'
    assert.doesNotThrow(() => createApp())
  } finally {
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = oldNodeEnv
    if (oldFrontendOrigin === undefined) delete process.env.FRONTEND_ORIGIN
    else process.env.FRONTEND_ORIGIN = oldFrontendOrigin
  }
})

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
    const country = (await found.json()).data;
    assert.equal(country.name, 'Japan');
    assert.equal('culture' in country, false);

    const missing = await fetch(`${baseUrl}/api/countries/not-a-country`);
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).success, false);
  });
});

test('country cultural endpoints return only published records with source metadata', async () => {
  const entryModel = fakePublicItems([
    { country: 'internal-3', category: 'history', title: 'Published history', reviewStatus: 'published', sourceKey: 'private:entry-key', rejectionReason: 'private moderation note', sources: [{ title: 'Source', url: 'https://example.org' }], facts: [{ propertyId: 'P571', propertyLabel: 'inception', value: '1500', references: [{ title: 'Reference', url: 'https://example.org/fact' }] }] },
    { country: 'internal-3', category: 'history', title: 'Unreviewed draft', reviewStatus: 'pending_review', sources: [] },
  ]);
  const placeModel = fakePublicItems([
    { country: 'internal-3', name: 'Published place', reviewStatus: 'published', category: 'landmark', sourceKey: 'private:place-key', rejectionReason: 'private moderation note', facts: [{ propertyId: 'P131', propertyLabel: 'located in', value: 'Agra', references: [{ title: 'Reference', url: 'https://example.org/place-fact' }] }] },
    { country: 'internal-3', name: 'Unreviewed place', reviewStatus: 'draft', category: 'landmark' },
  ]);

  await withServer(fakeCountryModel(), async (baseUrl) => {
    const entriesResponse = await fetch(`${baseUrl}/api/countries/japan/cultural-entries`);
    const entries = await entriesResponse.json();
    assert.equal(entriesResponse.status, 200);
    assert.deepEqual(entries.data.map((entry) => entry.title), ['Published history']);
    assert.equal(entries.data[0].sources[0].url, 'https://example.org');
    assert.equal(entries.data[0].facts[0].propertyId, 'P571');
    assert.equal('sourceKey' in entries.data[0], false);
    assert.equal('rejectionReason' in entries.data[0], false);

    const placesResponse = await fetch(`${baseUrl}/api/countries/japan/places`);
    const places = await placesResponse.json();
    assert.equal(placesResponse.status, 200);
    assert.deepEqual(places.data.map((place) => place.name), ['Published place']);
    assert.equal(places.data[0].facts[0].propertyId, 'P131');
    assert.equal('sourceKey' in places.data[0], false);
    assert.equal('rejectionReason' in places.data[0], false);

    const missing = await fetch(`${baseUrl}/api/countries/no-such-country/places`);
    assert.equal(missing.status, 404);
  }, { CulturalEntryModel: entryModel, PlaceModel: placeModel });
});

test('unknown routes do not reflect query parameters in public error responses', async () => {
  await withServer(fakeCountryModel(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/unknown-route?token=private-value`);
    const body = await response.text();
    assert.equal(response.status, 404);
    assert.match(body, /Route not found/);
    assert.doesNotMatch(body, /private-value|unknown-route/);
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
