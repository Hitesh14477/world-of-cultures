import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDatabase } from './src/config/database.js';
import { createApp } from './src/app.js';

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || '.env' });

const port = Number(process.env.PORT) || 5001;
const app = createApp();

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