import 'dotenv/config';
import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { connectDatabase } from '../config/database.js';
import Country from '../models/Country.js';
import CulturalEntry from '../models/CulturalEntry.js';
import Place from '../models/Place.js';
import { buildCulturalCoverageReport } from '../services/culturalCoverage.js';

export async function readCulturalCoverage({ connect = connectDatabase } = {}) {
  const connected = await connect();
  if (!connected) throw new Error('Database connection is unavailable.');
  try {
    const [countries, culturalEntries, places] = await Promise.all([
      Country.find({}).select('_id name slug').lean(),
      CulturalEntry.find({}).select('country category reviewStatus').lean(),
      Place.find({}).select('country reviewStatus').lean(),
    ]);
    return buildCulturalCoverageReport({ countries, culturalEntries, places });
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  try {
    console.log(JSON.stringify(await readCulturalCoverage(), null, 2));
  } catch {
    console.error('Coverage report failed. Database details were suppressed; no records were changed.');
    process.exitCode = 1;
    await mongoose.disconnect().catch(() => {});
  }
}
