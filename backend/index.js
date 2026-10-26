import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { connectDatabase } from './src/config/database.js';
import { errorHandler, notFoundHandler } from './src/middleware/errorHandler.js';

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || '.env' });

const app = express();
const port = Number(process.env.PORT) || 5001;
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

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(port, () => {
  console.info(`API server listening on port ${port}.`);
});

void connectDatabase();

function shutDown() {
  server.close(() => {
    void mongoose.disconnect().finally(() => process.exit(0));
  });
}

process.on('SIGINT', shutDown);
process.on('SIGTERM', shutDown);
