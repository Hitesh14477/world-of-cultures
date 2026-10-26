import mongoose from 'mongoose';

export async function connectDatabase(uri = process.env.MONGODB_URI) {
  if (!uri) {
    console.warn('MONGODB_URI is not configured; the API will run without a database connection.');
    return false;
  }

  try {
    await mongoose.connect(uri);
    console.info('MongoDB connected.');
    return true;
  } catch {
    // Avoid logging the connection error because it can contain connection details.
    console.error('MongoDB connection failed. Check MONGODB_URI and database availability.');
    return false;
  }
}

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected.');
});

mongoose.connection.on('error', () => {
  // Do not print driver errors because they may include connection details.
  console.error('MongoDB reported a connection error.');
});
