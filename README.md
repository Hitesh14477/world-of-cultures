# World of Cultures

World of Cultures is a MERN project. The frontend and backend run independently and can also be started together from the repository root.

## Requirements

- Node.js 20.19+ (or 22.12+) and npm
- MongoDB running locally, or a MongoDB connection string

## Environment setup

The backend reads `MONGODB_URI`, `PORT`, `NODE_ENV`, and `FRONTEND_ORIGIN` from `backend/.env`. The frontend reads `VITE_API_URL` from `frontend/vite-project/.env`.

Create local env files from the safe examples only when the files do not already exist:

```sh
test -f backend/.env || cp backend/.env.example backend/.env
test -f frontend/vite-project/.env || cp frontend/vite-project/.env.example frontend/vite-project/.env
```

If `backend/.env` already exists, keep it. Add or update `MONGODB_URI` there without sharing its value. The root `.gitignore` excludes local env files.

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

- `frontend/vite-project/src/` — existing React + Vite starter, global styles, and the reusable Axios client in `api/client.js`.
- `frontend/vite-project/vite.config.js` — Vite, React, and Tailwind CSS v4 plugins.
- `backend/index.js` — ES Module server entry point, middleware, and health route.
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

The remote source is REST Countries API v5. That service currently requires an API key. Add it locally as `REST_COUNTRIES_API_KEY` in `backend/.env`; alternatively set `COUNTRIES_SOURCE_FILE` to a local JSON file containing a complete API record array (or a full `{ "data": { "objects": [...] } }` response). The source file is not part of this repository. The script fails before database writes if a source is incomplete or does not match the expected scope.

Run the explicit import only when you are ready:

```sh
npm run import:countries --prefix backend
```

The initial import supplies factual directory fields only; it does not populate cultural narratives. The REST Countries dataset may have gaps in optional fields, so missing facts remain absent rather than being guessed. Review its current data license and attribution terms before distributing imported data.

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

Run backend tests with `npm test --prefix backend`. They use Node's built-in test runner and do not require a live MongoDB database.
