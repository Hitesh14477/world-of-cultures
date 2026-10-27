import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import { createApp } from '../src/app.js';

const country = { _id: 'country-india-id', slug: 'india' };
const CONTRIBUTOR_ID = 'contributor-test-id';
const CONTRIBUTOR_CSRF = 'contribution-test-csrf';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/xioAAAAASUVORK5CYII=', 'base64');
const TEST_IMAGE_STORAGE = { async upload() { return { url: 'https://images.example.test/submission.png', publicId: 'submission' }; }, async remove() {} };
const ADMIN_ORIGIN = 'http://localhost:5173';
const ADMIN_PASSWORD = 'contribution admin password 1234';
const ADMIN_SALT = randomBytes(16);
const ADMIN_HASH = `scrypt$${ADMIN_SALT.toString('base64url')}$${scryptSync(ADMIN_PASSWORD, ADMIN_SALT, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString('base64url')}`;

function contributorHeaders() {
  return { 'Content-Type': 'application/json', Origin: 'http://localhost:5173', 'X-Test-User': CONTRIBUTOR_ID, 'X-CSRF-Token': CONTRIBUTOR_CSRF };
}

function multipartContributorHeaders() {
  return { Origin: 'http://localhost:5173', 'X-Test-User': CONTRIBUTOR_ID, 'X-CSRF-Token': CONTRIBUTOR_CSRF };
}

function contributionForm(payload, image = PNG) {
  const form = new FormData();
  for (const [field, value] of Object.entries(payload)) {
    form.append(field, field === 'sources' ? JSON.stringify(value) : String(value ?? ''));
  }
  form.append('imageRightsConfirmed', 'true');
  form.append('image', new Blob([image], { type: 'image/png' }), 'contribution.png');
  return form;
}

function fakeCountryModel() {
  return {
    findOne(filter) {
      return {
        select() { return this; },
        lean() { return Promise.resolve(filter.slug === country.slug ? { _id: country._id } : null); },
      };
    },
  };
}

function fakeCollectionModel(records = []) {
  return {
    records,
    async create(document) {
      const stored = { ...document, _id: `record-${records.length + 1}` };
      records.push(stored);
      return stored;
    },
    find(filter) {
      const selected = records.filter((record) => record.country === filter.country && record.reviewStatus === filter.reviewStatus);
      return {
        select() { return this; },
        sort() { return this; },
        lean() { return Promise.resolve(selected); },
      };
    },
  };
}

async function withServer(models, run) {
  const userAuth = {
    requireUser(req, res, next) {
      if (req.get('x-test-user') !== CONTRIBUTOR_ID) return res.status(401).json({ success: false, message: 'Sign in to access this account.' });
      req.user = { id: CONTRIBUTOR_ID };
      req.userSession = { csrf: CONTRIBUTOR_CSRF };
      return next();
    },
    requireCsrf(req, res, next) {
      if (req.get('origin') !== 'http://localhost:5173' || req.get('x-csrf-token') !== CONTRIBUTOR_CSRF) return res.status(403).json({ success: false, message: 'The request could not be verified.' });
      return next();
    },
  };
  const server = createApp({ ...models, countryContributionAuth: userAuth }).listen(0, '127.0.0.1');
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

async function withAdminServer(models, run) {
  const members = [];
  const UserModel = {
    findOne(filter) {
      return {
        select() { return this; },
        lean() { return Promise.resolve(members.find((member) => (filter.adminIdentity ? member.adminIdentity === filter.adminIdentity : filter.username ? member.username === filter.username : false)) || null); },
      };
    },
    async create(document) {
      const member = { _id: `admin-member-${members.length + 1}`, ...document };
      members.push(member);
      return member;
    },
  };
  const server = createApp({
    ...models,
    UserModel,
    userEnv: { USER_SESSION_SECRET: 'contribution-user-session-secret-0123456789', FRONTEND_ORIGIN: ADMIN_ORIGIN },
    adminEnv: { NODE_ENV: 'test', FRONTEND_ORIGIN: ADMIN_ORIGIN, ADMIN_USERNAME: 'editor', ADMIN_PASSWORD_HASH: ADMIN_HASH, ADMIN_SESSION_SECRET: 'contribution-admin-session-secret-0123456789' },
  }).listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const address = server.address();
  try { await run(`http://127.0.0.1:${address.port}`, members); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

function validEntry(overrides = {}) {
  return {
    title: 'A sourced cultural practice',
    category: 'customs_and_traditions',
    content: 'A clear description supported by a source.',
    sources: [{ title: 'Reference page', publisher: 'Cultural institution', url: 'https://example.org/reference' }],
    ...overrides,
  };
}

function validPlace(overrides = {}) {
  return {
    name: 'A documented place',
    category: 'heritage_site',
    description: 'A place description supported by a reliable reference.',
    sources: [{ title: 'Heritage record', publisher: 'Heritage institution', url: 'https://example.org/place' }],
    ...overrides,
  };
}

test('POST cultural entry with image creates a record with country ObjectId and server-set pending status', async () => {
  const entries = fakeCollectionModel();
  await withServer({ CountryModel: fakeCountryModel(), CulturalEntryModel: entries, communityImageStorage: TEST_IMAGE_STORAGE }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/countries/india/cultural-entries`, {
      method: 'POST',
      headers: multipartContributorHeaders(),
      body: contributionForm(validEntry()),
    });
    const body = await response.json();
    assert.equal(response.status, 201);
    assert.equal(body.data.reviewStatus, 'pending_review');
    assert.equal(entries.records.length, 1);
    assert.equal(entries.records[0].country, country._id);
    assert.equal(entries.records[0].submittedBy, CONTRIBUTOR_ID);
    assert.equal(entries.records[0].reviewStatus, 'pending_review');
  });
});

test('POST place with image creates a record using the existing country lookup and Place category', async () => {
  const places = fakeCollectionModel();
  await withServer({ CountryModel: fakeCountryModel(), PlaceModel: places, communityImageStorage: TEST_IMAGE_STORAGE }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/countries/india/places`, {
      method: 'POST',
      headers: multipartContributorHeaders(),
      body: contributionForm(validPlace({ reviewStatus: 'published' })),
    });
    const body = await response.json();
    assert.equal(response.status, 201);
    assert.equal(body.data.reviewStatus, 'pending_review');
    assert.equal(places.records[0].country, country._id);
    assert.equal(places.records[0].category, 'heritage_site');
    assert.ok(places.records[0].image.url);
  });
});

test('administrator session can submit cultural content as a member and it remains pending review', async () => {
  const entries = fakeCollectionModel();
  await withAdminServer({ CountryModel: fakeCountryModel(), CulturalEntryModel: entries, communityImageStorage: TEST_IMAGE_STORAGE }, async (baseUrl, members) => {
    const login = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { Origin: ADMIN_ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'editor', password: ADMIN_PASSWORD }),
    });
    assert.equal(login.status, 200);
    const adminCookie = login.headers.get('set-cookie').split(';')[0];
    const memberResponse = await fetch(`${baseUrl}/api/admin/member-session`, { headers: { Cookie: adminCookie } });
    const memberData = (await memberResponse.json()).data;
    const member = memberData.member;
    const form = contributionForm(validEntry());
    const response = await fetch(`${baseUrl}/api/countries/india/cultural-entries`, {
      method: 'POST',
      headers: { Origin: ADMIN_ORIGIN, Cookie: adminCookie, 'X-CSRF-Token': memberData.csrfToken },
      body: form,
    });
    const body = await response.json();
    assert.equal(response.status, 201);
    assert.equal(body.data.reviewStatus, 'pending_review');
    assert.equal(entries.records[0].submittedBy, member.id);
    assert.equal(members.length, 1);
  });
});

test('signed-out visitors cannot submit cultural entries or places', async () => {
  const entries = fakeCollectionModel();
  const places = fakeCollectionModel();
  await withServer({ CountryModel: fakeCountryModel(), CulturalEntryModel: entries, PlaceModel: places }, async (baseUrl) => {
    for (const [path, payload] of [['cultural-entries', validEntry()], ['places', validPlace()]]) {
      const response = await fetch(`${baseUrl}/api/countries/india/${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      assert.equal(response.status, 401);
    }
    assert.equal(entries.records.length, 0);
    assert.equal(places.records.length, 0);
  });
});

test('invalid categories and malformed source URLs return field errors and do not create records', async () => {
  const entries = fakeCollectionModel();
  await withServer({ CountryModel: fakeCountryModel(), CulturalEntryModel: entries, communityImageStorage: TEST_IMAGE_STORAGE }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/countries/india/cultural-entries`, {
      method: 'POST',
      headers: contributorHeaders(),
      body: JSON.stringify(validEntry({ category: 'not_a_category', sources: [{ title: 'Bad ref', publisher: 'Publisher', url: 'javascript:alert(1)' }] })),
    });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.ok(body.errors.some(({ field }) => field === 'category'));
    assert.ok(body.errors.some(({ field }) => field === 'sources.0.url'));
    assert.equal(entries.records.length, 0);
  });
});

test('missing required fields and oversized place descriptions are rejected', async () => {
  const entries = fakeCollectionModel();
  const places = fakeCollectionModel();
  await withServer({ CountryModel: fakeCountryModel(), CulturalEntryModel: entries, PlaceModel: places }, async (baseUrl) => {
    const missing = await fetch(`${baseUrl}/api/countries/india/cultural-entries`, {
      method: 'POST',
      headers: contributorHeaders(),
      body: JSON.stringify({}),
    });
    const missingBody = await missing.json();
    assert.equal(missing.status, 400);
    assert.ok(missingBody.errors.some(({ field }) => field === 'title'));
    assert.ok(missingBody.errors.some(({ field }) => field === 'sources'));
    assert.ok(missingBody.errors.some(({ field }) => field === 'image'));

    const oversized = await fetch(`${baseUrl}/api/countries/india/places`, {
      method: 'POST',
      headers: multipartContributorHeaders(),
      body: contributionForm(validPlace({ description: 'x'.repeat(5001) })),
    });
    const oversizedBody = await oversized.json();
    assert.equal(oversized.status, 400);
    assert.ok(oversizedBody.errors.some(({ field }) => field === 'description'));
    assert.equal(entries.records.length, 0);
    assert.equal(places.records.length, 0);
  });
});

test('an attempted published status is ignored and the pending record stays hidden from public reads', async () => {
  const entries = fakeCollectionModel();
  await withServer({ CountryModel: fakeCountryModel(), CulturalEntryModel: entries, communityImageStorage: TEST_IMAGE_STORAGE }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/countries/india/cultural-entries`, {
      method: 'POST',
      headers: multipartContributorHeaders(),
      body: contributionForm(validEntry({ reviewStatus: 'published' })),
    });
    assert.equal(response.status, 201);
    assert.equal(entries.records[0].reviewStatus, 'pending_review');

    const publicResponse = await fetch(`${baseUrl}/api/countries/india/cultural-entries`);
    assert.equal(publicResponse.status, 200);
    assert.deepEqual((await publicResponse.json()).data, []);
  });
});

test('unknown country slug returns 404 and does not create a submission', async () => {
  const places = fakeCollectionModel();
  await withServer({ CountryModel: fakeCountryModel(), PlaceModel: places }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/countries/no-country/places`, {
      method: 'POST',
      headers: multipartContributorHeaders(),
      body: contributionForm(validPlace()),
    });
    assert.equal(response.status, 404);
    assert.equal(places.records.length, 0);
  });
});

test('multipart contribution uploads a validated image and saves it pending review', async () => {
  const entries = fakeCollectionModel();
  const uploads = [];
  const imageStorage = {
    async upload(buffer, folder) {
      uploads.push({ buffer, folder });
      return { url: 'https://images.example.test/cultural/photo.png', publicId: 'cultural/photo' };
    },
    async remove() {},
  };
  await withServer({ CountryModel: fakeCountryModel(), CulturalEntryModel: entries, communityImageStorage: imageStorage }, async (baseUrl) => {
    const form = new FormData();
    form.append('title', 'A sourced cultural practice');
    form.append('category', 'customs_and_traditions');
    form.append('content', 'A clear description supported by a source.');
    form.append('sources', JSON.stringify([{ title: 'Reference page', publisher: 'Cultural institution', url: 'https://example.org/reference' }]));
    form.append('imageCaption', 'A contributor-provided caption.');
    form.append('imageRightsConfirmed', 'true');
    form.append('image', new Blob([PNG], { type: 'image/png' }), 'photo.png');
    const response = await fetch(`${baseUrl}/api/countries/india/cultural-entries`, { method: 'POST', headers: multipartContributorHeaders(), body: form });
    const body = await response.json();
    assert.equal(response.status, 201);
    assert.equal(uploads.length, 1);
    assert.equal(uploads[0].folder, 'world-of-cultures/cultural-submissions');
    assert.equal(entries.records[0].image.url, 'https://images.example.test/cultural/photo.png');
    assert.equal(entries.records[0].image.publicId, 'cultural/photo');
    assert.equal(entries.records[0].image.caption, 'A contributor-provided caption.');
    assert.equal(entries.records[0].image.rightsConfirmed, true);
    assert.ok(entries.records[0].image.rightsConfirmedAt instanceof Date);
    assert.equal(entries.records[0].reviewStatus, 'pending_review');
    assert.equal(body.data.reviewStatus, 'pending_review');
  });
});

test('invalid upload bytes and unconfirmed image rights are rejected before storage upload', async () => {
  let uploads = 0;
  const imageStorage = { async upload() { uploads += 1; return { url: 'https://images.example.test/photo.png', publicId: 'photo' }; } };
  await withServer({ CountryModel: fakeCountryModel(), PlaceModel: fakeCollectionModel(), communityImageStorage: imageStorage }, async (baseUrl) => {
    const invalid = new FormData();
    invalid.append('image', new Blob(['not image bytes'], { type: 'image/png' }), 'photo.png');
    let response = await fetch(`${baseUrl}/api/countries/india/places`, { method: 'POST', headers: multipartContributorHeaders(), body: invalid });
    assert.equal(response.status, 415);

    const unconfirmed = new FormData();
    unconfirmed.append('name', 'Documented place');
    unconfirmed.append('category', 'heritage_site');
    unconfirmed.append('description', 'A place description supported by a reliable reference.');
    unconfirmed.append('sources', JSON.stringify([{ title: 'Heritage record', publisher: 'Heritage institution', url: 'https://example.org/place' }]));
    unconfirmed.append('image', new Blob([PNG], { type: 'image/png' }), 'photo.png');
    response = await fetch(`${baseUrl}/api/countries/india/places`, { method: 'POST', headers: multipartContributorHeaders(), body: unconfirmed });
    assert.equal(response.status, 400);

    const oversized = new FormData();
    oversized.append('image', new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/png' }), 'large.png');
    response = await fetch(`${baseUrl}/api/countries/india/places`, { method: 'POST', headers: multipartContributorHeaders(), body: oversized });
    assert.equal(response.status, 413);
    assert.equal(uploads, 0);
  });
});

test('source license metadata must include full attribution details when any license field is entered', async () => {
  const places = fakeCollectionModel();
  const storage = { async upload() { return { url: 'https://images.example.test/place.png', publicId: 'place' }; }, async remove() {} };
  await withServer({ CountryModel: fakeCountryModel(), PlaceModel: places, communityImageStorage: storage }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/countries/india/places`, {
      method: 'POST',
      headers: multipartContributorHeaders(),
      body: contributionForm(validPlace({ sources: [{ title: 'Reference', publisher: 'Publisher', url: 'https://example.org', license: 'CC BY 4.0' }] })),
    });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.ok(body.errors.some(({ field }) => field === 'sources.0.licenseUrl'));
    assert.equal(places.records.length, 0);
  });
});

test('database failures return a generic error without leaking internal details', async () => {
  const failingPlaces = { create: async () => { throw new Error('private connection detail'); } };
  const storage = { async upload() { return { url: 'https://images.example.test/place.png', publicId: 'place' }; }, async remove() {} };
  await withServer({ CountryModel: fakeCountryModel(), PlaceModel: failingPlaces, communityImageStorage: storage }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/countries/india/places`, {
      method: 'POST',
      headers: multipartContributorHeaders(),
      body: contributionForm(validPlace()),
    });
    const body = await response.text();
    assert.equal(response.status, 500);
    assert.match(body, /unexpected server error/i);
    assert.doesNotMatch(body, /private connection detail|stack|node_modules/i);
  });
});
