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
import { createCountryRouter } from './routes/countryRoutes.js';
import { createAdminRouter } from './routes/adminRoutes.js';
import { createSearchRouter } from './routes/searchRoutes.js';
import { createUserRouter } from './routes/userRoutes.js';
import { createCommunityRouter } from './routes/communityRoutes.js';
import { createUserAuth } from './middleware/userAuth.js';
import { createAdminAuth } from './middleware/adminAuth.js';
import { createMemberAuth } from './middleware/memberAuth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export function createApp({ CountryModel = Country, CulturalEntryModel = CulturalEntry, PlaceModel = Place, UserModel = User, UserFavouriteModel = UserFavourite, NotificationModel = Notification, CommunityPostModel = CommunityPost, CommunityLikeModel = CommunityLike, CommunityCommentModel = CommunityComment, communityImageStorage, adminEnv = process.env, userEnv = process.env, countryContributionAuth } = {}) {
  const app = express();
  const frontendOrigin = process.env.FRONTEND_ORIGIN || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173');
  if (!frontendOrigin) throw new Error('FRONTEND_ORIGIN must be configured in production.');

  app.use(cors({ origin: frontendOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (req, res) => {
    const databaseConnected = mongoose.connection.readyState === 1;
    return res.status(databaseConnected ? 200 : 503).json({
      api: 'ok',
      database: databaseConnected ? 'connected' : 'disconnected',
    });
  });

  const userAuth = createUserAuth({ UserModel, env: userEnv });
  const adminAuth = createAdminAuth(adminEnv);
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
