import mongoose from 'mongoose';
import { config } from './index.js';

mongoose.set('strictQuery', true);

/**
 * Connect to MongoDB Atlas. Called once at boot by both web and worker
 * processes. Throws on failure so the caller can decide to exit.
 */
export async function connectDB() {
  await mongoose.connect(config.mongoUri, {
    serverSelectionTimeoutMS: 10000,
  });
  const { host, name } = mongoose.connection;
  console.log(`[db] MongoDB connected → ${host}/${name}`);
  return mongoose.connection;
}

export default connectDB;
