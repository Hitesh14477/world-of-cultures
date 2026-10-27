import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import Country from './models/Country.js';
import CulturalEntry from './models/CulturalEntry.js';
import Place from './models/Place.js';
import User from './models/User.js';
import UserFavourite from './models/UserFavourite.js';
import CommunityPost from './models/CommunityPost.js';
import CommunityLike from './models/CommunityLike.js';
import CommunityComment from './models/CommunityComment.js';
import Notification from './models/Notification.js';
import { createMongoAuthStateStore, createMemoryAuthStateStore } from './services/authStateStore.js';
import { createCountryRouter } from './routes/countryRoutes.js';
import { createAdminRouter } from './routes/adminRoutes.js';
import { createSearchRouter } from './routes/searchRoutes.js';
import { createUserRouter } from './routes/userRoutes.js';
import { createCommunityRouter } from './routes/communityRoutes.js';
import { createUserAuth } from './middleware/userAuth.js';
import { createAdminAuth } from './middleware/adminAuth.js';
import { createMemberAuth } from './middleware/memberAuth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export function createApp({ CountryModel = Country, CulturalEntryModel = CulturalEntry, PlaceModel = Place, UserModel = User, UserFavouriteModel = UserFavourite, NotificationModel = Notification, CommunityPostModel = CommunityPost, CommunityLikeModel = CommunityLike, CommunityCommentModel = CommunityComment, communityImageStorage, adminEnv = process.env, userEnv = process.env, countryContributionAuth, authStateStore } = {}) {
  const app = express();
  const frontendOrigin = process.env.FRONTEND_ORIGIN || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173');
  if (!frontendOrigin) throw new Error('FRONTEND_ORIGIN must be configured in production.');
  let parsedOrigin;
  try { parsedOrigin = new URL(frontendOrigin) } catch { throw new Error('FRONTEND_ORIGIN must be a valid origin.') }
  if (parsedOrigin.origin !== frontendOrigin || !['http:', 'https:'].includes(parsedOrigin.protocol)) throw new Error('FRONTEND_ORIGIN must contain only the exact frontend origin.')
  if (process.env.NODE_ENV === 'production'
    && (parsedOrigin.protocol !== 'https:' || parsedOrigin.hostname === 'localhost' || parsedOrigin.hostname.endsWith('.localhost') || parsedOrigin.hostname === '::1' || parsedOrigin.hostname.startsWith('127.'))) {
    throw new Error('FRONTEND_ORIGIN must be a public HTTPS origin in production.')
  }

  const proxyHops = process.env.TRUST_PROXY_HOPS || '0';
  if (!/^\d+$/.test(proxyHops)) throw new Error('TRUST_PROXY_HOPS must be a non-negative integer.');
  app.set('trust proxy', Number(proxyHops));

  app.use(cors({
    origin(origin, callback) {
      callback(null, origin === frontendOrigin ? frontendOrigin : false);
    },
    credentials: true,
  }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (req, res) => {
    const databaseConnected = mongoose.connection.readyState === 1;
    return res.status(databaseConnected ? 200 : 503).json({
      api: 'ok',
      database: databaseConnected ? 'connected' : 'disconnected',
    });
  });

  const stateStore = authStateStore || (userEnv.NODE_ENV === 'test' || adminEnv.NODE_ENV === 'test'
    ? createMemoryAuthStateStore()
    : createMongoAuthStateStore());
  const userAuth = createUserAuth({ UserModel, env: userEnv, authStateStore: stateStore });
  const adminAuth = createAdminAuth(adminEnv, stateStore);
  const memberAuth = createMemberAuth({ userAuth: countryContributionAuth || userAuth, adminAuth, UserModel });
  app.use('/api/countries', createCountryRouter(CountryModel, CulturalEntryModel, PlaceModel, { UserModel, env: userEnv, auth: countryContributionAuth || userAuth, adminAuth, memberAuth, imageStorage: communityImageStorage }));
  app.use('/api/search', createSearchRouter({ CountryModel, CulturalEntryModel, PlaceModel }));
  app.use('/api/users', createUserRouter({ CountryModel, CulturalEntryModel, PlaceModel, CommunityPostModel, UserModel, UserFavouriteModel, NotificationModel, env: userEnv, auth: userAuth, adminAuth, memberAuth, imageStorage: communityImageStorage }));
  app.use('/api/community', createCommunityRouter({ CommunityPostModel, CommunityLikeModel, CommunityCommentModel, NotificationModel, CountryModel, UserModel, env: userEnv, imageStorage: communityImageStorage, auth: userAuth, adminAuth, memberAuth }));
  app.use('/api/admin', createAdminRouter({ CountryModel, CulturalEntryModel, PlaceModel, UserModel, NotificationModel, env: adminEnv, auth: adminAuth }));
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
