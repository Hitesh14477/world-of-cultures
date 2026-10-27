# World of Cultures

World of Cultures is a MERN project. The frontend and backend run independently and can also be started together from the repository root.

## Requirements

- Node.js 20.19+ (or 22.12+) and npm
- MongoDB running locally, or a MongoDB connection string

## Environment setup

The backend reads `MONGODB_URI`, `PORT`, `NODE_ENV`, and `FRONTEND_ORIGIN` from `backend/.env`. The frontend reads `VITE_API_URL` from `frontend/vite-project/.env`.

For production, set `VITE_API_URL` at frontend build time to the deployed API origin ending in `/api`. It may be left unset only when the frontend host proxies `/api` to the backend on the same origin. Production builds never fall back to localhost. Set `FRONTEND_ORIGIN` to the exact deployed frontend origin; the backend refuses to start in production without it.

Create local env files from the safe examples only when the files do not already exist:

```sh
test -f backend/.env || cp backend/.env.example backend/.env
test -f frontend/vite-project/.env || cp frontend/vite-project/.env.example frontend/vite-project/.env
```

If `backend/.env` already exists, keep it. Add or update `MONGODB_URI` there without sharing its value. The root `.gitignore` excludes local env files.

## Administrator review

The moderation API uses a server-verified administrator session. Set `ADMIN_USERNAME` and a unique `ADMIN_SESSION_SECRET` of at least 32 characters in `backend/.env`. Provision or replace the administrator password hash with the hidden-input command below; it updates only `ADMIN_PASSWORD_HASH` in the existing local env file and does not display the password or hash:

```sh
npm run admin:set-password --prefix backend
```

The password must be at least 14 characters. Keep `backend/.env` private and out of Git. The app uses Node's built-in scrypt password hashing, an HttpOnly, SameSite=Strict session cookie, CSRF tokens for state changes, and an in-memory login throttle. Production cookies are marked Secure when `NODE_ENV=production`; production must use HTTPS and set `FRONTEND_ORIGIN` to the exact frontend origin. Because the cookie uses SameSite=Strict, deploy the frontend and API on the same site (or behind a same-origin proxy) and verify sign-in in the target browsers. There is no public administrator-registration endpoint.

Administrator routes:

- `POST /api/admin/login` and `POST /api/admin/logout`
- `GET /api/admin/session` and `GET /api/admin/pending`
- `GET /api/admin/submissions/:type/:id`
- `POST /api/admin/submissions/:type/:id/approve` and `/reject`

The `:type` value is `cultural-entries` or `places`. All review routes require the administrator session; state-changing requests also require the session CSRF token. Approval publishes a pending record. Rejection leaves it hidden and can store an optional review reason. A rejection reason field was added as an optional, bounded schema field; no data migration is needed. Existing data and review states are not changed by the schema update.

Open `/admin/login` locally after setting up the backend environment to access the review dashboard. Pending records stay private; only approved and published records appear in the public country APIs.

## User accounts and favourites

Regular accounts use a separate `USER_SESSION_SECRET` in `backend/.env`; use a random value of at least 32 characters and keep it distinct from `ADMIN_SESSION_SECRET`. Regular accounts are self-registered by email and password. Passwords are hashed with Node's built-in asynchronous scrypt using a new random salt per account; no extra password package is required. Registration requires a password of at least 12 characters. There is no administrator role field or public way to grant administrator access.

An administrator session also has a separate, server-managed member profile so the signed-in administrator can contribute cultural content, post and interact in Community, use My Collection, and edit available member profile details. The profile is keyed by a private server-generated admin identity, has no public login credentials, and keeps the administrator's collection separate from regular users. Member actions validate the signed admin cookie and its CSRF token server-side; administrator review endpoints continue to require the administrator role check.

Regular user sessions use the `woc_user_session` HttpOnly cookie, separate from the administrator cookie. State-changing requests require the CSRF header and the configured frontend origin. The cookie is SameSite Strict and Secure in production. User accounts are not email-verified in this stage.

User endpoints:

- `POST /api/users/register`, `POST /api/users/login`, `POST /api/users/logout`, and `GET /api/users/session`
- `GET /api/users/me/favourites`, `POST /api/users/me/favourites`
- `GET /api/users/me/favourites/:type/:id` and `DELETE /api/users/me/favourites/:type/:id`

Favourite `type` is `country`, `cultural-entry`, or `place`; country references use country slugs and cultural/place references use MongoDB identifiers. Users can only access their own collection. Cultural entries and places must be published when saved and are filtered again when the collection is read. Unique database indexes prevent duplicate favourites. No existing content records are modified.

Use `/register` or `/login` in the frontend; `/my-collection` shows saved items.

## Install dependencies

```sh
npm install
npm install --prefix frontend/vite-project
npm install --prefix backend
```

## Run the applications

Start both development servers from the root:

```sh
npm run dev
```

Or start either application in its own terminal:

```sh
npm run dev:frontend
npm run dev:backend
```

The frontend defaults to `http://localhost:5173`. The backend defaults to `http://localhost:5001` and exposes `GET /api/health`. Port 5001 avoids the macOS AirPlay service commonly using port 5000. If the frontend port is already in use, set `FRONTEND_PORT` and set the backend's `FRONTEND_ORIGIN` to the matching origin before starting both apps.

## Checks

```sh
npm run lint:frontend
npm run build:frontend
```

The health endpoint returns the API status and MongoDB status. Its HTTP status is `200` when MongoDB is connected and `503` when the database is disconnected. The API process can still start without MongoDB so the health response remains available. If the initial MongoDB connection fails, correct the URI or start MongoDB and restart the backend; Mongoose does not automatically retry a failed initial connection.

## Project structure

- `frontend/vite-project/src/` — React + Vite application pages, shared components, styles, and services.
- `frontend/vite-project/src/services/api.js` — shared credentialed Axios client and API functions.
- `frontend/vite-project/vite.config.js` — Vite, React, and Tailwind CSS v4 plugins.
- `backend/index.js` — ES Module server entry point and platform-port listener.
- `backend/src/app.js` — Express middleware, API route registration, CORS, and health route.
- `backend/src/config/database.js` — Mongoose connection setup with safe connection logging.
- `backend/src/middleware/errorHandler.js` — JSON responses for unknown routes and server errors.
- `backend/src/models/Country.js` — country identifiers, directory facts, and structured placeholders for sourced cultural content.
- `backend/src/controllers/countryController.js` and `backend/src/routes/countryRoutes.js` — read-only country directory API.
- `backend/src/services/countryImport.js` and `backend/src/scripts/importCountries.js` — explicit, repeatable country data import; it never runs on server startup.
- `backend/tests/` — model, import-safety, and API tests using Node's built-in test runner.
- `backend/.env.example` — safe backend environment template; copy to `.env` only if a local file does not already exist.
- `package.json` — root commands for starting both apps or either app separately.

## Stage 2 country data

The Country model stores ISO identifiers, names, geography, demographics, flags, languages, currencies, time zones, and structured cultural sections with source metadata. Cultural sections start empty so later researched content can be added without the import overwriting it.

The optional import script targets the 193 United Nations member states and the two non-member observer states identified by ISO codes `VA` and `PS`. It validates the complete scope and all normalized records before connecting and writing; it never deletes records. Re-running it updates changed source facts by ISO code, preserves existing slugs and cultural content, and skips unchanged records. It does not run automatically.

Import scripts are protected by `backend/src/services/importPolicyRegistry.js` and `importPolicyGate.js`. The country importer is currently blocked: the recorded REST Countries terms permit only short-lived caching, and no permission for persistent database storage is approved. The gate runs before remote fetches, offline-file reads, or database connections. The cultural pilot importer is also blocked because the UNESCO source policies and persistent import operation have not been verified and approved. Existing data is not affected by the gate.

Run the explicit import only when you are ready:

```sh
npm run import:countries --prefix backend
```

These commands will stop at the source-policy gate until the registry is updated with current evidence that explicitly permits the relevant use, storage mode, retention, and attribution. An API key or public endpoint alone is not that evidence. Do not use an offline snapshot to bypass the gate.

## Cultural content coverage and batches

`npm run report:cultural-coverage --prefix backend` performs read-only counts across the countries, cultural entries, and places currently in MongoDB. It reports published coverage for the nine `CulturalEntry` categories plus `places`, status totals, and missing topics per country. It returns metadata only, not article text or moderation notes.

The cultural pilot importer accepts bounded country batches, for example `npm run import:cultural-pilot --prefix backend -- --dry-run --countries=india,japan`. To select only candidates from one registered source policy, add `--source-id=wikidata-structured-data`; this excludes the existing UNESCO candidates, whose policies remain unverified. The batch selector accepts up to 20 country slugs that have researched candidate records in the script's manifest. Candidates are validated against the existing models, resolved by country slug, checked by stable source key and natural key, and proposed as `pending_review`. Re-running an already processed batch skips matching records rather than overwriting them. Use small country batches as the researched manifest grows; do not fill gaps with generated or unsupported claims.

UNESCO source policies remain unverified, so candidates using those sources are blocked. Wikidata structured data has a narrowly scoped, evidence-linked policy for referenced structured facts only. The cultural importer still fails closed for any candidate whose source policy is missing, unverified, expired, lacks an explicitly approved operation, or whose source license metadata does not match the verified policy.

## Community photo sharing

The Community page is a separate user-generated photo feed; posts are not CulturalEntry records and are not treated as verified cultural information. The feed starts empty and is populated only by user submissions. Sign in to create, edit, or remove your own post. Community photos use Cloudinary storage through the backend and are limited to JPEG, PNG, or WebP up to 5 MB.

Configure `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in `backend/.env` for uploads. The values are server-only; do not add them to frontend environment files or commit them. If these variables are absent, post creation returns a configuration error rather than storing files locally. The backend environment template contains empty placeholders.

Administrators can edit or remove a published community post through `PATCH` or `DELETE /api/community/moderation/:id`, protected by the existing separate administrator session and CSRF check. Likes are authenticated and idempotent; comments are public to read and authenticated to add, with removal limited to the comment author, post owner, or administrator. A community reports queue and restoration workflow are not implemented.

Run the focused API tests with `node --test tests/community.test.js` from `backend/`, or run the complete backend suite with `npm test --prefix backend`. Start the full project using the existing root development command.

### Structured cultural research

`backend/src/services/wikidataResearch.js` is a mock-testable Wikidata structured-fact adapter. The registry permits only the specifically listed persistent structured-data research and cultural-pilot import operations. The adapter requires verified license metadata and externally referenced claims; it does not create prose or assign cultural categories. A curator must verify each fact, select its category, write an original summary, and add the fact/source metadata to a candidate before using the existing pilot importer. Structured claims remain in `facts`, separate from `summary` and `content`, and are displayed with their sources in admin and public detail views.

This adapter is a research aid, not evidence of comprehensive coverage. Wikidata's structured data is CC0 1.0 under its official licensing policy; this approval does not include Wikipedia prose (generally CC BY-SA 4.0) or any Wikimedia Commons media. The client identifies itself, sends `maxlag=5`, uses serial requests, and stops on errors rather than retrying rapidly. Resume only after the applicable `Retry-After` delay. Wikidata may support selected language, place, date, or other properties when a referenced statement exists. It is not reliable as a complete source for traditional food, festivals, clothing, customs, mythology, music, or everyday life. Those topics need well-sourced human research. Wikimedia Commons is not queried or used for images in this pilot because file-level licensing and attribution must be checked separately and no Commons policy is approved for storage.

The reviewed policy references are official: [Wikidata Licensing](https://www.wikidata.org/wiki/Wikidata:Licensing), [Wikimedia API access policy](https://www.mediawiki.org/wiki/Wikimedia_APIs/Access_policy), [API usage guidelines](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_API_Usage_Guidelines), [current API rate limits](https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits), and [Terms of Use](https://foundation.wikimedia.org/wiki/Terms_of_Use). This project records those as evidence for its limited Wikidata policy; re-check them by the registry's internal review date.

## Country API

All endpoints are under `/api/countries` and return JSON. Country list responses include `success`, `data`, and pagination metadata.

- `GET /api/countries` — paginated list. Optional `page` (default `1`), `limit` (default `20`, max `100`), `search` (country common or official name), `continent` (one of Africa, Asia, Europe, North America, Oceania, South America), and `sort` (`name` or `-name`).
- `GET /api/countries/continents` — available continent names and current record counts.
- `GET /api/countries/:slug` — one country with all stored fields, or a JSON 404 response.

Examples:

```text
GET http://localhost:5001/api/countries?search=Japan&page=1&limit=20
GET http://localhost:5001/api/countries?continent=Asia&sort=-name
GET http://localhost:5001/api/countries/continents
GET http://localhost:5001/api/countries/japan
```

## Global search API

`GET /api/search` searches country names and supported facts, plus published cultural entries and places. Results are grouped in country, cultural-entry, then place order and paginated across that combined order. Empty unfiltered searches return an empty page rather than scanning the full catalog.

Supported query parameters:

- `q` — case-insensitive text search (up to 100 characters); regex characters are treated literally.
- `type` — `country`, `cultural-entry`, or `place`.
- `country` — country slug.
- `continent` — one of the supported country continents.
- `region` — matches a country region or subregion.
- `category` — one of the cultural-entry categories; selects cultural-entry results.
- `page` — 1–1000; `limit` — 1–50 (default 20).

For example: `GET /api/search?q=festival&continent=Asia&type=cultural-entry&category=festivals`. Cultural entries and places are filtered to `reviewStatus: "published"` on the server. Search results contain only display fields and links can be built from the result type, country slug, and record identifier.

Run backend tests with `npm test --prefix backend`. They use Node's built-in test runner and do not require a live MongoDB database.
