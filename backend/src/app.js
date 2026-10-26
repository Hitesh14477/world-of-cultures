import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import Country from './models/Country.js';
import { createCountryRouter } from './routes/countryRoutes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export function createApp({ CountryModel = Country } = {}) {
  const app = express();
  const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

  app.use(cors({ origin: frontendOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (req, res) => {
    const databaseConnected = mongoose.connection.readyState === 1;
    return res.status(databaseConnected ? 200 : 503).json({
      api: 'ok',
      database: databaseConnected ? 'connected' : 'disconnected',
    });
  });

  app.use('/api/countries', createCountryRouter(CountryModel));
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
