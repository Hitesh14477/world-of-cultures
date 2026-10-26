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
- `backend/.env.example` — safe backend environment template; copy to `.env` only if a local file does not already exist.
- `package.json` — root commands for starting both apps or either app separately.
